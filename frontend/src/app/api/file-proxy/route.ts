import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage } from '@/lib/firebaseAdminConfig';

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest) {
  // Define variables at the top level of the function so they're available in catch blocks
  let filePath: string | null = null;
  let userId: string | null = null;
  let originalDecodedPath: string = '';
  let decodedPath: string = '';
  let bucketName: string = '';
  
  try {
    const { searchParams } = new URL(request.url);
    filePath = searchParams.get('path');
    userId = searchParams.get('userId');
    const download = searchParams.get('download') === 'true';

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400, headers: corsHeaders });
    }

    console.log(`[file-proxy] Request for file: ${filePath}, userId: ${userId || 'not provided'}`);

    // Use getAdminStorage() to get the correctly initialized storage instance
    const storage = getAdminStorage();
    bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
    console.log(`[file-proxy] Using bucket name: ${bucketName}`);
    const bucket = storage.bucket(bucketName);
    
    // Decode the file path once – **do not mutate this original version** so that we attempt
    // the _exact_ path first. Some Unicode normalisations can change the underlying byte
    // sequence which leads to a "file not found" even though the object exists. We therefore
    // keep the original decoded path for the first lookup and create a _separate_ normalised
    // version for the similarity search fallback.
    originalDecodedPath = decodeURIComponent(filePath);

    // Prepare a normalised variant (used only if the exact lookup fails)
    decodedPath = originalDecodedPath
      .normalize('NFKC') // unify different unicode representations
      .replace(/\s{2,}/g, ' '); // collapse double spaces
    
    console.log(`File path (original): ${originalDecodedPath}`);
    console.log(`File path (normalised): ${decodedPath}`);
    
    // Get the file from Firebase Storage
    const file = bucket.file(originalDecodedPath);
    console.log(`[file-proxy] Attempting to access file at: gs://${bucketName}/${originalDecodedPath}`);
    
    // Check if file exists
    console.log('[file-proxy] Checking if file exists...');
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`[file-proxy] File not found: gs://${bucketName}/${originalDecodedPath}`);
      
      // Try to find a similar file if the exact match doesn't exist
      try {
        // Get parent directory path and filename parts
        const parentDir = originalDecodedPath.split('/').slice(0, -1).join('/');
        const fileName = originalDecodedPath.split('/').pop() || '';
        
        // Extract base name without timestamp (supports ASCII dash "-" and common Unicode dashes)
        // e.g. "report-1711231231231.png" or "report–1711231231231.png" → "report"
        // If no timestamp suffix is matched we fall back to original basename.
        
        // Remove extension first
        const lastDotIdx = fileName.lastIndexOf('.');
        const fileNameNoExt = lastDotIdx > -1 ? fileName.slice(0, lastDotIdx) : fileName;
        
        // Regex to capture a dash ("-", en dash, em dash) followed by 10+ digits at the end of string
        const timestampPattern = /[\-\u2013\u2014](\d{10,})$/;
        const baseName = fileNameNoExt.replace(timestampPattern, '');
        
        console.log(`[file-proxy] Original file not found. Looking for similar files with base name: ${baseName}`);
        
        // If userId is provided, use it to construct a more specific search path
        let searchPrefix = parentDir;
        if (userId && !parentDir.includes(userId)) {
          // If the path doesn't already include the userId, try looking in the user's directory
          searchPrefix = `users/${userId}`;
          console.log(`[file-proxy] Using userId to search in user's directory: ${searchPrefix}`);
        }
        
        // List files in the search directory
        const [files] = await bucket.getFiles({ prefix: searchPrefix });
        console.log(`[file-proxy] Found ${files.length} files in search directory:`);
        files.forEach(f => console.log(`- ${f.name}`));
        
        // Find files with the same base name (ignoring timestamps)
        const similarFiles = files.filter(f => {
          const name = f.name.split('/').pop() || '';
          return name.startsWith(baseName);
        });
        
        console.log(`[file-proxy] Found ${similarFiles.length} files with similar base name:`);
        similarFiles.forEach(f => console.log(`- ${f.name}`));
        
        // If we found a similar file, use the most recent one (assuming the timestamp is at the end)
        if (similarFiles.length > 0) {
          // Sort by name in descending order to get the most recent file first (assuming timestamp is at the end)
          similarFiles.sort((a, b) => b.name.localeCompare(a.name));
          const mostRecentFile = similarFiles[0];
          
          console.log(`[file-proxy] Using most recent similar file instead: ${mostRecentFile.name}`);
          
          // Instead of redirecting to a signed URL (which causes CORS issues),
          // download the file and serve it directly through our API
          console.log('[file-proxy] Downloading file content to proxy...');
          
          try {
            // Get file metadata to determine content type
            const [metadata] = await mostRecentFile.getMetadata();
            const contentType = metadata.contentType || 'application/octet-stream';
            const contentLength = metadata.size;
            
            console.log(`[file-proxy] File metadata: contentType=${contentType}, size=${contentLength}`);
            
            // Download the file
            const [fileBuffer] = await mostRecentFile.download();
            
            console.log(`[file-proxy] File downloaded successfully, size: ${fileBuffer.length} bytes`);
            
            // Create a response with the file content
            let fileName = mostRecentFile.name.split('/').pop() || 'document';
            // Sanitize filename by removing all non-ASCII characters
            fileName = fileName.replace(/[^\x00-\x7F]/g, '');
            const contentDisposition = download 
              ? `attachment; filename="${fileName}"` 
              : `inline; filename="${fileName}";`
              
            const response = new NextResponse(fileBuffer, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Content-Length': String(fileBuffer.length),
                'Content-Disposition': contentDisposition,
                'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                ...corsHeaders, // Add consistent CORS headers
              },
            });
            
            return response;
          } catch (error: any) {
            console.error('[file-proxy] Error downloading file:', error);
            return NextResponse.json(
              { error: 'Error downloading file', details: error?.message || 'Unknown error' },
              { status: 500, headers: corsHeaders }
            );
          }
        }
        
        // If we couldn't find a similar file, list all files in the bucket for diagnostics
        console.log(`[file-proxy] No similar files found. Listing ALL files in bucket for diagnostics:`);
        const [allFiles] = await bucket.getFiles();
        console.log(`[file-proxy] Found ${allFiles.length} total files in bucket:`);
        allFiles.forEach(f => console.log(`- ${f.name}`));
        
      } catch (listError) {
        console.error('[file-proxy] Error finding similar files:', listError);
      }
      
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    // Instead of redirecting to a signed URL (which causes CORS issues),
    // download the file and serve it directly through our API
    console.log('[file-proxy] Downloading file content to proxy...');
    
    try {
      // Get file metadata to determine content type
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || 'application/octet-stream';
      const contentLength = metadata.size;
      
      console.log(`[file-proxy] File metadata: contentType=${contentType}, size=${contentLength}`);
      
      // Download the file
      const [fileBuffer] = await file.download();
      
      console.log(`[file-proxy] File downloaded successfully, size: ${fileBuffer.length} bytes`);
      
      // Create a response with the file content
      const response = new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(fileBuffer.length),
          'Content-Disposition': `inline; filename="${(file.name.split('/').pop() || '').replace(/[^\x00-\x7F]/g, '')}"`,
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          ...corsHeaders, // Add consistent CORS headers
        },
      });
      
      return response;
    } catch (error: any) {
      console.error('[file-proxy] Error downloading file:', error);
      return NextResponse.json(
        { error: 'Error downloading file', details: error?.message || 'Unknown error' },
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (error: any) {
    console.error('Error in file-proxy:', error);
    console.error('Error details:', {
      code: error.code,
      message: error.message,
      stack: error.stack,
      filePath: filePath,
      userId: userId,
      bucketName: bucketName
    });
    
    // Provide more detailed error information
    let errorMessage = error.message || 'Internal server error';
    let statusCode = 500;
    
    if (error.code === 'storage/object-not-found') {
      errorMessage = 'Primary document file not found in storage';
      statusCode = 404;
      console.error('[file-proxy] File not found error details:', {
        filePath: filePath,
        decodedPath: decodedPath,
        userId: userId,
        bucketName: bucketName
      });
    } else if (error.code?.startsWith('storage/unauthorized')) {
      errorMessage = `Storage access denied: ${error.code}`;
      statusCode = 403;
      console.error('[file-proxy] Storage access denied error details:', {
        filePath: filePath,
        decodedPath: decodedPath,
        userId: userId,
        bucketName: bucketName
      });
    } else if (error.code?.startsWith('storage/')) {
      errorMessage = `Storage error: ${error.code}`;
      statusCode = 400;
      console.error('[file-proxy] Storage error details:', {
        code: error.code,
        filePath: filePath,
        decodedPath: decodedPath,
        userId: userId,
        bucketName: bucketName
      });
    }
    
    return NextResponse.json(
      { error: errorMessage, code: error.code },
      { status: statusCode, headers: corsHeaders }
    );
  }
}

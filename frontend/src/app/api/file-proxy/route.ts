import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin, getAdminDb } from '@/lib/firebaseAdminConfig';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get('path');
    const userId = searchParams.get('userId');

    if (!filePath) {
      return NextResponse.json({ error: 'No file path provided' }, { status: 400 });
    }

    console.log(`[file-proxy] Request for file: ${filePath}, userId: ${userId || 'not provided'}`);

    // Initialize Firebase Admin if needed
    const admin = getFirebaseAdmin();
    const storage = admin.storage();

    // Get the bucket with the correct name format
    const bucketName = 'web-chat-app-fa7f0.appspot.com';
    console.log(`[file-proxy] Using bucket name: ${bucketName}`);
    const bucket = storage.bucket(bucketName);
    
    // Decode the file path
    const decodedPath = decodeURIComponent(filePath);
    console.log(`File path after decoding: ${decodedPath}`);
    
    // Get the file from Firebase Storage
    const file = bucket.file(decodedPath);
    console.log(`[file-proxy] Attempting to access file at: gs://${bucketName}/${decodedPath}`);
    
    // Check if file exists
    console.log('[file-proxy] Checking if file exists...');
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`[file-proxy] File not found: gs://${bucketName}/${decodedPath}`);
      
      // Try to list files in the parent directory to help diagnose the issue
      try {
        // Get parent directory path
        const parentDir = decodedPath.split('/').slice(0, -1).join('/');
        console.log(`[file-proxy] Listing files in parent directory: ${parentDir || '/'}`);
        
        // List all files in the bucket to see what's available
        console.log(`[file-proxy] Listing ALL files in bucket for diagnostics:`);
        const [allFiles] = await bucket.getFiles();
        console.log(`[file-proxy] Found ${allFiles.length} total files in bucket:`);
        allFiles.forEach(f => console.log(`- ${f.name}`));
        
        // List files in the specific parent directory
        const [files] = await bucket.getFiles({ prefix: parentDir });
        console.log(`[file-proxy] Found ${files.length} files in parent directory:`);
        files.forEach(f => console.log(`- ${f.name}`));
        
        // Check if there are any files with similar names (without timestamp)
        const baseName = decodedPath.split('-').slice(0, -1).join('-');
        console.log(`[file-proxy] Looking for files with similar base name: ${baseName}`);
        const similarFiles = allFiles.filter(f => f.name.includes(baseName));
        console.log(`[file-proxy] Found ${similarFiles.length} files with similar base name:`);
        similarFiles.forEach(f => console.log(`- ${f.name}`));
      } catch (listError) {
        console.error('[file-proxy] Error listing files in parent directory:', listError);
      }
      
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Get the file metadata to determine content type
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // Generate a fresh signed URL with a longer expiration (7 days)
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7); // 7 days expiration
    
    console.log(`[file-proxy] Generating fresh signed URL with expiration: ${expirationDate.toISOString()}`);
    
    try {
      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: expirationDate.toISOString(),
      });
      
      console.log(`[file-proxy] Generated fresh signed URL: ${signedUrl.substring(0, 100)}...`);
      
      // Redirect to the signed URL instead of proxying the content
      return NextResponse.redirect(signedUrl);
    } catch (signUrlError) {
      console.error('[file-proxy] Error generating signed URL:', signUrlError);
      
      // Fallback to direct download if signed URL generation fails
      console.log('[file-proxy] Falling back to direct download');
      const [fileContent] = await file.download();
      
      // Return the file with the appropriate content type
      return new NextResponse(fileContent, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }
  } catch (error: any) {
    console.error('Error in file-proxy:', error);
    
    // Provide more detailed error information
    let errorMessage = error.message || 'Internal server error';
    let statusCode = 500;
    
    if (error.code === 'storage/object-not-found') {
      errorMessage = 'File not found in storage';
      statusCode = 404;
    } else if (error.code?.startsWith('storage/')) {
      errorMessage = `Storage error: ${error.code}`;
      statusCode = 400;
    }
    
    return NextResponse.json(
      { error: errorMessage, code: error.code },
      { status: statusCode }
    );
  }
}

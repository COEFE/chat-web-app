import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdminConfig';

export async function GET(request: NextRequest) {
  try {
    // Get the file path from the URL parameter
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    
    console.log(`[file-proxy] Received request for file path: ${filePath}`);
    
    if (!filePath) {
      console.log('[file-proxy] Error: No file path provided');
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin if needed
    const admin = getFirebaseAdmin();
    const storage = admin.storage();
    
    // Get the bucket name from environment variables or use default
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
    console.log(`[file-proxy] Using bucket: ${bucketName}`);
    
    // Get the bucket with the specific name
    const bucket = storage.bucket(bucketName);
    
    // Decode the file path and clean it up
    const decodedPath = decodeURIComponent(filePath);
    console.log(`[file-proxy] Decoded path: ${decodedPath}`);
    
    // Get the file from Firebase Storage
    const file = bucket.file(decodedPath);
    console.log(`[file-proxy] Attempting to access file: gs://${bucketName}/${decodedPath}`);
    
    // Check if file exists
    console.log(`[file-proxy] Checking if file exists...`);
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`[file-proxy] File not found: gs://${bucketName}/${decodedPath}`);
      
      // Try listing files in the parent directory to help diagnose the issue
      try {
        const parentDir = decodedPath.split('/').slice(0, -1).join('/');
        console.log(`[file-proxy] Listing files in parent directory: ${parentDir || '/'}`);
        const [files] = await bucket.getFiles({ prefix: parentDir });
        console.log(`[file-proxy] Found ${files.length} files in parent directory:`);
        files.forEach(f => console.log(`- ${f.name}`));
      } catch (listError) {
        console.error(`[file-proxy] Error listing files in parent directory:`, listError);
      }
      
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Get the file metadata to determine content type
    console.log(`[file-proxy] Getting file metadata...`);
    try {
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || 'application/octet-stream';
      console.log(`[file-proxy] File metadata retrieved. Content type: ${contentType}`);
      
      // Get the file content
      console.log(`[file-proxy] Downloading file content...`);
      const [fileContent] = await file.download();
      console.log(`[file-proxy] File downloaded successfully. Size: ${fileContent.byteLength} bytes`);
      
      // Return the file with the appropriate content type
      console.log(`[file-proxy] Returning file to client with content type: ${contentType}`);
      return new NextResponse(fileContent, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    } catch (downloadError) {
      console.error(`[file-proxy] Error downloading file:`, downloadError);
      throw downloadError; // Re-throw to be caught by the outer try/catch
    }
  } catch (error: any) {
    console.error('[file-proxy] Error in file-proxy:', error);
    
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

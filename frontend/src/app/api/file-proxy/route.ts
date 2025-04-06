import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebaseAdminConfig';

export async function GET(request: NextRequest) {
  try {
    // Get the file path from the URL parameter
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path');
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin if needed
    const admin = getFirebaseAdmin();
    
    // Explicitly configure the storage bucket for this route
    const storage = admin.storage();
    // Get the default bucket configured during admin initialization
    const bucket = storage.bucket();
    
    // Decode the file path
    const decodedPath = decodeURIComponent(filePath);
    console.log(`File path after decoding: ${decodedPath}`);
    
    // Get the file from Firebase Storage
    const file = bucket.file(decodedPath);
    console.log(`Attempting to access file at: gs://${bucket.name}/${decodedPath}`);
    
    // Check if file exists
    console.log('Checking if file exists...');
    const [exists] = await file.exists();
    if (!exists) {
      console.log(`File not found: gs://${bucket.name}/${decodedPath}`);
      
      // Try to list files in the parent directory to help diagnose the issue
      try {
        const parentDir = decodedPath.split('/').slice(0, -1).join('/');
        console.log(`Listing files in parent directory: ${parentDir || '/'}`);
        const [files] = await bucket.getFiles({ prefix: parentDir });
        console.log(`Found ${files.length} files in parent directory:`);
        files.forEach(f => console.log(`- ${f.name}`));
      } catch (listError) {
        console.error('Error listing files in parent directory:', listError);
      }
      
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }
    
    // Get the file metadata to determine content type
    const [metadata] = await file.getMetadata();
    const contentType = metadata.contentType || 'application/octet-stream';
    
    // Get the file content
    const [fileContent] = await file.download();
    
    // Return the file with the appropriate content type
    return new NextResponse(fileContent, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
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

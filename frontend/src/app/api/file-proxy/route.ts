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
    const storage = admin.storage();
    const bucket = storage.bucket();
    
    // Get the file from Firebase Storage
    const file = bucket.file(decodeURIComponent(filePath));
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
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
  } catch (error) {
    console.error('Error proxying file:', error);
    return NextResponse.json(
      { error: `Failed to proxy file: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

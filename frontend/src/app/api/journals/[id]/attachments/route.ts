import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { getStorage } from 'firebase-admin/storage';
import { initializeFirebaseAdmin, getAdminStorage } from '@/lib/firebaseAdminConfig';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

// GET /api/journals/:id/attachments - get all attachments for a journal entry
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const segments = req.nextUrl.pathname.split('/');
  const idStr = segments[segments.length - 2];
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }

  try {
    // Check if journal exists
    const { rows: journalRows } = await sql`
      SELECT id FROM journals WHERE id = ${id} AND is_deleted = FALSE
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    // Get attachments
    const { rows: attachments } = await sql`
      SELECT 
        id,
        file_name,
        file_url,
        file_type,
        file_size,
        uploaded_by,
        uploaded_at
      FROM 
        journal_attachments
      WHERE 
        journal_id = ${id}
      ORDER BY
        id
    `;
    
    return NextResponse.json({ attachments });
  } catch (err: any) {
    console.error(`[journals/${id}/attachments] GET error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/journals/:id/attachments - upload a new attachment for a journal entry
export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    const segments = req.nextUrl.pathname.split('/');
    const idStr = segments[segments.length - 2];
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
    }
    // Check if journal exists and is not posted or deleted
    const { rows: journalRows } = await sql`
      SELECT is_posted, is_deleted FROM journals WHERE id = ${id}
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    if (journalRows[0].is_posted) {
      return NextResponse.json({ error: 'Cannot add attachments to a posted journal entry' }, { status: 400 });
    }
    
    if (journalRows[0].is_deleted) {
      return NextResponse.json({ error: 'Cannot add attachments to a deleted journal entry' }, { status: 400 });
    }
    
    // Parse the multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    // Get file details
    const fileName = file.name;
    const fileType = file.type;
    const fileSize = file.size;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Upload to Firebase Storage
    const storage = getAdminStorage();
    
    // Determine bucket name from env vars or fallback
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
    console.log(`[journals/attachments] Using storage bucket: ${bucketName}`);
    
    const bucket = storage.bucket(bucketName);
    
    const timestamp = Date.now();
    const storagePath = `journals/${userId}/${id}/${fileName}-${timestamp}`;
    const fileRef = bucket.file(storagePath);
    
    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: fileType,
        metadata: {
          userId,
          journalId: id,
          originalName: fileName,
        },
      },
    });
    
    try {
      console.log(`Attempting to get signed URL for file at path: ${storagePath}`);
      
      // Generate a signed URL for the file
      const [signedUrl] = await fileRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      console.log(`Successfully generated signed URL: ${signedUrl.substring(0, 30)}...`);
      
      // Save attachment metadata to database
      // First check if file_path column exists in table schema
      try {
        // Try inserting with file_path included
        const { rows: attachmentRows } = await sql`
          INSERT INTO journal_attachments (
            journal_id,
            file_name,
            file_url,
            file_path,
            file_type,
            file_size,
            uploaded_by,
            uploaded_at
          ) VALUES (
            ${id},
            ${fileName},
            ${signedUrl},
            ${storagePath},
            ${fileType},
            ${fileSize},
            ${userId},
            CURRENT_TIMESTAMP
          )
          RETURNING id
        `;
        
        return NextResponse.json({
          success: true,
          attachment: {
            id: attachmentRows[0].id,
            file_name: fileName,
            file_url: signedUrl,
            file_path: storagePath,
            file_type: fileType,
            file_size: fileSize,
            uploaded_by: userId,
            uploaded_at: new Date().toISOString(),
          }
        });
      } catch (error: any) {
        // If file_path column doesn't exist, try without it
        if (error.message && error.message.includes("file_path")) {
          console.log("Falling back to insert without file_path column");
          const { rows: attachmentRows } = await sql`
            INSERT INTO journal_attachments (
              journal_id,
              file_name,
              file_url,
              file_type,
              file_size,
              uploaded_by,
              uploaded_at
            ) VALUES (
              ${id},
              ${fileName},
              ${signedUrl},
              ${fileType},
              ${fileSize},
              ${userId},
              CURRENT_TIMESTAMP
            )
            RETURNING id
          `;
          
          return NextResponse.json({
            success: true,
            attachment: {
              id: attachmentRows[0].id,
              file_name: fileName,
              file_url: signedUrl,
              file_type: fileType,
              file_size: fileSize,
              uploaded_by: userId,
              uploaded_at: new Date().toISOString(),
            }
          });
        } else {
          // If it's some other error, rethrow it
          throw error;
        }
      }
      
      // This code will never run since we return in both try and catch blocks above
      // It's kept here only for reference
      return NextResponse.json({
        error: "This should never happen - logic error"
      }, { status: 500 });
      
    } catch (error: any) {
      console.error(`[journals/${id}/attachments] Upload error:`, error);
      
      // Check for specific Firebase Storage errors
      let errorMessage = 'Failed to upload attachment';
      let statusCode = 500;
      
      if (error.code === 'storage/bucket-not-found') {
        errorMessage = 'Storage bucket not found. Please check Firebase configuration.';
      } else if (error.code === 'storage/unauthorized') {
        errorMessage = 'Unauthorized access to storage bucket.';
        statusCode = 403;
      } else if (error.code === 'storage/invalid-argument') {
        errorMessage = 'Invalid storage configuration.';
        statusCode = 400;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return NextResponse.json({ 
        error: errorMessage,
        details: error.code ? { code: error.code } : undefined 
      }, { status: statusCode });
    }
  } catch (err: any) {
    console.error(`[journals/attachments] POST error:`, err);
    return NextResponse.json({
      error: err.message || 'Unknown server error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      details: err.code ? { code: err.code } : undefined
    }, { status: 500 });
  }
}

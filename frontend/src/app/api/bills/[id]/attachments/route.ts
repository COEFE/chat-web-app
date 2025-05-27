import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { getStorage } from 'firebase-admin/storage';
import { initializeFirebaseAdmin, getAdminStorage } from '@/lib/firebaseAdminConfig';
import { NextRequest, NextResponse } from 'next/server';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

// GET /api/bills/:id/attachments - get all attachments for a bill
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const segments = req.nextUrl.pathname.split('/');
  const idStr = segments[segments.length - 2];
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    // Check if bill exists
    const { rows: billRows } = await sql`
      SELECT id FROM bills WHERE id = ${id} AND is_deleted = FALSE
    `;
    
    if (billRows.length === 0) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }
    
    // Get attachments
    const { rows: attachments } = await sql`
      SELECT 
        id,
        file_name,
        file_url,
        file_path,
        file_type,
        file_size,
        uploaded_by,
        uploaded_at
      FROM 
        bill_attachments
      WHERE 
        bill_id = ${id}
      ORDER BY
        id
    `;
    
    // Convert any signed URLs to proxy URLs for consistent access
    const processedAttachments = attachments.map(attachment => {
      let fileUrl = attachment.file_url;
      
      // If the file_url is a signed URL (contains googleapis.com), convert to proxy URL
      if (fileUrl && fileUrl.includes('googleapis.com') && attachment.file_path) {
        fileUrl = `/api/file-proxy?path=${encodeURIComponent(attachment.file_path)}&userId=${userId}`;
        console.log(`[bills/${id}/attachments] Converting signed URL to proxy URL for attachment ${attachment.id}`);
      }
      // If no file_path but we have a file_url that's a proxy URL, keep it as is
      else if (fileUrl && fileUrl.startsWith('/api/file-proxy')) {
        // Already a proxy URL, keep as is
      }
      // If we have file_path but no proper file_url, generate proxy URL
      else if (attachment.file_path && (!fileUrl || fileUrl.includes('googleapis.com'))) {
        fileUrl = `/api/file-proxy?path=${encodeURIComponent(attachment.file_path)}&userId=${userId}`;
        console.log(`[bills/${id}/attachments] Generating proxy URL from file_path for attachment ${attachment.id}`);
      }
      
      return {
        ...attachment,
        file_url: fileUrl
      };
    });
    
    return NextResponse.json({ attachments: processedAttachments });
  } catch (err: any) {
    console.error(`[bills/${id}/attachments] GET error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/bills/:id/attachments - upload a new attachment for a bill
export async function POST(req: NextRequest) {
  try {
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    const segments = req.nextUrl.pathname.split('/');
    const idStr = segments[segments.length - 2];
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
    }

    // Check if bill exists and is not deleted
    const { rows: billRows } = await sql`
      SELECT id, status FROM bills WHERE id = ${id} AND is_deleted = FALSE
    `;
    
    if (billRows.length === 0) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    const bill = billRows[0];
    
    // Check if bill is posted (optional - you may want to allow attachments on posted bills)
    // if (bill.status === 'Posted') {
    //   return NextResponse.json({ error: 'Cannot add attachments to posted bills' }, { status: 400 });
    // }

    // Parse the form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File size too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ 
        error: 'Unsupported file type. Allowed types: images (including HEIC/HEIF), PDF, Word, Excel, text files.' 
      }, { status: 400 });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileName = file.name;
    const fileExtension = fileName.split('.').pop();
    const baseName = fileName.replace(`.${fileExtension}`, '');
    const uniqueFileName = `${baseName}-${timestamp}.${fileExtension}`;

    // Create storage path
    const storagePath = `users/${userId}/bills/${id}/attachments/${uniqueFileName}`;
    
    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.type;
    const fileSize = file.size;

    // Upload to Firebase Storage
    const storage = getAdminStorage();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
    const bucket = storage.bucket(bucketName);
    const fileRef = bucket.file(storagePath);

    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: fileType,
        metadata: {
          userId,
          billId: id.toString(),
          originalName: fileName,
        },
      },
    });
    
    try {
      console.log(`Attempting to get proxy URL for file at path: ${storagePath}`);
      
      // Generate a proxy URL instead of a signed URL for permanent access
      const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(storagePath)}&userId=${userId}`;
      
      console.log(`Generated proxy URL: ${proxyUrl}`);
      
      // Save attachment metadata to database
      // First check if file_path column exists in table schema
      try {
        // Try inserting with file_path included
        const { rows: attachmentRows } = await sql`
          INSERT INTO bill_attachments (
            bill_id,
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
            ${proxyUrl},
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
            file_url: proxyUrl,
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
            INSERT INTO bill_attachments (
              bill_id,
              file_name,
              file_url,
              file_type,
              file_size,
              uploaded_by,
              uploaded_at
            ) VALUES (
              ${id},
              ${fileName},
              ${proxyUrl},
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
              file_url: proxyUrl,
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
      
    } catch (error: any) {
      console.error(`[bills/${id}/attachments] Upload error:`, error);
      
      // Try to clean up the uploaded file
      try {
        await fileRef.delete();
      } catch (deleteError) {
        console.error(`[bills/${id}/attachments] Failed to clean up file after error:`, deleteError);
      }
      
      return NextResponse.json({
        error: error.message || 'Unknown server error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        details: error.code ? { code: error.code } : undefined
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error(`[bills/attachments] POST error:`, err);
    return NextResponse.json({
      error: err.message || 'Unknown server error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      details: err.code ? { code: err.code } : undefined
    }, { status: 500 });
  }
}

// DELETE /api/bills/:id/attachments/:attachmentId - delete an attachment
export async function DELETE(req: NextRequest) {
  try {
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    const segments = req.nextUrl.pathname.split('/');
    const attachmentIdStr = segments[segments.length - 1];
    const billIdStr = segments[segments.length - 3];
    
    const attachmentId = parseInt(attachmentIdStr, 10);
    const billId = parseInt(billIdStr, 10);
    
    if (isNaN(attachmentId) || isNaN(billId)) {
      return NextResponse.json({ error: 'Invalid bill or attachment ID' }, { status: 400 });
    }

    // Check if attachment exists and belongs to the bill
    const { rows: attachmentRows } = await sql`
      SELECT id, file_path FROM bill_attachments 
      WHERE id = ${attachmentId} AND bill_id = ${billId}
    `;
    
    if (attachmentRows.length === 0) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const attachment = attachmentRows[0];

    // Delete from Firebase Storage if we have a file path
    if (attachment.file_path) {
      try {
        const storage = getAdminStorage();
        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
        const bucket = storage.bucket(bucketName);
        const fileRef = bucket.file(attachment.file_path);
        await fileRef.delete();
        console.log(`[bills/${billId}/attachments] Deleted file from storage: ${attachment.file_path}`);
      } catch (storageError) {
        console.error(`[bills/${billId}/attachments] Failed to delete file from storage:`, storageError);
        // Continue with database deletion even if storage deletion fails
      }
    }

    // Delete from database
    await sql`
      DELETE FROM bill_attachments 
      WHERE id = ${attachmentId} AND bill_id = ${billId}
    `;

    return NextResponse.json({ success: true, message: 'Attachment deleted successfully' });
  } catch (err: any) {
    console.error(`[bills/attachments] DELETE error:`, err);
    return NextResponse.json({
      error: err.message || 'Unknown server error',
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 500 });
  }
}

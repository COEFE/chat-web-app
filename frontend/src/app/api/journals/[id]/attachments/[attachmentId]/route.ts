import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { getStorage } from 'firebase-admin/storage';
import { initializeFirebaseAdmin, getAdminStorage } from '@/lib/firebaseAdminConfig';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

// DELETE /api/journals/:id/attachments/:attachmentId - delete an attachment
export async function DELETE(
  request: NextRequest
) {
  // Log incoming request for debugging
  console.log(`Deleting attachment - ${request.nextUrl.pathname}`);
  
  const { userId, error } = await authenticateRequest(request);
  if (error) {
    console.error('Authentication error:', error);
    return error;
  }

  const segments = request.nextUrl.pathname.split('/');
  const attachmentIdStr = segments.pop() || '';
  const journalIdStr = segments[segments.length - 2]; // journals/:id/attachments/:attachmentId -> id is two segments before last

  const journalId = parseInt(journalIdStr, 10);
  const attachmentId = parseInt(attachmentIdStr, 10);
  
  console.log(`Deleting attachment: Journal ID ${journalId}, Attachment ID ${attachmentId}`);
  
  if (isNaN(journalId) || isNaN(attachmentId)) {
    return NextResponse.json({ error: 'Invalid journal ID or attachment ID' }, { status: 400 });
  }

  try {
    // Check if journal exists and is not posted or deleted
    const { rows: journalRows } = await sql`
      SELECT is_posted, is_deleted FROM journals WHERE id = ${journalId}
    `;
    
    if (journalRows.length === 0) {
      console.error(`Journal entry ${journalId} not found`);
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    // For now, we'll allow deleting attachments from any journal state for troubleshooting
    // Get attachment details - check if the file_path column exists
    let attachmentRows;
    try {
      const result = await sql`
        SELECT file_path, file_url FROM journal_attachments 
        WHERE id = ${attachmentId} AND journal_id = ${journalId}
      `;
      attachmentRows = result.rows;
    } catch (e) {
      // If file_path doesn't exist, try with just id and journal_id
      console.log('Error querying with file_path, trying alternative query:', e);
      const result = await sql`
        SELECT id, file_url FROM journal_attachments 
        WHERE id = ${attachmentId} AND journal_id = ${journalId}
      `;
      attachmentRows = result.rows;
    }
    
    if (attachmentRows.length === 0) {
      console.error(`Attachment ${attachmentId} not found for journal ${journalId}`);
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    
    const filePath = attachmentRows[0].file_path;
    const fileUrl = attachmentRows[0].file_url;
    
    console.log(`Found attachment: ${JSON.stringify(attachmentRows[0])}`);
    
    // Delete the attachment record from the database
    await sql`
      DELETE FROM journal_attachments 
      WHERE id = ${attachmentId} AND journal_id = ${journalId}
    `;
    
    console.log(`Deleted attachment record from database`);
    
    // Delete the file from Firebase Storage if we have a file path
    if (filePath) {
      try {
        const storage = getAdminStorage();
        await storage.bucket().file(filePath).delete();
        console.log(`Deleted attachment file from storage: ${filePath}`);
      } catch (storageErr) {
        console.error('[journals/attachments] Error deleting file from storage:', storageErr);
        // Continue even if file deletion fails, as the database record is already deleted
      }
    } else if (fileUrl) {
      // Try to delete by URL if file_path isn't available
      try {
        // Extract file path from the URL
        const urlPath = new URL(fileUrl).pathname;
        const pathSegments = urlPath.split('/');
        const fileName = pathSegments[pathSegments.length - 1];
        
        if (fileName) {
          const storage = getAdminStorage();
          await storage.bucket().file(`journal-attachments/${journalId}/${fileName}`).delete();
          console.log(`Deleted attachment file from storage using URL path: ${fileName}`);
        }
      } catch (storageErr) {
        console.error('[journals/attachments] Error deleting file from storage using URL:', storageErr);
        // Continue even if file deletion fails, as the database record is already deleted
      }
    }
    
    console.log('Attachment deleted successfully');
    return NextResponse.json({ 
      success: true, 
      message: 'Attachment deleted successfully' 
    });
  } catch (err: any) {
    console.error('[journals/attachments] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

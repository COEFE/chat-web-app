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
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  const segments = request.nextUrl.pathname.split('/');
  const attachmentIdStr = segments.pop() || '';
  const journalIdStr = segments[segments.length - 2]; // journals/:id/attachments/:attachmentId -> id is two segments before last

  const journalId = parseInt(journalIdStr, 10);
  const attachmentId = parseInt(attachmentIdStr, 10);
  
  if (isNaN(journalId) || isNaN(attachmentId)) {
    return NextResponse.json({ error: 'Invalid journal ID or attachment ID' }, { status: 400 });
  }

  try {
    // Check if journal exists and is not posted or deleted
    const { rows: journalRows } = await sql`
      SELECT is_posted, is_deleted FROM journals WHERE id = ${journalId}
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    if (journalRows[0].is_posted) {
      return NextResponse.json({ error: 'Cannot remove attachments from a posted journal entry' }, { status: 400 });
    }
    
    if (journalRows[0].is_deleted) {
      return NextResponse.json({ error: 'Cannot remove attachments from a deleted journal entry' }, { status: 400 });
    }
    
    // Get attachment details
    const { rows: attachmentRows } = await sql`
      SELECT file_path FROM journal_attachments 
      WHERE id = ${attachmentId} AND journal_id = ${journalId}
    `;
    
    if (attachmentRows.length === 0) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    
    const filePath = attachmentRows[0].file_path;
    
    // Delete the attachment record from the database
    await sql`
      DELETE FROM journal_attachments 
      WHERE id = ${attachmentId} AND journal_id = ${journalId}
    `;
    
    // Delete the file from Firebase Storage
    try {
      const storage = getAdminStorage();
      await storage.bucket().file(filePath).delete();
    } catch (storageErr) {
      console.error('[journals/attachments] Error deleting file from storage:', storageErr);
      // Continue even if file deletion fails, as the database record is already deleted
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Attachment deleted successfully' 
    });
  } catch (err: any) {
    console.error('[journals/attachments] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

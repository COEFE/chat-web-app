import { sql } from '@vercel/postgres';
import { initializeFirebaseAdmin, getAdminStorage } from '@/lib/firebaseAdminConfig';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

interface SaveReceiptJournalAttachmentParams {
  journalId: number;
  userId: string;
  receiptImageData: string; // base64 image data
  fileName: string;
  fileType: string;
}

/**
 * Save a receipt image as an attachment to a journal entry
 * This is used by the ReceiptAgent when creating journal entries from receipt images
 */
export async function saveReceiptAsJournalAttachment({
  journalId,
  userId,
  receiptImageData,
  fileName,
  fileType
}: SaveReceiptJournalAttachmentParams): Promise<{ success: boolean; error?: string; attachmentId?: number }> {
  try {
    console.log(`[journalAttachments] Saving receipt image as attachment for journal ${journalId}`);

    // Validate inputs
    if (!journalId || !userId || !receiptImageData || !fileName) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Check if journal exists and is not posted (unless it's from a bill)
    const { rows: journalRows } = await sql`
      SELECT id, is_posted, source FROM journals WHERE id = ${journalId} AND is_deleted = FALSE
    `;
    
    if (journalRows.length === 0) {
      return { success: false, error: 'Journal entry not found' };
    }

    // Allow attachments for bill-created journals even if posted, but not for other posted journals
    const journal = journalRows[0];
    if (journal.is_posted && journal.source !== 'bill_create') {
      return { success: false, error: 'Cannot add attachments to a posted journal entry' };
    }

    // Convert base64 to buffer
    let fileBuffer: Buffer;
    try {
      // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
      const base64Data = receiptImageData.includes(',') 
        ? receiptImageData.split(',')[1] 
        : receiptImageData;
      fileBuffer = Buffer.from(base64Data, 'base64');
    } catch (error) {
      console.error(`[journalAttachments] Error converting base64 to buffer:`, error);
      return { success: false, error: 'Invalid image data format' };
    }

    // Generate unique file name with timestamp
    const timestamp = Date.now();
    const fileExtension = fileName.split('.').pop() || 'jpg';
    const uniqueFileName = `receipt-${fileName.replace(/\.[^/.]+$/, "")}-${timestamp}.${fileExtension}`;
    
    // Upload to Firebase Storage
    const storage = getAdminStorage();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
    const bucket = storage.bucket(bucketName);
    const filePath = `users/${userId}/journals/${journalId}/attachments/${uniqueFileName}`;
    const file = bucket.file(filePath);

    try {
      await file.save(fileBuffer, {
        metadata: {
          contentType: fileType,
          metadata: {
            uploadedBy: userId,
            originalFileName: fileName,
            journalId: journalId.toString()
          }
        }
      });

      console.log(`[journalAttachments] Uploaded receipt image to storage: ${filePath}`);
    } catch (uploadError) {
      console.error(`[journalAttachments] Error uploading to Firebase Storage:`, uploadError);
      return { success: false, error: 'Failed to upload file to storage' };
    }

    // Generate signed URL for the file
    let fileUrl: string;
    try {
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // 1 year from now
      });
      fileUrl = url;
    } catch (urlError) {
      console.error(`[journalAttachments] Error generating signed URL:`, urlError);
      return { success: false, error: 'Failed to generate file URL' };
    }

    // Save attachment metadata to database
    try {
      const { rows: attachmentRows } = await sql`
        INSERT INTO journal_attachments (
          journal_id,
          file_name,
          file_url,
          file_path,
          file_type,
          file_size,
          uploaded_by,
          user_id
        ) VALUES (
          ${journalId},
          ${fileName},
          ${fileUrl},
          ${filePath},
          ${fileType},
          ${fileBuffer.length},
          ${userId},
          ${userId}
        )
        RETURNING id
      `;

      const attachmentId = attachmentRows[0].id;
      console.log(`[journalAttachments] Saved attachment metadata with ID: ${attachmentId}`);

      return { 
        success: true, 
        attachmentId: attachmentId 
      };

    } catch (dbError) {
      console.error(`[journalAttachments] Error saving attachment metadata:`, dbError);
      
      // Try to clean up the uploaded file if database save failed
      try {
        await file.delete();
        console.log(`[journalAttachments] Cleaned up uploaded file after database error`);
      } catch (cleanupError) {
        console.error(`[journalAttachments] Error cleaning up file:`, cleanupError);
      }
      
      return { success: false, error: 'Failed to save attachment metadata' };
    }

  } catch (error) {
    console.error(`[journalAttachments] Unexpected error:`, error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

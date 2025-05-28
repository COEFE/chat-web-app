import { sql } from '@vercel/postgres';
import { initializeFirebaseAdmin, getAdminStorage } from '@/lib/firebaseAdminConfig';

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

interface SaveReceiptAttachmentParams {
  billId: number;
  userId: string;
  receiptImageData: string; // base64 image data
  fileName: string;
  fileType: string;
}

/**
 * Save a receipt image as an attachment to a bill
 * This is used by the ReceiptAgent when creating bills from receipt images
 */
export async function saveReceiptAsBillAttachment({
  billId,
  userId,
  receiptImageData,
  fileName,
  fileType
}: SaveReceiptAttachmentParams): Promise<{ success: boolean; error?: string; attachmentId?: number }> {
  try {
    console.log(`[billAttachments] Saving receipt image as attachment for bill ${billId}`);

    // Validate inputs
    if (!billId || !userId || !receiptImageData || !fileName) {
      return { success: false, error: 'Missing required parameters' };
    }

    // Check if bill exists
    const { rows: billRows } = await sql`
      SELECT id FROM bills WHERE id = ${billId} AND is_deleted = FALSE
    `;
    
    if (billRows.length === 0) {
      return { success: false, error: 'Bill not found' };
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
      console.error('[billAttachments] Failed to convert base64 to buffer:', error);
      return { success: false, error: 'Invalid image data format' };
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const fileExtension = fileName.split('.').pop() || 'jpg';
    const baseName = fileName.replace(`.${fileExtension}`, '');
    const uniqueFileName = `receipt-${baseName}-${timestamp}.${fileExtension}`;

    // Create storage path
    const storagePath = `users/${userId}/bills/${billId}/attachments/${uniqueFileName}`;
    
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
          billId: billId.toString(),
          originalName: fileName,
          source: 'receipt_agent',
        },
      },
    });

    console.log(`[billAttachments] Uploaded receipt image to storage: ${storagePath}`);

    // Generate a proxy URL for permanent access
    const proxyUrl = `/api/file-proxy?path=${encodeURIComponent(storagePath)}&userId=${userId}`;

    // Save attachment metadata to database
    try {
      const { rows: attachmentRows } = await sql`
        INSERT INTO bill_attachments (
          bill_id,
          file_name,
          file_url,
          file_path,
          file_type,
          file_size,
          user_id,
          uploaded_by,
          uploaded_at
        ) VALUES (
          ${billId},
          ${uniqueFileName},
          ${proxyUrl},
          ${storagePath},
          ${fileType},
          ${fileBuffer.length},
          ${userId},
          ${userId},
          CURRENT_TIMESTAMP
        )
        RETURNING id
      `;

      const attachmentId = attachmentRows[0].id;
      console.log(`[billAttachments] Saved attachment metadata with ID: ${attachmentId}`);

      return { 
        success: true, 
        attachmentId 
      };
    } catch (dbError: any) {
      console.error('[billAttachments] Database error:', dbError);
      
      // Try to clean up the uploaded file
      try {
        await fileRef.delete();
        console.log(`[billAttachments] Cleaned up uploaded file after database error`);
      } catch (deleteError) {
        console.error(`[billAttachments] Failed to clean up file after database error:`, deleteError);
      }
      
      return { 
        success: false, 
        error: `Database error: ${dbError.message}` 
      };
    }
  } catch (error: any) {
    console.error('[billAttachments] Error saving receipt attachment:', error);
    return { 
      success: false, 
      error: `Failed to save receipt attachment: ${error.message}` 
    };
  }
}

/**
 * Get all attachments for a bill
 */
export async function getBillAttachments(billId: number, userId: string): Promise<any[]> {
  try {
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
        bill_id = ${billId}
      ORDER BY
        id
    `;

    // Convert any signed URLs to proxy URLs for consistent access
    const processedAttachments = attachments.map(attachment => {
      let fileUrl = attachment.file_url;
      
      // If the file_url is a signed URL (contains googleapis.com), convert to proxy URL
      if (fileUrl && fileUrl.includes('googleapis.com') && attachment.file_path) {
        fileUrl = `/api/file-proxy?path=${encodeURIComponent(attachment.file_path)}&userId=${userId}`;
      }
      // If we have file_path but no proper file_url, generate proxy URL
      else if (attachment.file_path && (!fileUrl || fileUrl.includes('googleapis.com'))) {
        fileUrl = `/api/file-proxy?path=${encodeURIComponent(attachment.file_path)}&userId=${userId}`;
      }
      
      return {
        ...attachment,
        file_url: fileUrl
      };
    });

    return processedAttachments;
  } catch (error: any) {
    console.error('[billAttachments] Error getting bill attachments:', error);
    return [];
  }
}

import { db, auth } from '@/lib/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ensureEmailTemplatesExist } from './emailTemplates';

// Import getUserData directly from the source file to avoid circular dependencies
import { getUserData } from '@/lib/firebase/user';

/**
 * Simple interface for email data following Firebase Email Extension docs
 * From: https://firebase.google.com/docs/extensions/official/firestore-send-email
 */
interface EmailData {
  to: string | string[];
  message: {
    subject: string;
    text: string;
    html: string;
  };
  attachments?: any[];
  template?: {
    name: string;
    data: Record<string, any>;
  };
}

/**
 * Sends an email using the Firebase Extension
 * 
 * @param emailData - The email data to send
 * @returns A promise that resolves with the document ID of the created email
 */
export const sendEmail = async (emailData: EmailData): Promise<string> => {
  try {
    // IMPORTANT: Exact collection name from the extension config - has a typo 'emai_shares'
    const mailCollection = 'emai_shares';
    console.log(`Creating email document in ${mailCollection} collection`);
    
    // Format email data exactly according to Firebase Email Extension documentation
    // See: https://firebase.google.com/docs/extensions/official/firestore-send-email
    
    // CRITICAL: Document structure must EXACTLY match what the Firebase Email Extension expects
    // See error "TypeError: Cannot read properties of undefined (reading 'attachments')"
    
    // Ensure recipient is ALWAYS an array - this is critical
    const recipientArray = Array.isArray(emailData.to) ? emailData.to : [emailData.to];
    
    // Create document with exact structure required by the extension
    const docData: any = {
      // Recipients must be an array
      to: recipientArray,
      
      // Message fields in this exact structure
      message: {
        subject: emailData.message.subject,
        text: emailData.message.text,
        html: emailData.message.html,
      },
      
      // REQUIRED: Attachments must be defined and at the top level
      attachments: [],
      
      // Metadata
      createdAt: serverTimestamp(),
    };
    
    // Add template if provided (also top-level property)
    if (emailData.template) {
      docData.template = emailData.template;
    }
    
    // Log the structure we're about to send
    console.log('Email document structure:', JSON.stringify(docData, null, 2));
    
    // Add the document to the collection
    const emailsRef = collection(db, mailCollection);
    const emailDoc = await addDoc(emailsRef, docData);
    
    console.log('Email document created with ID:', emailDoc.id);
    return emailDoc.id;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Sends a share invitation email
 * 
 * @param shareId - The ID of the share
 * @param recipientEmail - The email address of the recipient
 * @param documentName - The name of the shared document
 * @returns A promise that resolves when the email is sent
 */
export const sendShareInvite = async (
  shareId: string,
  recipientEmail: string,
  documentName: string
): Promise<string> => {
  try {
    // Try to ensure email templates exist, but continue even if it fails
    await ensureEmailTemplatesExist().catch(err => {
      console.log('Continuing with inline email template');
    });
    
    // Get the current user's data for personalization
    const userData = await getUserData();
    const senderName = userData?.displayName || 'A user';
    
    // Generate the share URL - ensure we use a production URL, not localhost
    let baseUrl = '';
    
    if (typeof window !== 'undefined') {
      // Check if we're on localhost
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        // Use production URL for emails when developing locally
        baseUrl = 'https://chat-web-app.vercel.app';
      } else {
        // Use the current host in production
        baseUrl = `${window.location.protocol}//${window.location.host}`;
      }
    } else {
      // Server-side fallback
      baseUrl = 'https://chat-web-app.vercel.app';
    }
    
    const shareUrl = `${baseUrl}/share/${shareId}`;
    
    // Prepare email content
    const subject = `${senderName} shared a document with you: ${documentName}`;
    const text = `
Hello,

${senderName} has shared the document "${documentName}" with you.

You can access it using this link: ${shareUrl}

Thanks,
Document Sharing Service
`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { border: 1px solid #ddd; border-radius: 5px; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
    .footer { border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; }
    .note { background-color: #f8f9fa; padding: 10px; margin: 15px 0; border-left: 4px solid #ddd; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>Document Shared With You</h2>
    </div>
    
    <p>Hello,</p>
    
    <p>${senderName} has shared the document <strong>"${documentName}"</strong> with you.</p>
    
    <p style="margin: 25px 0; text-align: center;">
      <a href="${shareUrl}" class="button">View Document</a>
    </p>
    
    <div class="footer">
      <p>This is an automated message from Document Sharing Service.</p>
    </div>
  </div>
</body>
</html>
`;
    
    // Log what we're about to send for debugging
    console.log('Sending share invitation email with the following structure:');
    console.log({
      to: recipientEmail,
      message: { subject, text, html },
      template: { name: 'document-share', data: { senderName, documentName, shareUrl } }
    });
    
    // Send the email with the EXACT structure required by the Firebase Email Extension
    return await sendEmail({
      to: recipientEmail,
      message: {
        subject: subject,
        text: text,
        html: html
      },
      template: {
        name: 'document-share',
        data: {
          senderName,
          documentName,
          shareUrl,
          expirationText: '',
          passwordText: ''
        }
      }
    });
  } catch (error) {
    console.error('Error sending share invitation:', error);
    throw new Error(`Failed to send share invitation: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

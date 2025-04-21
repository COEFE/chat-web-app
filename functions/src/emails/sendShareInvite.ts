import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import {getFirestore, FieldValue} from "firebase-admin/firestore";

// Initialize Firestore
const db = getFirestore();

// Interface for sendShareInvite request data
export interface SendShareInviteRequestData {
  shareId: string;
  recipientEmail: string;
  documentName: string;
}

/**
 * Cloud function that sends an email invitation for a shared document.
 * Configured with extra memory for email operations.
 */
export const sendShareInvite = onCall(
  {memory: "512MiB"},
  async (request) => {
    // Extract request data
    const {shareId, documentName, recipientEmail} = request.data;
    const userId = request.auth?.uid;

    logger.info("Received sendShareInvite request", {
      data: request.data,
      auth: request.auth,
    });

    // Authentication check
    if (!userId) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to send invitations."
      );
    }

    // Validate required parameters
    if (!shareId || !documentName || !recipientEmail) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required parameters: shareId, documentName, or recipientEmail"
      );
    }

    try {
      // 1. Get the share data
      const shareRef = db.collection("shares").doc(shareId);
      const shareDoc = await shareRef.get();

      if (!shareDoc.exists) {
        throw new HttpsError("not-found", "Share not found");
      }

      const shareData = shareDoc.data();

      if (!shareData) {
        throw new HttpsError("internal", "Share data is missing");
      }

      // 2. Get the sender's user info for personalization
      let senderName = "A user";

      try {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.displayName) {
          senderName = userData.displayName;
        } else {
          logger.warn(`No user data found in Firestore for user ${userId}, using fallback name`);
        }
      } catch (error) {
        logger.warn("Error getting user data, using fallback sender name", error);
        // Continue with the fallback name
      }

      // 3. Generate the share link (use environment variable or fallback)
      const FRONTEND_URL = process.env.FRONTEND_URL || "https://chat-web-app-mu.vercel.app";
      const shareUrl = `${FRONTEND_URL}/shared/${shareId}`;

      // 4. Prepare the email template
      const expirationText = shareData.expiresAt ?
        `This link will expire on ${new Date(shareData.expiresAt).toLocaleDateString()}.` :
        "This link does not expire.";

      const passwordText = shareData.password ?
        "Note: This document is password protected. You will need to enter the password to access it." :
        "";

      // 5. Send the email using Firebase Email Extension
      // Note: We add the document directly to the email_shares collection
      // which will trigger the Firebase Email Extension to send the email

      // Use the correct collection name
      const mailCollection = "emai_shares"; // Collection name configured in the extension (note: has a typo)

      // Email text content
      const textContent = `
Hello,

${senderName} has shared the document "${documentName}" with you.

You can access it using this link: ${shareUrl}

If the button doesn't work, copy and paste this URL into your browser: ${shareUrl}

${expirationText}
${passwordText}

Thanks,
Document Sharing Service
`;

      // Email HTML content
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .container { border: 1px solid #ddd; border-radius: 5px; padding: 20px; }
    .header { border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
    .footer { border-top: 1px solid #eee; padding-top: 10px; margin-top: 20px; font-size: 12px; color: #777; }
    .button { display: inline-block; padding: 10px 20px; background-color: #1E90FF; color: #FFFFFF; text-decoration: none; border-radius: 4px; }
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
      <a href="${shareUrl}" class="button" target="_blank" rel="noopener">View Document</a>
    </p>
    
    <p class="note">
      ${expirationText}<br>
      ${passwordText ? passwordText + "<br>" : ""}
    </p>
    
    <div class="footer">
      <p>This is an automated message from Document Sharing Service.</p>
    </div>
  </div>
</body>
</html>
`;

      // Create the email document with the structure required by the Firebase Email Extension
      // See: https://firebase.google.com/docs/extensions/official/firestore-send-email
      const emailRef = await db.collection(mailCollection).add({
        to: [recipientEmail], // Must be an array
        message: {
          subject: `${senderName} shared a document with you: ${documentName}`,
          text: textContent,
          html: htmlContent,
        },
        attachments: [], // Required by the extension
        template: {
          name: "document-share",
          data: {
            senderName,
            documentName,
            shareUrl,
            expirationText,
            passwordText,
          },
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: userId,
      });

      logger.info("Email document created with ID:", emailRef.id);

      // 6. Record the invitation in the database (optional)
      await shareRef.update({
        invitations: FieldValue.arrayUnion({
          email: recipientEmail,
          sentAt: Date.now(),
          sentBy: userId,
        }),
      });

      // Return a success response
      return {
        success: true,
        messageId: "message-sent",
        service: "amazon-ses",
        email: recipientEmail,
      };
    } catch (error) {
      logger.error(`Error sending email invitation for share ${shareId}:`, error);

      // Format error response
      if (error instanceof HttpsError) {
        throw error; // Re-throw HttpsErrors directly
      } else {
        const err = error as Error;
        throw new HttpsError(
          "internal",
          `Email sending failed: ${err.message}. Please check your email configuration.`,
          err.stack
        );
      }
    }
  }
);

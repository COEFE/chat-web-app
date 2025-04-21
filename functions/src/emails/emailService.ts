/**
 * Email Service using Firebase Email Extension
 *
 * Instead of directly sending emails via an SMTP service,
 * this service uses the Firebase Email Extension which sends emails
 * based on documents added to a Firestore collection.
 */

import * as admin from "firebase-admin";
import {getFirestore} from "firebase-admin/firestore";
import {logger} from "firebase-functions/v2";

// Initialize Firestore if not already initialized
const db = getFirestore();

// Email collection name used by the Firebase Email Extension
// IMPORTANT: There's a typo in the extension configuration (missing 'l')
const EMAIL_COLLECTION = "emai_shares";

// Types for email options
export interface EmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  from?: string;
  template?: {
    name: string;
    data: Record<string, any>;
  };
}

/**
 * Sends an email using the Firebase Email Extension
 *
 * @param {EmailOptions} options - Email options including recipient, subject, and content
 * @return {Promise<string>} The ID of the created email document
 */
export const sendEmail = async (options: EmailOptions): Promise<string> => {
  try {
    // CRITICAL: Format recipient as array if it's a string
    // This is required by the Firebase Email Extension
    const recipients = Array.isArray(options.to) ? options.to : [options.to];

    logger.info("Sending email via Firebase Email Extension", {
      to: recipients,
      subject: options.subject,
      hasTemplate: Boolean(options.template),
    });

    // Create the email document with structure required by the Firebase Email Extension
    // Use 'any' type to avoid TypeScript errors with dynamic properties
    const emailDoc: any = {
      to: recipients,
      message: {
        subject: options.subject,
        text: options.text,
        html: options.html,
      },
      attachments: [], // Required by the extension
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add template if provided
    if (options.template) {
      emailDoc.template = options.template;
    }

    // Add the document to the collection to trigger the email sending
    const docRef = await db.collection(EMAIL_COLLECTION).add(emailDoc);

    // Log success
    logger.info("Email document created successfully", {
      docId: docRef.id,
    });

    return docRef.id;
  } catch (error) {
    // Log the error with detailed information
    const typedError = error as Error & { code?: string; command?: string };
    logger.error("Error creating email document:", {
      message: typedError.message,
      code: typedError.code,
      command: typedError.command,
      stack: typedError.stack,
    });

    throw error;
  }
};

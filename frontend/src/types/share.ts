/**
 * Types for document and chat history sharing functionality
 */

/**
 * Share options for creating a new share link via the frontend.
 */
export interface ShareOptions {
  documentId: string;
  includeChat: boolean;
  accessType: "view" | "comment"; // For future use, default to 'view'
  expirationDays: number | null; // Number of days until expiration, null for never
  password?: string; // Optional password
}

/**
 * Represents the structure of a share document stored in Firestore.
 * Contains sensitive info like passwordHash, not intended for direct client use.
 */
export interface ShareDocument {
  id: string; // Share ID (document ID in Firestore shares collection)
  userId: string; // ID of the user who created the share
  documentId: string; // ID of the original document in the user's documents collection
  originalDocumentName: string; // Store the original name at time of share for display
  includeChat: boolean;
  accessType: "view" | "comment";
  createdAt: any; // Firestore Server Timestamp (will be Timestamp object)
  expiresAt: any | null; // Firestore Server Timestamp or null
  passwordHash?: string; // Hashed password (only stored if password is set)
}

/**
 * Represents the details of a share as returned to the client by the 'getShareDetails' function.
 * Excludes sensitive information like passwordHash.
 */
export interface ShareDetails {
  id: string; // Share ID
  userId: string; // ID of the owner
  documentId: string;
  originalDocumentName: string;
  includeChat: boolean;
  isChatActive: boolean; // Added required field
  accessType: "view" | "comment";
  createdAt: number; // Timestamp converted to milliseconds since epoch for client
  expiresAt: number | null; // Timestamp converted to milliseconds or null
  requiresPassword?: boolean; // Indicates if a password is required to view this share
}

// Input type for the 'createShare' Cloud Function
export interface CreateShareInput extends ShareOptions {
  isChatActive?: boolean; // Added optional field
}

/**
 * Input for the sendShareInvite function to send email invitations
 */
export interface SendShareInviteInput {
  shareId: string; // The ID of the share to send an invitation for
  recipientEmail: string; // The email address to send the invitation to
  documentName: string; // The name of the document being shared
}

/**
 * Output returned by the sendShareInvite function
 */
export interface SendShareInviteOutput {
  success: boolean; // Whether the invitation was sent successfully
}

// Output type for the 'createShare' Cloud Function
export interface CreateShareOutput {
  id: string; // The ID of the created share document
}

// Input type for the 'verifySharePassword' Cloud Function
export interface VerifySharePasswordInput {
    shareId: string;
    passwordAttempt: string;
}

// Output type for the 'verifySharePassword' Cloud Function
export interface VerifySharePasswordOutput {
    accessGranted: boolean;
    token?: string; // A short-lived token if access granted
}

// Input type for the 'getShareDetails' Cloud Function
export interface GetShareDetailsInput {
    shareId: string;
    passwordToken?: string; // Optional token from password verification
}

import { MyDocumentData } from './index';

// Output type for the 'getShareDetails' Cloud Function
export interface GetShareDetailsOutput {
  documentId: string;
  documentName: string;
  documentPath: string;
  ownerUserId: string;
  documentData: MyDocumentData;
  expiresAt: number | null;
  includeChat: boolean;
  isChatActive: boolean; // Added required field
  accessType: "view" | "comment";
  password: boolean | null;
}

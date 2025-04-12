/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// import * as functions from "firebase-functions/v2";
import {onObjectFinalized} from "firebase-functions/v2/storage";
import {getFirestore, Timestamp, FieldValue, CollectionReference, DocumentData} from "firebase-admin/firestore"; // Keep only necessary imports
import * as admin from "firebase-admin";
import {initializeApp} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";
import * as logger from "firebase-functions/logger"; // Correct logger import path
import * as path from "path"; // Import path module
import {HttpsError, onCall, CallableRequest} from "firebase-functions/v2/https"; // Corrected import to v2
import {GetSignedUrlConfig} from "@google-cloud/storage"; // Import the type

// Start writing functions
// https://firebase.google.com/docs/functions

// Initialize Firebase Admin SDK
// Make sure we're using admin privileges
if (!admin.apps.length) {
  initializeApp();
}

// Log initialization
logger.info("Firebase Admin SDK initialized with admin privileges");

// TODO: Get these from environment variables?
const db = getFirestore(); // Use db instead of firestore

// This function triggers when a new file is uploaded to Firebase Storage.
// It creates a corresponding entry in Firestore.
export const processDocumentUpload = onObjectFinalized(
  {cpu: "gcf_gen1"},
  async (event) => {
    // Use gen1 CPU
    const fileBucket = event.data.bucket; // Storage bucket containing the file.
    const filePath = event.data.name; // File path in the bucket.
    const contentType = event.data.contentType; // File content type.
    const metadata = event.data.metadata; // Custom metadata (e.g., userId)
    const size = event.data.size; // File size in bytes
    const timeCreated = event.data.timeCreated; // File creation time (ISO 8601)

    logger.info("Received file upload", {
      name: event.data.name,
      bucket: event.data.bucket,
      metadata: event.data.metadata,
      metageneration: event.data.metageneration,
      contentType: event.data.contentType,
    });

    logger.info("Processing new file:", {filePath, contentType, size});

    // --- Validate File ---
    // NEW: Check if the filename is already a Firestore ID (prevent recursive trigger from move)
    const currentFileName = path.basename(filePath, path.extname(filePath));
    // Basic check: Firestore IDs are typically 20 chars, alphanumeric.
    // This isn't foolproof but should catch most cases of our canonical naming.
    if (currentFileName.length === 20 && /^[a-zA-Z0-9]+$/.test(currentFileName)) {
      logger.info(`Skipping processing for potential canonical file path: ${filePath}`);
      return; // Exit early to prevent loop
    }

    // Make sure it's not a directory placeholder created by Storage
    if (!contentType || filePath.endsWith("/")) {
      logger.log("Ignoring non-file or directory placeholder:", filePath);
      return;
    }

    // --- Extract User ID (Crucial!) ---
    // We expect the frontend to set 'userId' in the custom metadata
    // Extract metadata from the file
    const metadataFromEvent = metadata || {}; // Get the main metadata object

    // Extract fields directly from the main metadataFromEvent object
    const userIdFromMeta = metadataFromEvent?.userId;
    const originalNameFromMeta = metadataFromEvent?.originalName;
    const folderIdFromMeta = metadataFromEvent?.folderId || null; // Get folderId or default to null

    // Fallback for userId if not in metadata
    let userId: string | null = userIdFromMeta || null; // Explicitly allow null
    let originalName: string | null = originalNameFromMeta || null; // Explicitly allow null

    // If userId is not in metadata, try to extract it from the file path
    // Format: users/{userId}/{filename}
    if (!userId) {
      userId = extractUserIdFromPath(filePath);
    }

    // Fallback for originalName if not in metadata
    if (!originalName) {
      originalName = filePath.split("/").pop() || "unknown";
    }

    /**
     * Extracts the userId from a Firebase Storage path.
     * Assumes path format: users/{userId}/...
     * @param {string} path The full storage path.
     * @return {string | null} The extracted userId or null if not found.
     */
    function extractUserIdFromPath(path: string): string | null {
      const parts = path.split("/");
      if (parts.length >= 2 && parts[0] === "users") {
        return parts[1]; // Assuming format users/{userId}/...
      }
      return null;
    }

    // Validate extracted userId
    if (!userId) {
      // Log error and exit if userId is missing
      logger.error(
        "Missing 'userId' in metadata and couldn't extract from path: " +
          `${filePath}`
      );
      return;
    }

    // Log successful metadata extraction
    logger.info(
      `Successfully extracted metadata - userId: ${userId}, ` +
        `originalName: ${originalName}, folderId: ${folderIdFromMeta}` // Log folderId
    );
    logger.info(
      `File path: ${filePath}, size: ${size}, contentType: ${contentType}`
    );

    logger.info(`Using userId: ${userId}, originalName: ${originalName}`);

    logger.info(`File uploaded by user ${userId}: ${filePath}`);

    // --- Create Firestore Entry ---
    try {
      // Check if a document for this user and path already exists recently
      try {
        // Use a direct path query for efficiency
        const userDocumentsRef: CollectionReference<DocumentData> = db.collection("users").doc(userId).collection("documents");
        const snapshot = await userDocumentsRef
          .where("storagePath", "==", filePath) // Check using the *original* filePath first
          .orderBy("createdAt", "desc")
          .limit(1)
          .get(); // Use .get() with Admin SDK

        if (!snapshot.empty) {
          const existingDoc = snapshot.docs[0].data();
          const createdAt = existingDoc.createdAt as Timestamp;
          const now = Timestamp.now();
          // Check if the existing document was created very recently (e.g., within 10 seconds)
          if (now.seconds - createdAt.seconds < 10) {
            logger.warn(`Skipping processing for ${filePath} as a very recent document exists (likely duplicate trigger).`);
            return;
          }
          logger.info(`Found older document for path ${filePath}. Proceeding with potential overwrite/update logic if needed (currently creating new).`);
        }
      } catch (error) {
        logger.error(`Error checking for existing document: ${error}`);
        // Decide if we should continue or return based on the error
        // For now, we'll log and continue, but might want to return for critical errors
      }

      // **CURRENT BEHAVIOR:** We will use the ORIGINAL filePath as the storagePath.
      // If renaming/moving logic is re-enabled above, ensure 'finalStoragePath' reflects that.
      const finalStoragePath = filePath;
      logger.info(`Using final storage path: ${finalStoragePath}`);

      // 4. Get necessary metadata and generate Signed URL (optional but useful)
      const storage = getStorage();
      const bucket = storage.bucket(fileBucket);
      const finalFile = bucket.file(finalStoragePath); // Use the final path
      const [metadata] = await finalFile.getMetadata(); // Get metadata from the final file path
      const contentType = metadata.contentType || "application/octet-stream";
      // const size = metadata.size;
      // const timeCreated = metadata.timeCreated;

      // Generate a unique ID for the Firestore document
      const docRef = db.collection("users").doc(userId).collection("documents").doc(); // Generate ID now
      logger.info(`Generated Firestore Document ID: ${docRef.id}`);

      // Prepare data, handling potential undefined values
      let fileSize = 0;
      // Use typeof check for better type inference
      if (typeof size === "string") {
        const parsedSize = parseInt(size, 10);
        if (!isNaN(parsedSize)) {
          fileSize = parsedSize;
        }
      }

      let createdAt = Timestamp.now(); // Default to now if timeCreated missing
      if (timeCreated) {
        const date = new Date(timeCreated);
        // Check if date parsing was successful
        if (!isNaN(date.getTime())) {
          createdAt = Timestamp.fromDate(date);
        }
      }

      // Generate Signed URL for the file
      const signedUrlConfig: GetSignedUrlConfig = {
        action: "read",
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Expires in 7 days
      }; // Expires in 7 days (adjust as needed)
      let signedUrl = "#";
      try {
        const [url] = await finalFile.getSignedUrl(signedUrlConfig);
        signedUrl = url;
        logger.info(`Generated signed URL expiring on ${signedUrlConfig.expires}: ${signedUrl ? "..." : "ERROR"}`); // Mask URL in log
      } catch (error) {
        logger.error(`Error generating signed URL: ${error}`);
      }

      // Create the Firestore document
      const documentData = {
        userId,
        name: originalName,
        folderId: folderIdFromMeta, // Use the extracted folderId (or null)
        storagePath: finalStoragePath, // Use the final storage path
        fileBucket,
        contentType,
        size: fileSize,
        // Use server timestamp for consistent ordering
        uploadedAt: FieldValue.serverTimestamp(),
        createdAt,
        status: "processed", // Changed from "uploaded" to "processed"
        downloadURL: signedUrl, // Add the generated signed URL
      };
      logger.info("Attempting to create Firestore document with data:", {...documentData, downloadURL: "..."}); // Log data (mask URL)

      try {
        // Use set() to create or overwrite the document
        await docRef.set(documentData);
        logger.info(`Successfully created Firestore entry for: ${originalName} (ID: ${docRef.id}) with folderId: ${folderIdFromMeta}`);
      } catch (error) {
        logger.error("Error creating Firestore entry: " + error);
        // Consider adding retry logic or moving file to error folder
      }
    } catch (error) {
      logger.error("Error processing document upload: " + error);
    }
  }
);

// ==============================================
// NEW: Folder Management Functions
// ==============================================

// Define interfaces for callable function request data
interface CreateFolderRequestData {
  name: string;
  parentFolderId?: string | null;
}

interface MoveDocumentRequestData {
  documentId: string;
  targetFolderId: string | null;
}

interface DeleteFolderRequestData {
  folderId: string;
}

/**
 * Creates a new folder for the authenticated user.
 */
export const createFolder = onCall(async (request: CallableRequest<CreateFolderRequestData>) => {
  logger.info("Received createFolder request", {data: request.data, auth: request.auth});

  // 1. Authentication Check
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = request.auth.uid;
  const data = request.data; // Extract data from request
  // Type check input data properties
  const folderName: string | undefined = data.name?.trim();
  const parentFolderId: string | null = data.parentFolderId === undefined ? null : data.parentFolderId;

  if (!folderName) {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a \"name\" argument."
    );
  }

  // Basic validation for parentFolderId if provided (optional: check if it exists)
  if (parentFolderId !== null && typeof parentFolderId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "The \"parentFolderId\" must be a string or null."
    );
  }

  try {
    const newFolderRef = db.collection("users").doc(userId).collection("folders").doc(); // Use db
    const timestamp = FieldValue.serverTimestamp();

    await newFolderRef.set({
      name: folderName,
      parentFolderId: parentFolderId, // Store null for root folders
      userId: userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    logger.info(`Folder '${folderName}' created successfully for user ${userId} with ID ${newFolderRef.id}`);
    return {success: true, folderId: newFolderRef.id};
  } catch (error) {
    logger.error(`Error creating folder for user ${userId}:`, error);
    throw new HttpsError(
      "internal",
      "Failed to create folder.",
      error instanceof Error ? error.message : undefined
    );
  }
});

/**
 * Moves a document to a different folder (or root) for the authenticated user.
 */
export const moveDocument = onCall(async (request: CallableRequest<MoveDocumentRequestData>) => {
  logger.info("moveDocument called with data:", request.data);
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const userId = request.auth.uid;
  const data = request.data; // Extract data from request
  // Type check input data properties
  const documentId: string | undefined = data.documentId;
  // Allow targetFolderId to be explicitly null to move to root
  const targetFolderId: string | null = data.targetFolderId === undefined ? null : data.targetFolderId;

  if (!documentId || typeof documentId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "The function must be called with a valid string \"documentId\"."
    );
  }

  if (targetFolderId !== null && typeof targetFolderId !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "The \"targetFolderId\" must be a string or null."
    );
  }

  try {
    const docRef = db.collection("users").doc(userId).collection("documents").doc(documentId); // Use db

    // Optional: Check if targetFolderId (if not null) actually exists
    if (targetFolderId) {
      const folderRef = db.collection("users").doc(userId).collection("folders").doc(targetFolderId); // Use db
      const folderSnap = await folderRef.get();
      if (!folderSnap.exists) {
        throw new HttpsError("not-found", `Target folder with ID ${targetFolderId} not found.`);
      }
    }

    await docRef.update({
      folderId: targetFolderId, // Set to null to move to root
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info(`Document ${documentId} moved to folder ${targetFolderId ?? "root"} successfully for user ${userId}`);
    return {success: true};
  } catch (error) {
    logger.error(`Error moving document ${documentId} for user ${userId}:`, error);
    if (error instanceof HttpsError) { // Re-throw HttpsErrors directly
      throw error;
    }
    throw new HttpsError(
      "internal",
      "Failed to move document.",
      error instanceof Error ? error.message : undefined
    );
  }
});

/**
 * Deletes a folder and all its contents (sub-folders and documents)
 * for the authenticated user.
 */
export const deleteFolder = onCall(async (request: CallableRequest<DeleteFolderRequestData>) => {
  logger.info("Received deleteFolder request", {data: request.data, auth: request.auth});

  // 1. Authentication Check
  if (!request.auth) {
    logger.error("deleteFolder called without authentication.");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const userId = request.auth.uid;

  // 2. Validate Input
  const {folderId} = request.data;
  if (!folderId || typeof folderId !== "string") {
    logger.error("Invalid folderId provided.", {folderId});
    throw new HttpsError("invalid-argument", "The function must be called with a valid 'folderId' string.");
  }

  logger.info(`User ${userId} attempting to delete folder ${folderId}`);

  try {
    const bucket = getStorage().bucket(); // Default bucket
    const userDocsRef = db.collection("users").doc(userId).collection("documents");

    // Helper function for recursive deletion
    const deleteFolderRecursive = async (currentFolderId: string): Promise<number> => {
      let deletedCount = 0;
      logger.info(`Recursively deleting contents of folder: ${currentFolderId}`);

      const itemsSnapshot = await userDocsRef.where("folderId", "==", currentFolderId).get();
      if (itemsSnapshot.empty) {
        logger.info(`Folder ${currentFolderId} is empty or does not exist.`);
        // We still might need to delete the folder doc itself later
        return deletedCount;
      }

      const batch = db.batch();
      const deletePromises: Promise<unknown>[] = [];

      for (const doc of itemsSnapshot.docs) {
        const itemData = doc.data();
        const itemId = doc.id;

        if (itemData.type === "folder") {
          // Recursively delete sub-folder
          logger.info(`Found sub-folder ${itemId}, deleting recursively...`);
          deletedCount += await deleteFolderRecursive(itemId);
          // Add the sub-folder doc itself to the batch for deletion after its contents
          batch.delete(doc.ref);
          logger.info(`Added folder doc ${itemId} to deletion batch.`);
        } else if (itemData.type === "document") {
          // Delete associated file from Storage
          if (itemData.storagePath && typeof itemData.storagePath === "string") {
            logger.info(`Deleting document ${itemId} storage file: ${itemData.storagePath}`);
            const fileDeletePromise = bucket.file(itemData.storagePath).delete()
              .then(() => {
                logger.info(`Successfully deleted storage file: ${itemData.storagePath}`);
              })
              .catch((err) => {
                // Log error but continue - might be already deleted or permissions issue
                logger.error(`Failed to delete storage file ${itemData.storagePath}:`, err);
              });
            deletePromises.push(fileDeletePromise);
          }
          // Add document to batch delete
          batch.delete(doc.ref);
          deletedCount++;
          logger.info(`Added document ${itemId} to deletion batch.`);
        } else {
          logger.warn(`Unknown item type found in folder ${currentFolderId}:`, itemData);
          // Optionally delete unknown types too
          // batch.delete(doc.ref);
        }
      }

      // Wait for all storage deletions for this level to attempt completion
      await Promise.allSettled(deletePromises);
      logger.info(`Storage delete promises settled for folder ${currentFolderId}.`);

      // Commit the Firestore batch delete for this level
      await batch.commit();
      logger.info(`Committed Firestore delete batch for folder ${currentFolderId}.`);

      return deletedCount;
    };

    // Start the recursive deletion process
    const totalDeleted = await deleteFolderRecursive(folderId);

    // Finally, delete the target folder document itself
    try {
      await userDocsRef.doc(folderId).delete();
      logger.info(`Successfully deleted the main folder document: ${folderId}`);
    } catch (error) {
      // It might have been deleted in the recursive call if it was listed somehow,
      // or it might not exist if the initial query was empty.
      logger.warn(`Could not delete main folder doc ${folderId} (might be already deleted or non-existent):`, error);
    }

    logger.info(`Successfully deleted folder ${folderId} and ${totalDeleted} nested items for user ${userId}.`);
    return {success: true, message: `Folder and ${totalDeleted} items deleted successfully.`};
  } catch (error) {
    logger.error(`Error deleting folder ${folderId} for user ${userId}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new HttpsError("internal", `Failed to delete folder: ${errorMessage}`);
  }
});

// TODO: Add functions for renaming folders, moving folders etc.

// ==============================================
// Excel Processing Functions
// ==============================================

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
    const metadataFromEvent = metadata || {};
    const customMetadata = metadataFromEvent.metadata || {};

    // Log the entire main metadata object as a JSON string
    logger.log("Main metadata object received:", JSON.stringify(metadataFromEvent, null, 2));

    // Log the extracted nested custom metadata object as a JSON string
    logger.log("Extracted nested customMetadata object:", JSON.stringify(customMetadata, null, 2));

    // Try to get userId from metadata or from the file path
    let userId = "";
    let originalName = "";
    let folderId: string | null = null; // Initialize folderId as null

    // Type-safe access to customMetadata properties
    if (customMetadata && typeof customMetadata === "object") {
      // Safe access with type checking
      userId = "userId" in customMetadata ? String(customMetadata.userId) : "";

      // Extract originalName
      originalName = (
        "originalName" in customMetadata ?
          String(customMetadata.originalName) :
          filePath.split("/").pop() || "unknown"
      );

      // Extract folderId, default to null if missing or empty
      if ("folderId" in customMetadata && customMetadata.folderId) {
        folderId = String(customMetadata.folderId);
      } else {
        folderId = null; // Explicitly set to null for root uploads or if missing
      }
    } else {
      // Fallback if customMetadata is not an object (should not happen with frontend logic)
      originalName = filePath.split("/").pop() || "unknown";
    }

    // If userId is not in metadata, try to extract it from the file path
    // Format: users/{userId}/{filename}
    if (!userId && filePath.startsWith("users/")) {
      const pathParts = filePath.split("/");
      if (pathParts.length >= 2) {
        userId = pathParts[1]; // Extract userId from path
        logger.info(`Extracted userId from path: ${userId}`);
      }
    }

    // Basic validation
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
        `originalName: ${originalName}, folderId: ${folderId}` // Log folderId
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
        folderId: folderId, // Use the extracted folderId (or null)
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
        logger.info(`Successfully created Firestore entry for: ${originalName} (ID: ${docRef.id}) with folderId: ${folderId}`);
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

/**
 * Creates a new folder for the authenticated user.
 */
export const createFolder = onCall(async (request: CallableRequest<CreateFolderRequestData>) => {
  logger.info("createFolder called with data:", request.data);
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

// ==============================================
// Excel Processing Functions
// ==============================================

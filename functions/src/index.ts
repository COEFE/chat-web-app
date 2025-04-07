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
import {getFirestore, Timestamp, FieldValue} from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import {initializeApp} from "firebase-admin/app";
import {getStorage} from "firebase-admin/storage";
import * as logger from "firebase-functions/logger"; // Import logger
import * as path from "path"; // Import path module

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
const firestore = getFirestore();

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

    logger.info("Received file upload with metadata:", metadata);

    logger.info("Processing new file:", {filePath, contentType, size});

    // --- Validate File ---
    // Make sure it's not a directory placeholder created by Storage
    if (!contentType || filePath.endsWith("/")) {
      logger.log("Ignoring non-file or directory placeholder:", filePath);
      return;
    }

    // --- Extract User ID (Crucial!) ---
    // We expect the frontend to set 'userId' in the custom metadata
    // Extract metadata from the file
    const metadataFromEvent = metadata || {};
    const customMetadata = metadataFromEvent.customMetadata || {};

    // Try to get userId from metadata or from the file path
    let userId = "";

    // Type-safe access to customMetadata properties
    if (customMetadata && typeof customMetadata === "object") {
      // Safe access with type checking
      userId = "userId" in customMetadata ? String(customMetadata.userId) : "";
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

    // Get original name from metadata or fallback to filename
    let originalName = "";
    if (customMetadata && typeof customMetadata === "object") {
      originalName = (
        "originalName" in customMetadata ?
          String(customMetadata.originalName) :
          filePath.split("/").pop() || "unknown"
      );
    } else {
      originalName = filePath.split("/").pop() || "unknown";
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
        `originalName: ${originalName}`
    );
    logger.info(
      `File path: ${filePath}, size: ${size}, contentType: ${contentType}`
    );

    logger.info(`Using userId: ${userId}, originalName: ${originalName}`);

    logger.info(`File uploaded by user ${userId}: ${filePath}`);

    // --- Create Firestore Entry ---
    try {
      // Log the Firestore path we're writing to
      const firestorePath = `users/${userId}/documents`;
      logger.info(`Writing to Firestore path: ${firestorePath}`);

      // 1. Generate Firestore Document ID first
      const docRef = firestore
        .collection("users")
        .doc(userId)
        .collection("documents")
        .doc(); // Auto-generate ID
      const newDocId = docRef.id;
      logger.info(`Generated Firestore Document ID: ${newDocId}`);

      // 2. Construct Canonical Storage Path
      const fileExtension = path.extname(filePath); // Get extension (e.g., '.xlsx')
      const canonicalFileName = `${newDocId}${fileExtension}`;
      const canonicalPath = `users/${userId}/${canonicalFileName}`;
      logger.info(`Constructed canonical storage path: ${canonicalPath}`);

      // 3. Move/Rename the file in Storage
      const storage = getStorage();
      const bucket = storage.bucket(fileBucket);
      const originalFileRef = bucket.file(filePath);
      const canonicalFileRef = bucket.file(canonicalPath);

      try {
        logger.info(
          `Attempting to move file from '${filePath}' to '${canonicalPath}'`
        );
        await originalFileRef.move(canonicalPath);
        logger.info("Successfully moved file in Storage to canonical path.");
      } catch (moveError) {
        logger.error(
          `Failed to move file from '${filePath}' to '${canonicalPath}':`,
          moveError
        );
        // Decide how to handle failed move: exit, log, retry?
        // For now, we'll log the error and potentially continue with the old path,
        // but this indicates a problem.
        // Consider returning here or throwing the error if move is critical.
        // Let's throw for now to prevent inconsistent state
        throw new Error(`Storage move failed: ${moveError}`);
      }

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

      // 4. Get Download URL for the CANONICAL path
      const fileRef = canonicalFileRef; // Use the reference to the moved file

      // Use a longer expiration time (7 days) for better user experience
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 7); // 7 days instead of 1

      logger.info(
        `Setting signed URL expiration to: ${expirationDate.toISOString()}`
      );
      const [downloadURL] = await fileRef.getSignedUrl({
        action: "read",
        expires: expirationDate.toISOString(),
      });

      logger.info(
        `Generated signed URL with 24-hour expiration: ${downloadURL}`
      );

      await docRef.set({
        userId,
        name: originalName, // Use the original filename from metadata
        storagePath: canonicalPath, // Use the canonical path
        fileBucket,
        contentType,
        size: fileSize,
        // Use server timestamp for consistent ordering
        uploadedAt: FieldValue.serverTimestamp(),
        createdAt,
        status: "processed", // Changed from "uploaded" to "processed"
        downloadURL: downloadURL,
      });
      // Log timestamp creation
      logger.info("Created document with server timestamp");

      // Log success with file path
      logger.info("Successfully created Firestore entry for: " + filePath);
    } catch (error) {
      logger.error("Error creating Firestore entry: " + error);
      // Consider adding retry logic or moving file to error folder
    }
  }
);

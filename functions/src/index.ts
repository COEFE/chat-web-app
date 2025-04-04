/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {initializeApp} from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore"; // Import Timestamp
import {onObjectFinalized} from "firebase-functions/v2/storage";
import * as logger from "firebase-functions/logger"; // Import logger

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

initializeApp();

// TODO: Get these from environment variables?
const firestore = getFirestore();

// This function triggers when a new file is uploaded to Firebase Storage.
// It creates a corresponding entry in Firestore.
export const processDocumentUpload = onObjectFinalized(
  {cpu: "gcf_gen1"},
  async (event) => { // Use gen1 CPU
    const fileBucket = event.data.bucket; // Storage bucket
    const filePath = event.data.name; // File path in the bucket.
    const contentType = event.data.contentType; // File content type.
    const metadata = event.data.metadata; // Custom metadata (e.g., userId)
    const size = event.data.size; // File size in bytes (string)
    const timeCreated = event.data.timeCreated; // File creation time (ISO 8601)

    logger.info("Processing new file:", {filePath, contentType, size});

    // --- Validate File ---
    // Make sure it's not a directory placeholder created by Storage
    if (!contentType || filePath.endsWith("/")) {
      logger.log(
        "Ignoring non-file or directory placeholder:",
        filePath,
      );
      return;
    }

    // --- Extract User ID (Crucial!) ---
    // We expect the frontend to set 'userId' in the custom metadata
    // during upload.
    const userId = metadata?.userId;
    if (!userId) {
      logger.error(
        "Missing 'userId' in custom metadata for file:",
        filePath,
      );
      // Optional: Delete the file if userId is missing?
      // await storage.bucket(fileBucket).file(filePath).delete();
      return; // Or throw an error?
    }

    logger.info(`File uploaded by user ${userId}: ${filePath}`);

    // --- Create Firestore Entry ---
    try {
      // Auto-generate ID for the new document
      const docRef = firestore.collection("documents").doc();

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

      await docRef.set({
        userId,
        fileName: filePath.split("/").pop(),
        filePath,
        fileBucket,
        contentType,
        size: fileSize,
        createdAt,
        status: "uploaded",
      });

      logger.info("Successfully created Firestore entry for: " + filePath);
    } catch (error) {
      logger.error("Error creating Firestore entry: " + error);
      // Consider adding retry logic or moving file to error folder
    }
  },
);

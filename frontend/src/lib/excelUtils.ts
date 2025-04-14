import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage'; // Import Bucket type
import { getAdminDb, getAdminStorage } from './firebaseAdminConfig';

// Define a reusable interface for document with ID
interface DocWithId {
    id: string;
    updatedAt?: admin.firestore.Timestamp;
    [key: string]: any;
}

// Get Firestore and Storage instances from the centralized Firebase Admin config
let db: admin.firestore.Firestore | null = null;
let storage: admin.storage.Storage | null = null;
let bucket: Bucket | null = null; // Use imported Bucket type

// Try to initialize Firebase services, but handle gracefully if they fail
try {
  // Use the centralized Firebase Admin initialization
  db = getAdminDb();
  storage = getAdminStorage();
  
  // Get the bucket name from environment variables
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
  console.log(`Using storage bucket: ${bucketName}`);
  
  // Get the bucket with the specific name
  bucket = storage.bucket(bucketName);
  console.log('Firebase services initialized successfully from firebaseAdminConfig');
} catch (error) {
  console.error('Error initializing Firebase services:', error);
  console.log('Will use fallback dummy implementations for Excel operations');
}

/**
 * Creates a new Excel file based on the provided data. 
 * Uses document ID as the source of truth for file naming.
 */
export async function createExcelFile(db: admin.firestore.Firestore, storage: admin.storage.Storage, bucket: Bucket, userId: string, documentId: string, data: any[]) {
    const startTime = Date.now();
    console.log(`[createExcelFile] Starting create/update for user: ${userId}, initial documentId: ${documentId} at ${new Date().toISOString()}`);
    
    if (!db || !storage || !bucket) {
        console.log("Firebase services not available, using dummy implementation");
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
        return { 
            success: true, 
            message: "Dummy: Excel file creation simulated (Firebase unavailable)", 
            documentId: documentId || `new-${uuidv4()}` 
        };
    }
    
    try {
        // Use the document ID passed from processExcelOperation directly
        // It's already been normalized or generated there.
        const finalDocumentId = documentId;
        console.log(`[createExcelFile] Using provided document ID: ${finalDocumentId}`);
        
        // IMPORTANT: Use document ID as the canonical filename
        // This ensures we always use the same filename for the same document
        const canonicalFilename = `${finalDocumentId}.xlsx`;
        const canonicalStoragePath = `users/${userId}/${canonicalFilename}`;
        
        console.log(`[createExcelFile] Using document ID as canonical filename: ${canonicalFilename}`);
        console.log(`[createExcelFile] Canonical storage path: ${canonicalStoragePath}`);
        
        // Check if document already exists with this ID
        // Use the same collection path as in editExcelFile
        const docRef = db.collection('users').doc(userId).collection('documents').doc(finalDocumentId);
        const existingDoc = await docRef.get();
        
        // Flag to track if we're updating an existing document
        const isUpdate = existingDoc.exists;
        
        if (isUpdate) {
            console.log(`[createExcelFile] Document exists with ID: ${finalDocumentId}. Will update.`);
            
            // Verify this document belongs to the user
            const existingData = existingDoc.data() as DocWithId;
            if (existingData && existingData.userId !== userId) {
                console.error(`[createExcelFile] User ${userId} does not have permission to update document ${finalDocumentId}`);
                throw new Error("You do not have permission to update this document");
            }
        } else {
            console.log(`[createExcelFile] No document exists with ID: ${finalDocumentId}. Will create new.`);
        }

        // Create a new workbook
        const workbook = XLSX.utils.book_new();
        
        // Process each sheet in the data array
        for (const sheetData of data) {
            const { sheetName = 'Sheet1', rows = [] } = sheetData;
            
            // Convert rows to worksheet
            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            
            // Add worksheet to workbook
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        
        // Convert workbook to buffer
        const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        
        // Upload to Firebase Storage using the canonical path - with performance tracking
        console.log(`[createExcelFile] Starting file upload to Firebase Storage at ${new Date().toISOString()}, file size: ${excelBuffer.length} bytes`);
        const uploadStartTime = Date.now();
        const file = bucket.file(canonicalStoragePath);
        
        // Upload the file
        await file.save(excelBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });
        
        const uploadDuration = Date.now() - uploadStartTime;
        console.log(`[createExcelFile] Successfully uploaded Excel file to: ${canonicalStoragePath} in ${uploadDuration}ms`);
        
        // Get a signed URL for the file - with performance tracking
        console.log(`[createExcelFile] Getting signed URL at ${new Date().toISOString()}`);
        const urlStartTime = Date.now();
        const [downloadURL] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2500' // Far future date
        });
        const urlDuration = Date.now() - urlStartTime;
        console.log(`[createExcelFile] Got signed URL in ${urlDuration}ms`);
        
        // Create document data object
        const docData: any = {
            userId: userId,
            name: canonicalFilename,
            storagePath: canonicalStoragePath,
            downloadURL: downloadURL,
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: excelBuffer.length,
            status: 'processed',
            uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
            // Add folderId field, default to null for root folder
            folderId: null,
        };
        
        // Add appropriate timestamp based on whether this is a new document or an update
        if (isUpdate) {
            console.log(`[createExcelFile] Updating existing document with ID: ${finalDocumentId}`);
            docData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        } else {
            console.log(`[createExcelFile] Creating new document with ID: ${finalDocumentId}`);
            docData.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }
        
        // CRITICAL: Use set with merge:true to ensure we're updating the existing document
        // rather than creating a new one if it exists
        await docRef.set(docData, { merge: true });
        

        console.log(`[createExcelFile] Successfully processed Firestore document: ${docRef.id}`);
        
        // Calculate and log total execution time
        const totalDuration = Date.now() - startTime;
        console.log(`[createExcelFile] Total execution time: ${totalDuration}ms`);
        
        // Return success with additional metadata
        return { 
            success: true, 
            message: "Excel file created/updated successfully", 
            documentId: docRef.id,
            storagePath: canonicalStoragePath,
            fileUrl: downloadURL,
            executionTime: totalDuration
        };
    } catch (error: any) {
        // Calculate execution time even for errors
        const errorTime = Date.now() - startTime;
        console.error(`[createExcelFile] Error processing file for documentId ${documentId} after ${errorTime}ms:`, error);
        
        // Provide more specific error messages based on error type
        let errorMessage = `Error creating/updating Excel file: ${error.message}`;
        
        if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            errorMessage = 'Connection to Firebase Storage timed out. Please try again.'; 
        } else if (error.code === 403 || error.message.includes('permission')) {
            errorMessage = 'Permission denied accessing Firebase Storage. Please check your credentials.';
        } else if (error.message.includes('quota')) {
            errorMessage = 'Firebase Storage quota exceeded. Please try again later.';
        }
        
        return { 
            success: false, 
            message: errorMessage, 
            documentId: documentId, // Return the original ID
            executionTime: errorTime
        };
    }
}

/**
 * Edits an existing Excel file with the provided updates
 */
export async function editExcelFile(db: admin.firestore.Firestore, storage: admin.storage.Storage, bucket: Bucket, userId: string, documentId: string, data: any[]) {
    console.log(`[editExcelFile] Starting edit for user: ${userId}, documentId: ${documentId}`);

    if (!db || !storage || !bucket) {
        console.log("Firebase services not available, using dummy implementation");
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate async work
        
        // Log the cell updates that would have been made
        try {
            for (const sheetData of data) {
                const { sheetName, cellUpdates = [] } = sheetData;
                console.log(`Would update sheet "${sheetName}" with ${cellUpdates.length} cell changes:`);
                for (const update of cellUpdates) {
                    console.log(`  Cell ${update.cell} = "${update.value}"`);
                }
            }
        } catch (logError) {
            console.error("Error logging cell updates:", logError);
        }
        
        return { 
            success: true, 
            message: "Dummy: Excel file update simulated (Firebase unavailable)", 
            documentId 
        };
    }
    
    let docRef: admin.firestore.DocumentReference;
    let actualDocumentId = documentId;
    
    try {
        // CRITICAL FIX: First check if there's another document with the same storage path
        // This is the key to preventing duplicates - we need to find documents that point to the same file
        console.log(`[editExcelFile] Checking for documents with storage path containing: ${documentId}.xlsx`);
        
        const userDocsRef = db.collection('users').doc(userId).collection('documents');
        const snapshot = await userDocsRef.get();
        
        let existingDocWithSamePath: admin.firestore.DocumentData | null = null;
        let existingDocId: string | null = null;
        
        snapshot.forEach(doc => {
            const data = doc.data();
            // Check if this document points to the same Excel file
            if (data.storagePath && 
                data.storagePath.includes(`${userId}/${documentId}.xlsx`)) {
                console.log(`[editExcelFile] Found document with matching storage path: ${doc.id}`);
                existingDocWithSamePath = data;
                existingDocId = doc.id;
            }
        });
        
        // If we found an existing document with the same storage path, use that instead
        if (existingDocId && existingDocId !== documentId) {
            console.log(`[editExcelFile] Using existing document ID: ${existingDocId} instead of ${documentId}`);
            actualDocumentId = existingDocId;
        }
        
        // Get a reference to the document (either the original or the one we found)
        docRef = db.collection('users').doc(userId).collection('documents').doc(actualDocumentId);
        console.log(`[editExcelFile] Looking up document with ID: ${docRef.id}`);
        
        // Get the document data
        const doc = await docRef.get();
        
        // Define docData at a higher scope so it's accessible throughout the function
        let docData: DocWithId | undefined;
        
        // If the document doesn't exist but we're using the original ID, try to create it
        if (!doc.exists && actualDocumentId === documentId) {
            console.log(`[editExcelFile] Document not found, will create a new one: ${documentId}`);
            // This will be handled below by the set() with merge: true
        } else if (!doc.exists) {
            console.error(`[editExcelFile] Document not found for editing: ${actualDocumentId}`);
            throw new Error(`Document not found for editing: ${actualDocumentId}`);
        } else {
            // Get the existing data
            docData = doc.data() as DocWithId | undefined;
            if (!docData) {
                console.error("Document exists but has no data");
                throw new Error("Document exists but has no data");
            }
            
            // Check if this document belongs to the user
            if (docData.userId !== userId) {
                console.error("User does not have permission to edit this document");
                throw new Error("User does not have permission to edit this document");
            }
            
            console.log(`[editExcelFile] Document found with ID: ${docRef.id}`);
        }
        
        // IMPORTANT: Use document ID as the canonical filename
        // This ensures we always use the same filename for the same document
        const canonicalFilename = `${documentId}.xlsx`;
        const canonicalStoragePath = `users/${userId}/${canonicalFilename}`;
        
        console.log(`[editExcelFile] Using document ID as canonical filename: ${canonicalFilename}`);
        console.log(`[editExcelFile] Canonical storage path: ${canonicalStoragePath}`);
        
        try {
            // First try to download from the path stored in Firestore
            let fileBuffer: Buffer | null = null;
            let downloadSuccessful = false;
            
            // Try to download from the existing storage path first
            const storagePath = docData?.storagePath;
            if (storagePath) {
                console.log(`[editExcelFile] Attempting to download from existing path: ${storagePath}`);
                try {
                    const existingFile = bucket.file(storagePath);
                    [fileBuffer] = await existingFile.download();
                    downloadSuccessful = true;
                    console.log(`[editExcelFile] Successfully downloaded from existing path: ${storagePath}`);
                } catch (err) {
                    console.log(`[editExcelFile] Failed to download from existing path: ${err}`);
                }
            }
            
            // If download from existing path failed, try the canonical path
            if (!downloadSuccessful) {
                console.log(`[editExcelFile] Attempting to download from canonical path: ${canonicalStoragePath}`);
                try {
                    const canonicalFile = bucket.file(canonicalStoragePath);
                    [fileBuffer] = await canonicalFile.download();
                    downloadSuccessful = true;
                    console.log(`[editExcelFile] Successfully downloaded from canonical path: ${canonicalStoragePath}`);
                } catch (err) {
                    console.log(`[editExcelFile] Failed to download from canonical path: ${err}`);
                }
            }
            
            // If both attempts failed, throw an error
            if (!downloadSuccessful || !fileBuffer) {
                throw new Error(`Could not find Excel file at either the existing path (${storagePath || 'unknown'}) or the canonical path (${canonicalStoragePath})`);
            }
            
            // Load the workbook
            const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
            
            // Process each sheet update in the data array
            for (const sheetData of data) {
                const { sheetName, cellUpdates = [] } = sheetData;
                
                // Get the worksheet, create if it doesn't exist
                let worksheet = workbook.Sheets[sheetName];
                if (!worksheet) {
                    worksheet = XLSX.utils.aoa_to_sheet([]);
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                }
                
                // Apply cell updates
                for (const update of cellUpdates) {
                    const { cell, value } = update;
                    console.log(`[editExcelFile] Setting ${cell} to ${value}`);
                    XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cell });
                }
            }
            
            // Convert workbook to buffer
            const updatedBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            // Get original metadata *before* making changes
            const originalDocData = (await docRef.get()).data() as DocWithId;
            const originalStoragePath = originalDocData?.storagePath;
            const originalName = originalDocData?.name;
            
            console.log(`[editExcelFile] Original storagePath: ${originalStoragePath}`);
            console.log(`[editExcelFile] Original name: ${originalName}`);

            // ALWAYS upload to the *original* storage path to avoid changing the file location
            const targetStoragePath = originalStoragePath || canonicalStoragePath; // Prefer original path
            console.log(`[editExcelFile] Uploading updated file to target path: ${targetStoragePath}`);
            const file = bucket.file(targetStoragePath);
            await file.save(updatedBuffer, {
                metadata: {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            });
            
            console.log(`[editExcelFile] Successfully uploaded updated Excel file to: ${targetStoragePath}`);
            
            // Update Firestore document metadata, preserving original path/name if they exist
            const [downloadURL] = await file.getSignedUrl({
                action: 'read',
                expires: '03-01-2500' // Far future date
            });
            
            // --- START: Wrap final Firestore update in try/catch for detailed logging ---
            try {
                console.log(`[editExcelFile] Attempting final Firestore set for doc: ${docRef.id}`);
                await docRef.set({
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    // Keep original path and name if they exist, otherwise use canonical
                    storagePath: originalStoragePath || canonicalStoragePath, 
                    name: originalName || canonicalFilename, 
                    downloadURL: downloadURL,
                    size: updatedBuffer.length,
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    // Keep the original userId to maintain ownership
                    userId: userId
                }, { merge: true }); // Using merge:true preserves fields we don't explicitly set
                console.log(`[editExcelFile] Successfully completed Firestore set for doc: ${docRef.id}`);
            } catch(firestoreError: any) {
                console.error(`[editExcelFile] CRITICAL ERROR during final Firestore set for doc ${docRef.id}:`, firestoreError);
                // Return failure immediately if the final metadata update fails
                return { 
                    success: false, 
                    message: `Error updating document metadata after file save: ${firestoreError.message}`,
                    documentId: docRef.id
                };
            }
            // --- END: Wrap final Firestore update ---
            
            console.log(`[editExcelFile] PREPARING TO RETURN SUCCESS for doc: ${docRef.id}`);
            return { success: true, message: "Excel file edited successfully", documentId: docRef.id };
        } catch (error: any) {
            console.error(`[editExcelFile] Error editing Excel file for document ${docRef.id}:`, error);
            return { 
                success: false, 
                message: `Error editing Excel file: ${error.message}`, 
                documentId: docRef.id
            };
        }
    } catch (error: any) { // Catch errors from the initial lookup phase
        console.error(`[editExcelFile] Error during initial lookup for document ${documentId}:`, error);
        return { success: false, message: `Error finding document: ${error.message}`, documentId: documentId };
    }
}

// Helper function to extract base filename without timestamp
function extractBaseFilename(filename: string | undefined | null): { baseName: string; isTimestamped: boolean } {
    if (!filename) {
        // Handle cases where filename might be undefined or null, perhaps generate a default
        console.warn("[extractBaseFilename] Received null or undefined filename, generating UUID as baseName.");
        return { baseName: uuidv4(), isTimestamped: false }; 
    }
    const timestampPattern = /-\d{13,}(\.xlsx)?$/;
    const isTimestamped = timestampPattern.test(filename);
    let baseName = isTimestamped ? filename.replace(timestampPattern, '') : filename;
    // Also remove .xlsx if present for a cleaner base name
    baseName = baseName.replace(/\.xlsx$/i, ''); 
    return { baseName, isTimestamped };
}

// Helper function to normalize timestamped paths and filenames
function normalizeTimestampedPath(storagePath: string, filename: string): { storagePath: string, filename: string } {
    const timestampPattern = /-\d{13,}(\.xlsx)?$/;
    let finalStoragePath = storagePath;
    let finalFilename = filename;

    if (timestampPattern.test(storagePath)) {
        let basePath = storagePath.replace(timestampPattern, '');
        // Only add .xlsx if it doesn't already end with it
        if (!basePath.toLowerCase().endsWith('.xlsx')) {
            basePath += '.xlsx';
        }
        finalStoragePath = basePath;
        console.log("[normalizeTimestampedPath] Normalizing storage path from", storagePath, "to", finalStoragePath);
    }
    if (timestampPattern.test(filename)) {
        let baseFilename = filename.replace(timestampPattern, '');
        // Only add .xlsx if it doesn't already end with it
        if (!baseFilename.toLowerCase().endsWith('.xlsx')) {
            baseFilename += '.xlsx';
        }
        finalFilename = baseFilename;
        console.log("[normalizeTimestampedPath] Normalizing filename from", filename, "to", finalFilename);
    }
    return { storagePath: finalStoragePath, filename: finalFilename };
}

// --- Exported Function for Excel Operations ---
export async function processExcelOperation(
  operation: string,
  documentId: string | null, // Allow null for create
  data: any[],
  userId: string,
  fileName?: string, // Added fileName
  sheetName?: string // Added sheetName
): Promise<{ success: boolean; message?: string; docId?: string; storagePath?: string }> { // Changed return type
  const startTime = Date.now();
  console.log('[processExcelOperation] Starting execution at:', new Date().toISOString());
  console.log('[processExcelOperation] Received:', { operation, documentId, dataLength: data?.length, userId, fileName, sheetName });
 
  // Ensure Firebase services are available
  if (!db || !storage || !bucket) {
    console.error('[processExcelOperation] Firebase services not initialized.');
    return { success: false, message: 'Server error: Firebase services not available.' };
  }
 
  let result: { success: boolean; message?: string; documentId?: string; storagePath?: string };
  let finalDocumentId = documentId; // Use a mutable variable for the ID
 
  try {
    if (operation === 'createExcelFile' || (!documentId)) {
      console.log('[processExcelOperation] Routing to createExcelFile');
      // Generate a stable UUID for the new document if none provided
      finalDocumentId = documentId || `doc-${uuidv4()}`;
      console.log(`[processExcelOperation] Generated/Using documentId for create: ${finalDocumentId}`);
       
      // --- Prepare data for createExcelFile --- 
      // The `data` argument from the AI should already be structured correctly
      // e.g., [{ sheetName: '...', rows: [...] }] or similar
      // If structure is different, adapt here.
      const sheetDataForCreate = data; // Assume data is already in the correct format
       
      // Call createExcelFile with the generated/provided ID and prepared data
      result = await createExcelFile(db, storage, bucket, userId, finalDocumentId, sheetDataForCreate); 
     
    } else if (operation === 'editExcelFile' && documentId) {
      console.log(`[processExcelOperation] Routing to editExcelFile for docId: ${documentId}`);
      finalDocumentId = documentId; // Use the provided document ID for editing
       
      // --- Prepare data for editExcelFile --- 
      // The `data` argument should be structured for editing, e.g., 
      // [{ sheetName: '...', cellUpdates: [...], formatCells: [...] }] 
      // Ensure the structure matches what editExcelFile expects.
      const sheetDataForEdit = data; // Assume data is already in the correct format
 
      result = await editExcelFile(db, storage, bucket, userId, finalDocumentId, sheetDataForEdit); 
     
    } else {
      console.error('[processExcelOperation] Invalid operation or missing document ID for edit.', { operation, documentId });
      return { success: false, message: 'Invalid operation type or missing document ID for edit.' };
    }
 
    console.log('[processExcelOperation] Result from create/edit function:', result);
    
    // Log execution time
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`[processExcelOperation] Execution completed in ${executionTime}ms`);
    
    // Return the result object directly
    return result;
 
  } catch (error: any) {
    console.error('[processExcelOperation] Unhandled error:', error);
    
    // Log execution time even in error case
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    console.log(`[processExcelOperation] Failed execution completed in ${executionTime}ms`);
    
    return { success: false, message: `Server error during Excel operation: ${error.message}` };
  }
}

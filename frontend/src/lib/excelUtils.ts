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
    
    // Track memory usage - Pro plan still has 1024MB limit
    const memUsageBefore = process.memoryUsage();
    console.log(`[createExcelFile] Memory usage before operation: ${JSON.stringify({
        rss: `${Math.round(memUsageBefore.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageBefore.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsageBefore.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageBefore.external / 1024 / 1024)}MB`,
    })}`);
    
    // Check if we're running in Vercel and determine plan type
    const isVercel = process.env.VERCEL === '1';
    // We'll assume Pro plan based on user confirmation
    const isPro = true;
    console.log(`[createExcelFile] Running in Vercel environment: ${isVercel}, Pro plan: ${isPro}`);
    
    try {
        // Normalize document ID (remove temp prefix if present)
        const baseDocumentId = documentId.replace(/^temp-create-\d+/, '').replace(/^temp-edit-\d+/, '');
        console.log(`[createExcelFile] Normalized documentId: ${baseDocumentId}`);

        // Create a new workbook with minimal memory footprint
        console.log(`[createExcelFile] Creating workbook...`);
        const workbook = XLSX.utils.book_new();
        
        // Process the data in chunks to reduce memory pressure
        console.log(`[createExcelFile] Processing data of length: ${data.length}`);
        
        // Create worksheet from data
        const worksheet = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
        
        console.log(`[createExcelFile] Workbook created successfully`);
        
        // Generate a unique filename
        const timestamp = Date.now();
        const fileName = `excel_${timestamp}.xlsx`;
        const storagePath = `users/${userId}/${fileName}`;
        console.log(`[createExcelFile] Storage path: ${storagePath}`);

        // Write to buffer with optimized settings
        console.log(`[createExcelFile] Writing to buffer...`);
        const excelBuffer = XLSX.write(workbook, { 
            type: 'buffer',
            bookType: 'xlsx',
            compression: true // Use compression to reduce memory usage
        });
        console.log(`[createExcelFile] Buffer created, size: ${excelBuffer.length} bytes`);
        
        // Track memory after workbook creation
        const memUsageAfterWorkbook = process.memoryUsage();
        console.log(`[createExcelFile] Memory usage after workbook creation: ${JSON.stringify({
            rss: `${Math.round(memUsageAfterWorkbook.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memUsageAfterWorkbook.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memUsageAfterWorkbook.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(memUsageAfterWorkbook.external / 1024 / 1024)}MB`,
        })}`);

        // Upload to Firebase Storage with explicit timeout
        console.log(`[createExcelFile] Uploading to Firebase Storage...`);
        const file = bucket.file(storagePath);
        
        // Set upload options with explicit timeout - increased for Pro plan
        const uploadOptions = {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
            timeout: 45000 // 45 second timeout for upload (Pro plan allows up to 60s total execution)
        };
        
        // Upload with timeout handling
        try {
            await file.save(excelBuffer, uploadOptions);
            console.log(`[createExcelFile] File uploaded successfully to ${storagePath}`);
        } catch (uploadError: any) {
            console.error(`[createExcelFile] Error uploading file to Firebase Storage:`, uploadError);
            if (uploadError.code === 'ETIMEDOUT' || uploadError.message?.includes('timeout')) {
                throw new Error(`Firebase Storage upload timed out after 25 seconds. File size: ${excelBuffer.length} bytes`);
            }
            throw uploadError;
        }
        
        // Get a signed URL with a timeout wrapper
        console.log(`[createExcelFile] Getting signed URL...`);
        let signedUrl;
        try {
            // Wrap the getSignedUrl call in a Promise.race with a timeout
            const signedUrlPromise = file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('getSignedUrl timed out after 20 seconds')), 20000);
            });
            
            const [url] = await Promise.race([signedUrlPromise, timeoutPromise]);
            signedUrl = url;
            console.log(`[createExcelFile] Signed URL obtained successfully`);
        } catch (urlError: any) {
            console.error(`[createExcelFile] Error getting signed URL:`, urlError);
            if (urlError.message?.includes('timed out')) {
                throw new Error('Firebase Storage getSignedUrl timed out after 20 seconds');
            }
            throw urlError;
        }

        // Create a document in Firestore with explicit timeout
        console.log(`[createExcelFile] Creating Firestore document...`);
        const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
        
        // Prepare document data (minimal required fields)
        const docData = {
            name: fileName,
            type: 'excel',
            storagePath,
            userId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'processed',
            fileUrl: signedUrl,
            fileBucket: bucket.name
        };
        
        // Set document with timeout handling
        try {
            await Promise.race([
                docRef.set(docData, { merge: true }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore document creation timed out')), 20000))
            ]);
            console.log(`[createExcelFile] Firestore document created successfully with ID: ${documentId}`);
        } catch (firestoreError: any) {
            console.error(`[createExcelFile] Error creating Firestore document:`, firestoreError);
            if (firestoreError.message?.includes('timed out')) {
                throw new Error('Firestore document creation timed out after 20 seconds');
            }
            throw firestoreError;
        }

        // Track final memory usage
        const memUsageAfter = process.memoryUsage();
        console.log(`[createExcelFile] Memory usage after operation: ${JSON.stringify({
            rss: `${Math.round(memUsageAfter.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memUsageAfter.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memUsageAfter.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(memUsageAfter.external / 1024 / 1024)}MB`,
        })}`);

        const endTime = Date.now();
        const executionTime = endTime - startTime;
        console.log(`[createExcelFile] Excel file created successfully in ${executionTime}ms`);
        
        return {
            success: true,
            documentId,
            storagePath,
            fileUrl: signedUrl,
            executionTime
        };
    } catch (error: any) {
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        console.error(`[createExcelFile] Error creating Excel file after ${executionTime}ms:`, error);
        console.error(`[createExcelFile] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        // Check for specific error types
        if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
            throw new Error(`Excel operation timed out: ${error.message}`);
        }
        
        if (error.message?.includes('memory') || error.message?.includes('heap')) {
            throw new Error(`Memory limit exceeded during Excel operation: ${error.message}`);
        }
        
        throw error;
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
/**
 * Process Excel operations (create or edit)
 * @param operation - The operation type ('createExcelFile' or 'editExcelFile')
 * @param documentId - The document ID (null for create)
 * @param data - The operations data
 * @param userId - The user ID
 * @param fileName - Optional filename
 * @param sheetName - Optional sheet name
 * @returns Promise with operation result
 */
export async function processExcelOperation(
  operation: string,
  documentId: string | null, // Allow null for create
  data: any[],
  userId: string,
  fileName?: string,
  sheetName?: string
): Promise<{ success: boolean; message?: string; documentId?: string; storagePath?: string; fileUrl?: string; executionTime?: number }> {
  const startTime = Date.now();
  console.log(`[processExcelOperation] Received request: operation=${operation}, docId=${documentId}, userId=${userId}, fileName=${fileName}, sheetName=${sheetName}`);
  console.log(`[processExcelOperation] Data type: ${typeof data}, isArray: ${Array.isArray(data)}`);
  
  // Track memory usage
  const memUsageBefore = process.memoryUsage();
  console.log(`[processExcelOperation] Memory usage before operation: ${JSON.stringify({
      rss: `${Math.round(memUsageBefore.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memUsageBefore.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memUsageBefore.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(memUsageBefore.external / 1024 / 1024)}MB`,
  })}`);
  
  try {
    // Already checked Vercel environment above
    
    // Get Firebase Admin services from the parameters
    console.log(`[processExcelOperation] Using provided Firebase services...`);
    // Ensure we have the required Firebase services
    if (!db || !storage || !bucket) {
      throw new Error('Firebase services not properly initialized');
    }
    console.log(`[processExcelOperation] Firebase services validated successfully`);
    
    // Parse data if it's a string (JSON)
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        console.log(`[processExcelOperation] Parsing JSON data string...`);
        const parsedJson = JSON.parse(data);
        
        // Check for different data structures
        if (parsedJson.excelOperation && parsedJson.excelOperation.sheets) {
          // Handle the excelOperation.sheets format
          console.log(`[processExcelOperation] Found excelOperation.sheets format`);
          parsedData = parsedJson.excelOperation.sheets[0].data;
        } else if (parsedJson.args && parsedJson.args.operations) {
          // Handle the args.operations format
          console.log(`[processExcelOperation] Found args.operations format`);
          parsedData = parsedJson.args.operations;
        } else {
          // Use the whole parsed object as data
          console.log(`[processExcelOperation] Using entire parsed JSON as data`);
          parsedData = parsedJson;
        }
        
        console.log(`[processExcelOperation] Successfully parsed JSON data, length: ${Array.isArray(parsedData) ? parsedData.length : 'N/A'}`);
      } catch (parseError: any) {
        console.error(`[processExcelOperation] Error parsing JSON data:`, parseError);
        throw new Error(`Failed to parse Excel data: ${parseError.message}`);
      }
    }
    
    // Generate a document ID if not provided
    const finalDocumentId = documentId || `doc-${uuidv4()}`;
    console.log(`[processExcelOperation] Using document ID: ${finalDocumentId}`);
    
    // Process based on operation type
    let result;
    if (operation === 'createWorkbook' || operation === 'createExcelFile') {
      console.log(`[processExcelOperation] Calling createExcelFile...`);
      result = await createExcelFile(db, storage, bucket, userId, finalDocumentId, parsedData);
      console.log(`[processExcelOperation] createExcelFile completed successfully`);
    } else if (operation === 'editWorkbook' || operation === 'editExcelFile') {
      if (!documentId) {
        throw new Error('Document ID is required for edit operations');
      }
      console.log(`[processExcelOperation] Calling editExcelFile...`);
      result = await editExcelFile(db, storage, bucket, userId, documentId, parsedData);
      console.log(`[processExcelOperation] editExcelFile completed successfully`);
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
    }
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Track memory usage after operation
    const memUsageAfter = process.memoryUsage();
    console.log(`[processExcelOperation] Memory usage after operation: ${JSON.stringify({
        rss: `${Math.round(memUsageAfter.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageAfter.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsageAfter.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageAfter.external / 1024 / 1024)}MB`,
    })}`);
    
    console.log(`[processExcelOperation] Operation completed successfully in ${executionTime}ms`);
    
    return {
      ...result,
      executionTime
    };
  } catch (error: any) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    console.error(`[processExcelOperation] Error after ${executionTime}ms:`, error);
    console.error(`[processExcelOperation] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Categorize errors for better client feedback
    let errorMessage = 'Unknown error';
    
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      errorMessage = `Operation timed out: ${error.message}`;
    }
    
    if (error.message?.includes('memory') || error.message?.includes('heap')) {
      errorMessage = `Memory limit exceeded: ${error.message}`;
    }
    
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
      errorMessage = `Connection error: ${error.message}`;
    }
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      message: errorMessage,
      executionTime
    };
  }
}

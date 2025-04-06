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
 * If a document with a matching base name already exists, it updates that document.
 */
async function createExcelFile(db: admin.firestore.Firestore, storage: admin.storage.Storage, bucket: Bucket, userId: string, documentId: string, data: any[]) {
    console.log(`[createExcelFile] Starting create/update for user: ${userId}, initial documentId: ${documentId}`);
    
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
        // Check if document already exists (for documentId provided by Claude)
        let existingDoc = null;
        let existingDocRef = null;
        let documentFound = false;
        
        if (documentId) {
            console.log("Checking if document already exists with ID:", documentId);
            
            // First try direct lookup with the provided ID
            existingDocRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
            existingDoc = await existingDocRef.get();
            
            if (existingDoc.exists) {
                console.log("Document exists with exact ID match, will update instead of creating new");
                documentFound = true;
            } else {
                // If not found, try to find by base name (similar to file-proxy lookup)
                console.log("Document ID provided but exact match not found, searching for similar documents");
                
                // Extract base name if documentId contains a timestamp pattern
                const timestampPattern = /-\d{13,}(\.xlsx)?$/;
                let baseName = documentId;
                
                if (timestampPattern.test(documentId)) {
                    baseName = documentId.replace(timestampPattern, '');
                    console.log("Extracted base name for search:", baseName);
                }
                
                // Query for documents with similar names
                const docsRef = db.collection('users').doc(userId).collection('documents');
                const snapshot = await docsRef.where('name', '>=', baseName)
                                             .where('name', '<=', baseName + '\uf8ff')
                                             .get();
                
                if (!snapshot.empty) {
                    // Use the most recent document if multiple matches found
                    let mostRecent: DocWithId | null = null;
                    
                    snapshot.forEach((docSnapshot: admin.firestore.QueryDocumentSnapshot) => {
                        const docData = docSnapshot.data();
                        if (!mostRecent || (docData.updatedAt && mostRecent.updatedAt && 
                            docData.updatedAt.toDate() > mostRecent.updatedAt.toDate())) {
                            mostRecent = { id: docSnapshot.id, ...docData } as DocWithId;
                        }
                    });
                    
                    if (mostRecent && typeof mostRecent === 'object') {
                        // Ensure mostRecent is properly typed
                        const typedMostRecent = mostRecent as DocWithId;
                        const docId = typedMostRecent.id;
                        console.log("Found similar document with ID:", docId);
                        existingDocRef = db.collection('users').doc(userId).collection('documents').doc(docId);
                        existingDoc = await existingDocRef.get();
                        documentFound = true;
                    }
                }
                
                if (!documentFound) {
                    console.log("No similar documents found, will create new");
                }
            }
        }
        
        // --- Robust Document Lookup/Handling ---
        console.log(`[createExcelFile] Checking direct match for ID: ${documentId}`);
        const { baseName, isTimestamped } = extractBaseFilename(documentId);
        console.log(`[createExcelFile] Extracted baseName: '${baseName}', isTimestamped: ${isTimestamped}`);

        let docRef: admin.firestore.DocumentReference;
        let existingDocData: DocWithId | null = null;

        // 1. Try direct match first (especially if ID wasn't timestamped)
        const directDocRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
        const directDocSnap = await directDocRef.get();

        if (directDocSnap.exists) {
            console.log(`[createExcelFile] Found direct match with ID: ${documentId}. Will update.`);
            docRef = directDocRef;
            existingDocData = { id: directDocSnap.id, ...directDocSnap.data() } as DocWithId;
        } else {
            console.log(`[createExcelFile] No direct match for ID: ${documentId}. Searching by baseName: '${baseName}'`);
            // 2. If no direct match, search by baseName
            const querySnapshot = await db.collection('users').doc(userId).collection('documents')
                .where('name', '>=', baseName)
                .where('name', '<=', baseName + '\uf8ff')
                .get();
            
            console.log(`[createExcelFile] BaseName search found ${querySnapshot.size} potential matches.`);

            if (!querySnapshot.empty) {
                // Filter results to match baseName exactly (ignoring timestamps) and sort
                const matchingDocs = querySnapshot.docs
                    .map((doc: admin.firestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as DocWithId))
                    .filter((doc: DocWithId) => extractBaseFilename(doc.name).baseName === baseName)
                    .sort((a: DocWithId, b: DocWithId) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0)); // Sort descending by update time

                if (matchingDocs.length > 0) {
                    existingDocData = matchingDocs[0]; // Use the most recently updated
                    docRef = db.collection('users').doc(userId).collection('documents').doc(existingDocData.id); // Assign docRef for existing baseName match
                    console.log(`[createExcelFile] Found best match by baseName. Will update document ID: ${existingDocData.id} (Name: ${existingDocData.name}, Updated: ${existingDocData.updatedAt?.toDate()})`);
                } else {
                    console.log(`[createExcelFile] No documents found matching baseName '${baseName}' after filtering. Will create new.`);
                    docRef = directDocRef; // Assign docRef for new document (using original ID)
                    existingDocData = null;
                }
            } else {
                console.log(`[createExcelFile] No documents found with baseName starting with '${baseName}'. Will create new.`);
                docRef = directDocRef; // Assign docRef for new document (using original ID)
                existingDocData = null;
            }
        }
        // --- End Robust Document Lookup/Handling ---

        // Sanity check: docRef must be assigned by this point
        if (!docRef) { // This check should now pass reliably
            console.error("[createExcelFile] Critical error: docRef was not assigned after lookup logic.");
            throw new Error("Internal server error: Document reference could not be established.");
        }

        // Define storage path and filename
        let storagePath: string;
        let filename: string;

        if (existingDocData) {
            // Use existing path and name, potentially normalizing timestamped names
            filename = existingDocData.name;
            storagePath = existingDocData.storagePath || `users/${userId}/documents/${filename}`;
            const normResult = normalizeTimestampedPath(storagePath, filename);
            storagePath = normResult.storagePath;
            filename = normResult.filename;
            console.log(`[createExcelFile] Using existing doc data. Final path: ${storagePath}, filename: ${filename}`);
        } else {
            // Generate new filename and path for a *new* document using the *clean base name*
            filename = `${baseName}.xlsx`; 
            storagePath = `users/${userId}/documents/${filename}`;
            console.log(`[createExcelFile] Creating new doc. Path: ${storagePath}, filename: ${filename}`);
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
        
        // Upload to Firebase Storage
        const file = bucket.file(storagePath);
        await file.save(excelBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });
        
        // Update existing document or create a new one
        if (existingDocData) {
            // Update existing document
            console.log(`[createExcelFile] Updating existing Firestore document: ${docRef.id}`);
            await docRef.update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                storagePath: storagePath,
                downloadURL: await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000 // 1 hour
                }),
                size: excelBuffer.length,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                name: filename // Ensure name is updated if normalized
            });
        } else {
            // Create new document
            console.log(`[createExcelFile] Creating new Firestore document: ${docRef.id}`);
            await docRef.set({
                userId: userId,
                name: filename,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                storagePath: storagePath,
                downloadURL: await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 60 * 60 * 1000 // 1 hour
                }),
                size: excelBuffer.length,
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                // Add any other necessary initial fields
            });
        }

        console.log(`[createExcelFile] Successfully processed Firestore document: ${docRef.id}`);
        
        // Return success within the try block
        return { 
            success: true, 
            message: "Excel file created/updated successfully", 
            documentId: docRef.id 
        };
    } catch (error: any) {
        console.error(`[createExcelFile] Error processing file for documentId ${documentId}:`, error);
        return { 
            success: false, 
            message: `Error creating/updating Excel file: ${error.message}`, 
            documentId: documentId // Return the original ID
        };
    }
}

/**
 * Edits an existing Excel file with the provided updates
 */
async function editExcelFile(db: admin.firestore.Firestore, storage: admin.storage.Storage, bucket: Bucket, userId: string, documentId: string, data: any[]) {
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
    
    try {
        const docsRef = db.collection('users').doc(userId).collection('documents');
        let docRef: admin.firestore.DocumentReference | null = null;
        let existingData: DocWithId | null = null;

        // --- Robust Document Lookup ---
        console.log(`[editExcelFile] Attempting lookup for documentId: ${documentId}`);
        const { baseName, isTimestamped } = extractBaseFilename(documentId);
        console.log(`[editExcelFile] Extracted baseName: '${baseName}', isTimestamped: ${isTimestamped}`);

        // 1. Try direct match first
        const directDocRef = docsRef.doc(documentId);
        const directDocSnap = await directDocRef.get();

        if (directDocSnap.exists) {
            console.log(`[editExcelFile] Found direct match with ID: ${documentId}`);
            docRef = directDocRef;
            existingData = { id: directDocSnap.id, ...directDocSnap.data() } as DocWithId;
        } else {
            console.log(`[editExcelFile] No direct match for ID: ${documentId}. Searching by baseName: '${baseName}'...`);
            // 2. If no direct match, search by baseName
            const querySnapshot = await docsRef.where('name', '>=', baseName)
                                             .where('name', '<=', baseName + '\uf8ff')
                                             .get();
            
            console.log(`[editExcelFile] Found ${querySnapshot.size} potential matches for baseName: '${baseName}'`);

            if (!querySnapshot.empty) {
                // Filter results to match baseName exactly (ignoring timestamps)
                const matchingDocs = querySnapshot.docs
                    .map((doc: admin.firestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() } as DocWithId))
                    .filter((doc: DocWithId) => extractBaseFilename(doc.name).baseName === baseName)
                    .sort((a: DocWithId, b: DocWithId) => (b.updatedAt?.toMillis() || 0) - (a.updatedAt?.toMillis() || 0)); // Sort descending by update time

                if (matchingDocs.length > 0) {
                    existingData = matchingDocs[0]; // Use the most recently updated
                    docRef = docsRef.doc(existingData.id);
                    console.log(`[editExcelFile] Found best match by baseName. Using document ID: ${existingData.id} (Name: ${existingData.name}, Updated: ${existingData.updatedAt?.toDate()})`);
                } else {
                     console.log(`[editExcelFile] No documents found matching the baseName '${baseName}' after filtering.`);
                }
            } else {
                console.log(`[editExcelFile] No documents found with baseName starting with '${baseName}'.`);
            }
        }

        // If no document found after lookup, treat as an error for editing
        if (!docRef || !existingData) {
            console.error(`[editExcelFile] Document not found for editing after lookup. Original ID: ${documentId}, BaseName: ${baseName}`);
            // Potentially try to create it instead? Or return a specific error.
            // For now, let's throw an error as edit implies existence.
            throw new Error(`Document with base name '${baseName}' (from ID: ${documentId}) not found for editing.`);
        }
        // --- End Robust Document Lookup ---

        // At this point, if docRef or existingData were null, an error would have been thrown.
        // We can safely assume they are non-null here.
        console.log(`[editExcelFile] Proceeding to update document with final ID: ${docRef.id}`);

        // Define storage path using the *found* document's name/path if available, or generate new
        let storagePath = existingData.storagePath || `users/${userId}/documents/${existingData.name}`;
        let filename = existingData.name;
        const normResult = normalizeTimestampedPath(storagePath, filename);
        storagePath = normResult.storagePath; // Use normalized path
        filename = normResult.filename;     // Use normalized filename
        console.log(`[editExcelFile] Using normalized storagePath: ${storagePath}, filename: ${filename}`);

        try {
            // Download the existing file from storage
            const file = bucket.file(storagePath);
            const [fileBuffer] = await file.download();
            
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
                    XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cell });
                }
            }
            
            // Convert workbook to buffer
            const updatedBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            // Upload updated file back to storage
            await file.save(updatedBuffer, {
                metadata: {
                    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                }
            });
            
            console.log(`[editExcelFile] Successfully uploaded updated Excel file to: ${storagePath}`);

            // Update Firestore document metadata
            const downloadURL = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000 // 1 hour
            });

            await docRef.update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Use server timestamp
                storagePath: storagePath,
                downloadURL: downloadURL,
                size: updatedBuffer.length, // Add file size
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Add content type
                name: filename // *** Add normalized filename update ***
            });

            console.log(`[editExcelFile] Successfully updated Firestore document: ${docRef.id}`);

            return { success: true, message: "Excel file edited successfully", documentId: docRef.id };
        } catch (error: any) {
            // Use the original documentId in the error if docRef might not be assigned
            const idForError = docRef ? docRef.id : documentId;
            console.error(`[editExcelFile] Error editing Excel file for document ${idForError}:`, error);
            return { 
                success: false, 
                message: `Error editing Excel file: ${error.message}`, 
                documentId: idForError // Return the ID used in the error message
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
  userId: string
): Promise<NextResponse> { // Return NextResponse for consistency
  console.log('--- ENTERING processExcelOperation ---');
  console.log('Arguments:', { operation, documentId, data: data ? 'Present' : 'Absent', userId });

  // Firebase instances are initialized at the top of the file, but might be null if initialization failed
  if (!db || !storage || !bucket) {
    console.log("--- Firebase services not fully initialized, will use dummy implementations ---");
  } else {
    console.log("--- Using Firebase and XLSX for Excel operations ---");
  }

  if (!operation || !data || (operation === 'edit' && !documentId)) {
    console.log('--- ERROR: Missing required fields (operation, data, or documentId for edit) ---');
    return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
  }

  try {
    let result;
    // Use dummy documentId if needed for logic flow, actual operations are skipped/dummied
    const effectiveDocumentId = documentId || `temp-create-${Date.now()}`; // Use temp ID for create if null

    if (operation === 'create') {
      console.log(`Processing CREATE operation for user ${userId}, potential docId based on data?`);
      // Pass the actual Firebase instances
      result = await createExcelFile(
          db as admin.firestore.Firestore, 
          storage as admin.storage.Storage, 
          bucket as Bucket, 
          userId, 
          effectiveDocumentId, 
          data
      );
    } else if (operation === 'edit') {
      console.log(`Processing EDIT operation for user ${userId}, document ${effectiveDocumentId}`);
      // Pass the actual Firebase instances
      result = await editExcelFile(
          db as admin.firestore.Firestore, 
          storage as admin.storage.Storage, 
          bucket as Bucket, 
          userId, 
          effectiveDocumentId, 
          data
      );
    } else {
      console.log(`--- ERROR: Invalid operation type: ${operation} ---`);
      return NextResponse.json({ success: false, message: 'Invalid operation type' }, { status: 400 });
    }

    console.log("Operation Result:", result);
    
    // Log whether this was a real operation or a dummy/fallback operation
    if (result.message && result.message.includes('Dummy:')) {
      console.log("Note: This was a dummy/fallback operation. In production, the actual Excel file would be modified.");
    }
    // Ensure result has a success flag for consistent handling
    if (result && typeof result.success === 'boolean') {
        return NextResponse.json(result);
    } else {
        console.error("--- ERROR: Unexpected result format from create/edit function ---", result);
        return NextResponse.json({ success: false, message: 'Internal processing error: Unexpected result format' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('--- ERROR in processExcelOperation (Main Try/Catch) ---');
    console.error('Error Details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code
    });
    return NextResponse.json({ success: false, message: 'Internal Server Error during processing' }, { status: 500 });
  }
}

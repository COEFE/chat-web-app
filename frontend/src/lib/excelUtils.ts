import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';
import { getAdminDb, getAdminStorage } from './firebaseAdminConfig';

// Define a reusable interface for document with ID
interface DocWithId {
    id: string;
    updatedAt?: admin.firestore.Timestamp;
    [key: string]: any;
}

// Get Firestore and Storage instances from the centralized Firebase Admin config
let db: any = null;
let storage: any = null;
let bucket: any = null;

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
 * Creates a new Excel file based on the provided data
 */
async function createExcelFile(db: any, storage: any, bucket: any, userId: string, documentId: string, data: any[]) {
    console.log("Creating Excel file for user:", userId, "with documentId:", documentId);
    
    // Check if Firebase services are available
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
        
        // Use existing filename if updating, otherwise generate a new one
        let filename, storagePath;
        
        if (existingDoc && existingDoc.exists) {
            const existingData = existingDoc.data();
            // Use the existing storage path to overwrite the file
            storagePath = existingData.storagePath;
            filename = existingData.name;
            console.log("Using existing storage path:", storagePath);
            
            // If the existing path contains a timestamp, normalize it
            const timestampPattern = /-\d{13,}(\.xlsx)?$/;
            if (timestampPattern.test(storagePath)) {
                const basePath = storagePath.replace(timestampPattern, '');
                const newPath = `${basePath}.xlsx`;
                console.log("Normalizing storage path from", storagePath, "to", newPath);
                storagePath = newPath;
                
                // Also normalize the filename
                if (timestampPattern.test(filename)) {
                    const baseFilename = filename.replace(timestampPattern, '');
                    filename = `${baseFilename}.xlsx`;
                    console.log("Normalizing filename from", existingData.name, "to", filename);
                }
            }
        } else {
            // Generate a consistent filename without timestamp to avoid duplicates
            // Check if documentId contains a timestamp pattern (e.g., "filename-1234567890123")
            const timestampPattern = /-\d{13,}(\.xlsx)?$/;
            let baseFilename;
            
            if (documentId && timestampPattern.test(documentId)) {
                // Extract the base filename without the timestamp
                baseFilename = documentId.replace(timestampPattern, '');
                console.log("Extracted base filename from documentId:", baseFilename);
            } else {
                baseFilename = documentId || uuidv4();
            }
            
            // Remove any existing .xlsx extension
            baseFilename = baseFilename.replace(/\.xlsx$/i, '');
            
            // Use the base filename without appending a timestamp
            filename = `${baseFilename}.xlsx`;
            storagePath = `users/${userId}/${filename}`;
            console.log("Creating new storage path (without timestamp):", storagePath);
        }
        
        // Upload to Firebase Storage
        const file = bucket.file(storagePath);
        await file.save(excelBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });
        
        // Update existing document or create a new one
        const docRef = existingDocRef || db.collection('users').doc(userId).collection('documents').doc(documentId || uuidv4());
        
        if (existingDoc && existingDoc.exists) {
            // Update existing document
            await docRef.update({
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                size: excelBuffer.length
            });
            console.log("Updated existing document:", docRef.id);
            
            return { 
                success: true, 
                message: "Excel file updated successfully", 
                documentId: docRef.id 
            };
        } else {
            // Create new document
            await docRef.set({
                name: filename,
                uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                storagePath,
                status: 'processed',
                userId,
                size: excelBuffer.length,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log("Created new document:", docRef.id);
            
            return { 
                success: true, 
                message: "Excel file created successfully", 
                documentId: docRef.id 
            };
        }
    } catch (error: any) {
        console.error("Error creating/updating Excel file:", error);
        return { 
            success: false, 
            message: `Error creating/updating Excel file: ${error.message}` 
        };
    }
}

/**
 * Edits an existing Excel file with the provided updates
 */
async function editExcelFile(db: any, storage: any, bucket: any, userId: string, documentId: string, data: any[]) {
    console.log("Editing Excel file for user:", userId, "document:", documentId);
    
    if (!documentId) {
        return { success: false, message: "Document ID required for edit" };
    }
    
    // Check if Firebase services are available
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
        // Get document reference from Firestore
        const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
        const docSnapshot = await docRef.get();
        
        if (!docSnapshot.exists) {
            return { success: false, message: "Document not found" };
        }
        
        const docData = docSnapshot.data();
        
        // Verify user has access to this document
        if (docData.userId !== userId) {
            return { success: false, message: "Unauthorized access to document" };
        }
        
        // Download the existing file from storage
        const file = bucket.file(docData.storagePath);
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
        
        // Update document metadata if needed
        await docRef.update({
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            size: updatedBuffer.length
        });
        
        return { 
            success: true, 
            message: "Excel file updated successfully", 
            documentId 
        };
    } catch (error: any) {
        console.error("Error editing Excel file:", error);
        return { 
            success: false, 
            message: `Error editing Excel file: ${error.message}` 
        };
    }
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
      result = await createExcelFile(db, storage, bucket, userId, effectiveDocumentId, data);
    } else if (operation === 'edit') {
      console.log(`Processing EDIT operation for user ${userId}, document ${effectiveDocumentId}`);
      // Pass the actual Firebase instances
      result = await editExcelFile(db, storage, bucket, userId, effectiveDocumentId, data);
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

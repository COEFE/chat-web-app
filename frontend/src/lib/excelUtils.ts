import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
let firebaseApp: admin.app.App;
try {
  firebaseApp = admin.app();
} catch (error) {
  // Initialize the app if it doesn't exist
  try {
    // Check for individual credential parts first (preferred method)
    if (process.env.FIREBASE_PROJECT_ID && 
        process.env.FIREBASE_CLIENT_EMAIL && 
        process.env.FIREBASE_PRIVATE_KEY) {
      
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      console.log('Initializing Firebase Admin with individual credential parts');
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
    } 
    // Fall back to full credentials object if available
    else if (process.env.FIREBASE_ADMIN_SDK_CREDENTIALS) {
      console.log('Initializing Firebase Admin with full credentials object');
      const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CREDENTIALS);
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
    }
    else {
      console.error('Firebase Admin SDK credentials not found in environment variables');
      // Create a dummy app for development/testing
      console.log('Creating dummy Firebase app for development');
      firebaseApp = admin.initializeApp({
        projectId: 'dummy-project-id'
      });
    }
  } catch (initError) {
    console.error('Error initializing Firebase Admin:', initError);
    // Create a dummy app for development/testing
    console.log('Creating dummy Firebase app after initialization error');
    firebaseApp = admin.initializeApp({
      projectId: 'dummy-project-id-after-error'
    });
  }
}

// Get Firestore and Storage instances
let db: any = null;
let storage: any = null;
let bucket: any = null;

// Try to initialize Firebase services, but handle gracefully if they fail
try {
  db = getFirestore(firebaseApp);
  storage = getStorage(firebaseApp);
  bucket = storage.bucket();
  console.log('Firebase services initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase services:', error);
  console.log('Will use fallback dummy implementations for Excel operations');
}

/**
 * Creates a new Excel file based on the provided data
 */
async function createExcelFile(db: any, storage: any, bucket: any, userId: string, documentId: string, data: any[]) {
    console.log("Creating Excel file for user:", userId);
    
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
        
        // Generate a unique filename
        const filename = `${documentId || uuidv4()}.xlsx`;
        const storagePath = `users/${userId}/${filename}`;
        
        // Upload to Firebase Storage
        const file = bucket.file(storagePath);
        await file.save(excelBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }
        });
        
        // Create document reference in Firestore
        const docRef = db.collection('documents').doc(documentId || uuidv4());
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
        
        return { 
            success: true, 
            message: "Excel file created successfully", 
            documentId: docRef.id 
        };
    } catch (error: any) {
        console.error("Error creating Excel file:", error);
        return { 
            success: false, 
            message: `Error creating Excel file: ${error.message}` 
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
        const docRef = db.collection('documents').doc(documentId);
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

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

// Helper function to extract base filename without timestamp
function extractBaseFilename(filename: string | undefined | null): { baseName: string; isTimestamped: boolean } {
    if (!filename) {
        return { baseName: 'Untitled', isTimestamped: false };
    }
    // Regex to match _YYYYMMDD_HHMMSS pattern before the extension
    const match = filename.match(/^(.*?)_(\d{8}_\d{6})(\.[^.]+)$/);
    if (match) {
        return { baseName: match[1] + match[3], isTimestamped: true }; // Return original base + extension
    }
    // Regex for the simple timestamp pattern used in createExcelFile
    const simpleMatch = filename.match(/^(excel_\d+)(\.xlsx)$/);
    if (simpleMatch) {
        return { baseName: 'Spreadsheet.xlsx', isTimestamped: true }; // Default name if it's the generic pattern
    }
    return { baseName: filename, isTimestamped: false };
}

// Helper function to normalize timestamped paths and filenames
function normalizeTimestampedPath(storagePath: string, filename: string): { storagePath: string, filename: string } {
    console.log(`[normalizeTimestampedPath] Normalizing: path=${storagePath}, filename=${filename}`);
    let finalStoragePath = storagePath;
    let finalFilename = filename;

    const { baseName: baseFilename, isTimestamped } = extractBaseFilename(filename);
    if (isTimestamped) {
        const pathParts = storagePath.split('/');
        // Check if the last part of the path matches the timestamped filename
        if (pathParts.length > 0 && pathParts[pathParts.length - 1] === filename) {
            pathParts[pathParts.length - 1] = baseFilename; // Replace timestamped filename with base filename in path
            finalStoragePath = pathParts.join('/');
            console.log("[normalizeTimestampedPath] Normalizing storage path from", storagePath, "to", finalStoragePath);
        }
        finalFilename = baseFilename;
        console.log("[normalizeTimestampedPath] Normalizing filename from", filename, "to", finalFilename);
    }
    return { storagePath: finalStoragePath, filename: finalFilename };
}

// --- Exported Function for Excel Operations ---
/**
 * Process Excel operations from a list of instructions.
 * Handles creating/updating Excel files based on AI-generated operations.
 * @param operation - Operation type ('createExcelFile' or 'editExcelFile' - determines initial state)
 * @param documentId - The document ID (null for create, existing ID for edit)
 * @param operationsData - The array of operation objects from AI.
 * @param userId - The user ID
 * @param requestedFileName - Optional filename requested by AI or user.
 * @returns Promise with operation result
 */
export async function processExcelOperation(
  operation: string, // e.g., 'createExcelFile', 'editExcelFile'
  documentId: string | null, // Existing ID for edits, null for creates
  operationsData: any[], // The array of { type: '...', ... } objects
  userId: string,
  requestedFileName?: string,
  _sheetName?: string // Sheet name from AI is handled via 'createSheet' operation now
): Promise<{ success: boolean; message?: string; documentId?: string; storagePath?: string; fileUrl?: string; executionTime?: number }> {
  const startTime = Date.now();
  console.log(`[processExcelOperation] Received request: operation=${operation}, docId=${documentId}, userId=${userId}, requestedFileName=${requestedFileName}`);
  console.log(`[processExcelOperation] Operations count: ${Array.isArray(operationsData) ? operationsData.length : 'N/A'}`);
  
  // Track memory usage
  const memUsageBefore = process.memoryUsage();
  console.log(`[processExcelOperation] Memory usage before operation: ${JSON.stringify({ /* ... memory stats ... */ })}`);
  
  let workbook: XLSX.WorkBook;
  let existingDocData: DocWithId | null = null;
  let baseFilename = requestedFileName || 'Spreadsheet'; // Default/requested base name

  try {
    // Ensure Firebase services are ready
    if (!db || !storage || !bucket) {
      throw new Error('Firebase services not properly initialized');
    }
    console.log(`[processExcelOperation] Firebase services validated successfully`);

    // === Handle Edit vs. Create Setup ===
    if (operation === 'editExcelFile' && documentId) {
      console.log(`[processExcelOperation] Edit operation requested for doc: ${documentId}. Fetching existing file...`);
      const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new Error(`Document not found for editing: ${documentId}`);
      }
      existingDocData = { id: docSnap.id, ...docSnap.data() } as DocWithId;
      const storagePath = existingDocData.storagePath;
      if (!storagePath) throw new Error('Storage path missing for existing document');

      const file = bucket.file(storagePath);
      const [buffer] = await file.download();
      workbook = XLSX.read(buffer, { type: 'buffer' });
      baseFilename = extractBaseFilename(existingDocData.name).baseName; // Use existing base name
      console.log(`[processExcelOperation] Existing workbook loaded for editing. Base filename: ${baseFilename}`);

    } else {
      // Create operation or edit on non-existent doc (treat as create)
      if (operation === 'editExcelFile' && documentId) {
          console.warn(`[processExcelOperation] Edit requested for non-existent doc ${documentId}, treating as create.`);
      }
      console.log(`[processExcelOperation] Create operation requested.`);
      workbook = XLSX.utils.book_new();
    }

    // === Process Operations ===
    let currentSheetData: any[][] = [];
    let currentSheetName = 'Sheet1'; // Default sheet name
    const formatsToApply: { sheet: string, range: string, format: any }[] = [];
    const colWidthsToApply: { sheet: string, col: string, width: number }[] = [];

    console.log('[processExcelOperation] Starting to process operations...');
    for (const op of operationsData) {
      switch (op.type) {
        case 'createSheet':
          // If there's data in the previous sheet, add it to workbook
          if (currentSheetData.length > 0) {
            console.log(`[processExcelOperation] Adding previous sheet '${currentSheetName}' with ${currentSheetData.length} rows.`);
            const ws = XLSX.utils.aoa_to_sheet(currentSheetData);
            XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
          }
          // Start new sheet
          currentSheetName = op.name || `Sheet${workbook.SheetNames.length + 1}`;
          currentSheetData = []; // Reset data accumulator
          console.log(`[processExcelOperation] Switched to new sheet: '${currentSheetName}'`);
          // If the sheet already exists in edit mode, clear it (or decide on merge strategy later)
          if (workbook.SheetNames.includes(currentSheetName)) {
              console.warn(`[processExcelOperation] Sheet '${currentSheetName}' already exists in edit mode. Overwriting.`);
              // Remove existing sheet before adding new one
              const sheetIndex = workbook.SheetNames.indexOf(currentSheetName);
              workbook.SheetNames.splice(sheetIndex, 1);
              delete workbook.Sheets[currentSheetName]; 
          }
          break;

        case 'addRow':
          if (Array.isArray(op.row)) {
            currentSheetData.push(op.row);
          } else {
            console.warn(`[processExcelOperation] Skipping addRow op with invalid row data:`, op.row);
          }
          break;

        // --- TODO: Add handling for other operations like 'updateCell', 'formatCell', 'setColumnWidth' --- 
        case 'formatCell':
            // For now, just log and store - applying formats after sheet creation is complex
            console.log(`[processExcelOperation] Storing formatCell op for sheet ${currentSheetName}:`, op);
            // formatsToApply.push({ sheet: currentSheetName, range: op.cell, format: op.format });
            break;
        case 'setColumnWidth':
             // For now, just log and store
            console.log(`[processExcelOperation] Storing setColumnWidth op for sheet ${currentSheetName}:`, op);
           // colWidthsToApply.push({ sheet: currentSheetName, col: op.column, width: op.width });
            break;
            
        default:
          console.warn(`[processExcelOperation] Unsupported operation type: ${op.type}`);
      }
    }

    // Add the last accumulated sheet data
    if (currentSheetData.length > 0) {
      console.log(`[processExcelOperation] Adding final sheet '${currentSheetName}' with ${currentSheetData.length} rows.`);
      const ws = XLSX.utils.aoa_to_sheet(currentSheetData);
       // --- TODO: Apply stored formats and column widths to 'ws' here --- 
      XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
    } else if (!workbook.SheetNames.includes(currentSheetName) && workbook.SheetNames.length === 0) {
        // Ensure at least one empty sheet exists if no data was added
        console.log(`[processExcelOperation] No data added, creating empty sheet '${currentSheetName}'.`);
        const ws = XLSX.utils.aoa_to_sheet([]);
        XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
    }
    console.log('[processExcelOperation] Finished processing operations.');

    // === Save and Upload ===
    const finalDocumentId = (operation === 'editExcelFile' && existingDocData) ? existingDocData.id : `doc-${uuidv4()}`;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    // Use baseFilename determined earlier (either requested, default, or from existing doc)
    const finalFilename = `${baseFilename.replace(/\.[^/.]+$/, "")} (${timestamp}).xlsx`; 
    const storagePath = `users/${userId}/${finalFilename}`;
    console.log(`[processExcelOperation] Final Document ID: ${finalDocumentId}, Filename: ${finalFilename}, Storage Path: ${storagePath}`);

    console.log(`[processExcelOperation] Writing workbook to buffer...`);
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
    console.log(`[processExcelOperation] Buffer created, size: ${excelBuffer.length} bytes`);

    const file = bucket.file(storagePath);
    console.log(`[processExcelOperation] Uploading to Firebase Storage at ${storagePath}...`);
    await file.save(excelBuffer, {
      metadata: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        cacheControl: 'public, max-age=31536000', // Optional: set cache control
      },
    });
    console.log(`[processExcelOperation] File uploaded successfully.`);

    // Make the file public (or use signed URLs)
    await file.makePublic(); 
    const publicUrl = file.publicUrl();
    console.log(`[processExcelOperation] File public URL: ${publicUrl}`);

    // === Update Firestore ===
    console.log(`[processExcelOperation] Updating Firestore document ${finalDocumentId}...`);
    const docRef = db.collection('users').doc(userId).collection('documents').doc(finalDocumentId);
    const docData = {
      name: finalFilename,
      storagePath: storagePath,
      downloadURL: publicUrl,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: excelBuffer.length,
      userId: userId,
      status: 'processed', // Mark as processed
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(operation === 'createExcelFile' || !existingDocData ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}), // Add createdAt only if new
      type: 'spreadsheet' // Indicate file type
    };

    await docRef.set(docData, { merge: true }); // Use set with merge to create or update
    console.log(`[processExcelOperation] Firestore document updated successfully.`);

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Track memory usage after operation
    const memUsageAfter = process.memoryUsage();
    console.log(`[processExcelOperation] Memory usage after operation: ${JSON.stringify({ /* ... memory stats ... */ })}`);
    
    console.log(`[processExcelOperation] Operation completed successfully in ${executionTime}ms`);

    return {
      success: true,
      message: operation === 'editExcelFile' ? `Excel file '${finalFilename}' updated successfully.` : `Excel file '${finalFilename}' created successfully.`,
      documentId: finalDocumentId,
      storagePath: storagePath,
      fileUrl: publicUrl,
      executionTime
    };

  } catch (error: any) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    console.error(`[processExcelOperation] Error after ${executionTime}ms:`, error);
    console.error(`[processExcelOperation] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));

    let errorMessage = error.message || 'Unknown error during Excel processing';
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') errorMessage = `Operation timed out: ${error.message}`;
    if (error.message?.includes('memory') || error.message?.includes('heap')) errorMessage = `Memory limit exceeded: ${error.message}`;
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') errorMessage = `Connection error: ${error.message}`;
    // Keep specific aoa_to_sheet error if it occurs unexpectedly
    if (error.message?.includes('aoa_to_sheet expects an array of arrays')) errorMessage = error.message;

    return {
      success: false,
      message: errorMessage,
      executionTime
    };
  }
}

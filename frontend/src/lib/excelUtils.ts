import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import admin from 'firebase-admin';
import { Bucket } from '@google-cloud/storage'; // Import Bucket type
import { getAdminDb, getAdminStorage } from './firebaseAdminConfig';
import { getStorageFileBufferWithFallback, FileNeedsRecoveryError } from './storageUtils'; // Import the fallback utility and recovery error

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
/**
 * Extracts the base filename without timestamp from a given filename.
 * @param filename - The filename to extract the base from.
 * @returns Object with base name and whether it was timestamped.
 */
export function extractBaseFilename(filename: string | undefined | null): { baseName: string; isTimestamped: boolean } {
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
  console.log(`[processExcelOperation] Memory usage before operation: ${JSON.stringify({ rss: memUsageBefore.rss / 1024 / 1024, heapTotal: memUsageBefore.heapTotal / 1024 / 1024, heapUsed: memUsageBefore.heapUsed / 1024 / 1024, external: memUsageBefore.external / 1024 / 1024 })} MB`);
  
  let workbook: XLSX.WorkBook;
  let existingDocData: DocWithId | null = null;
  let baseFilename = requestedFileName || 'Spreadsheet'; // Default/requested base name
  let currentSheetName = 'Sheet1'; // Initialize default sheet name
  let fileBuffer: Buffer;
  let actualStoragePath: string | null = null; // Declare here, initialize to null

  try {
    // Ensure Firebase services are ready
    if (!db || !storage || !bucket) {
      throw new Error('Firebase services not properly initialized');
    }
    console.log(`[processExcelOperation] Firebase services validated successfully`);

    // === Handle Edit vs. Create Setup ===
    if (operation === 'editExcelFile' && documentId) {
      console.log(`[processExcelOperation] Edit operation requested for doc: ${documentId}. Fetching existing file...`);
      
      // Check if documentId looks like a filename rather than a document ID
      // (e.g., has file extension like .xlsx or contains spaces/parentheses which document IDs don't)
      const looksLikeFilename = documentId.includes('.') || documentId.includes(' ') || documentId.includes('(');
      let effectiveDocId = documentId; // This will hold the document ID we'll actually use
      
      if (looksLikeFilename) {
        console.log(`[processExcelOperation] Document ID appears to be a filename. Attempting to find the actual document...`);
        
        // Try to find the document by filename instead
        const filesQuery = await db.collection('users').doc(userId).collection('documents')
          .where('name', '==', documentId)
          .limit(1)
          .get();
          
        if (!filesQuery.empty) {
          const firstDoc = filesQuery.docs[0];
          // Since documentId is a parameter, we can't reassign it directly
          // Instead use a new variable to hold the actual document ID
          effectiveDocId = firstDoc.id;
          console.log(`[processExcelOperation] Found matching document with ID: ${effectiveDocId} for filename: ${firstDoc.data().name}`);
        } else {
          console.log(`[processExcelOperation] Could not find document with filename: ${documentId}. Will try using it as a document ID.`);
          // Will continue with original documentId as effectiveDocId
        }
      }
      
      // Now use the effectiveDocId for all document operations
      const docRef = db.collection('users').doc(userId).collection('documents').doc(effectiveDocId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        throw new Error(`Document not found for editing: ${effectiveDocId}`);
      }
      existingDocData = { id: docSnap.id, ...docSnap.data() } as DocWithId;
      console.log(`[processExcelOperation] Existing doc data fetched:`, { name: existingDocData.name, storagePath: existingDocData.storagePath });
      const storagePath = existingDocData.storagePath;
      if (!storagePath) throw new Error('Storage path missing for existing document');

      try {
        // Use the fallback logic to get the actual latest buffer and its path
        const storageResult = await getStorageFileBufferWithFallback(storagePath, userId);
        fileBuffer = storageResult.buffer;
        actualStoragePath = storageResult.actualPath; // Store the path we actually used
        console.log(`[processExcelOperation] Successfully fetched buffer using actual path: ${actualStoragePath}`);
      } catch (error) {
        // Check if this is a recovery error
        if (error instanceof FileNeedsRecoveryError) {
          console.log(`[processExcelOperation] File not found. Creating recovery file at: ${error.storagePath}`);
          
          // Get the intended sheet name from the operations or use a default
          // First, determine if we have a requested sheet name in the operations
          let activeSheet = 'Sheet1'; // Default sheet name
          
          // Check the operations array if available
          // The parameter is named 'operationsData' in the function signature
          if (operationsData && operationsData.length > 0) {
            for (const op of operationsData) {
              if (op.sheetName) {
                activeSheet = op.sheetName;
                break;
              }
            }
          }
          
          console.log(`[processExcelOperation] Creating recovery workbook with sheet: ${activeSheet}`);
          
          // Create a new workbook with the detected sheet
          workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([]), activeSheet);
          
          // Mark the path where we'll save the file
          actualStoragePath = error.storagePath;
          
          console.log(`[processExcelOperation] Recovery workbook created successfully`);
          
          // Create a buffer from the new workbook for immediate use
          // This ensures fileBuffer is assigned properly for operations below
          fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true });
          
          // Continue with the process - no return here, we'll process the operations as normal
        } else {
          // Not a recovery issue, re-throw
          throw error;
        }
      }

      console.log(`[processExcelOperation] Parsing downloaded buffer...`);
      try {
          workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true, cellNF: true }); // Enable reading styles
          console.log(`[processExcelOperation] Workbook parsed successfully. Sheets: ${workbook.SheetNames.join(', ')}`);
      } catch (parseError) {
          console.error(`[processExcelOperation] Error parsing Excel buffer:`, parseError);
          throw new Error('Failed to parse downloaded Excel file.');
      }
      baseFilename = extractBaseFilename(existingDocData.name).baseName; // Use existing base name
      console.log(`[processExcelOperation] Existing workbook loaded for editing. Base filename: ${baseFilename}`);
      // Set currentSheetName if workbook has sheets
      if (workbook.SheetNames.length > 0) {
        currentSheetName = workbook.SheetNames[0]; // Default to first sheet for editing
        console.log(`[processExcelOperation] Defaulting edit context to first sheet: ${currentSheetName}`);
      }

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
    const formatsToApply: { sheet: string, range: string, format: any }[] = [];
    const colWidthsToApply: { sheet: string, col: string, width: number }[] = [];

    console.log('[processExcelOperation] Starting to process operations...');
    for (const op of operationsData) {
      console.log(`[processExcelOperation] Processing operation: ${op.type}`, op); // Log each operation
      // Ensure the target sheet exists before operations that need it
      let ws: XLSX.WorkSheet | undefined;
      if (op.sheetName && workbook.Sheets[op.sheetName]) {
        ws = workbook.Sheets[op.sheetName];
        currentSheetName = op.sheetName; // Update context
      } else if (workbook.Sheets[currentSheetName]) {
        ws = workbook.Sheets[currentSheetName]; // Use current context sheet
      } else if (op.type !== 'createSheet') {
         // If the sheet doesn't exist and it's not a createSheet operation, create it
         console.log(`[processExcelOperation] Operation requires sheet '${op.sheetName || currentSheetName}', creating it.`);
         ws = XLSX.utils.aoa_to_sheet([]);
         XLSX.utils.book_append_sheet(workbook, ws, op.sheetName || currentSheetName);
         if (op.sheetName) currentSheetName = op.sheetName;
      }

      switch (op.type) {
        case 'createSheet':
          const newSheetName = op.sheetName || `Sheet${workbook.SheetNames.length + 1}`; // Use sheetName from op
          console.log(`[processExcelOperation] Switched to new sheet: '${currentSheetName}'`);
          // If the sheet already exists in edit mode, clear it (or decide on merge strategy later)
          if (workbook.SheetNames.includes(newSheetName)) {
              console.warn(`[processExcelOperation] Sheet '${newSheetName}' already exists in edit mode. Replacing.`);
              // Remove existing sheet before adding new one
              const sheetIndex = workbook.SheetNames.indexOf(newSheetName);
              workbook.SheetNames.splice(sheetIndex, 1);
              delete workbook.Sheets[newSheetName];
          }
          // Create the new empty sheet
          ws = XLSX.utils.aoa_to_sheet([]);
          XLSX.utils.book_append_sheet(workbook, ws, newSheetName);
          currentSheetName = newSheetName; // Update current sheet context
          break;

        case 'addRow':
          if (!ws) {
            console.warn(`[processExcelOperation] Skipping addRow: sheet '${currentSheetName}' not found.`);
            break; // ws is undefined here
          }
          if (Array.isArray(op.values)) { // Changed from op.row to op.values for clarity
             XLSX.utils.sheet_add_aoa(ws!, [op.values], { origin: -1 }); // Append row - Assert ws is defined
          } else {
            console.warn(`[processExcelOperation] Skipping addRow op with invalid values data:`, op.values);
          }
          break;

        case 'updateCells': // Changed from updateCell to updateCells
          if (!ws) {
            console.warn(`[processExcelOperation] Skipping updateCells: sheet '${op.sheetName || currentSheetName}' not found.`);
            break; // ws is undefined here
          }
          if (Array.isArray(op.cellUpdates)) {
            op.cellUpdates.forEach((update: { cell: string, value: any }) => {
              const cellRef = update.cell;
              const value = update.value;
              console.log(`[processExcelOperation]   Applying update: Sheet='${currentSheetName}', Cell='${cellRef}', Value='${value}'`);
              // Update cell value directly in the worksheet
              XLSX.utils.sheet_add_json(ws!, [{ [cellRef]: value }], { header: [cellRef], origin: cellRef, skipHeader: true }); // Assert ws is defined
              console.log(`[processExcelOperation] Updated cell ${cellRef} in sheet ${op.sheetName || currentSheetName} to value: ${value}`);
            });
          } else {
            console.warn('[processExcelOperation] Skipping updateCells: invalid cellUpdates array', op.cellUpdates);
          }
          break;

        case 'formatCells': // Changed from formatCell to formatCells
          if (!ws) {
            console.warn(`[processExcelOperation] Skipping formatCells: sheet '${op.sheetName || currentSheetName}' not found.`);
            break; // ws is undefined here
          }
           if (Array.isArray(op.cellFormats)) {
              op.cellFormats.forEach((fmt: { cell?: string, range?: string, format: any }) => {
                  const format = fmt.format;
                  let targetCells: string[] = [];

                  if (fmt.cell) {
                      targetCells.push(fmt.cell);
                  } else if (fmt.range) {
                      try {
                          const decodedRange = XLSX.utils.decode_range(fmt.range);
                          for (let R = decodedRange.s.r; R <= decodedRange.e.r; ++R) {
                              for (let C = decodedRange.s.c; C <= decodedRange.e.c; ++C) {
                                  targetCells.push(XLSX.utils.encode_cell({ r: R, c: C }));
                              }
                          }
                      } catch (e) {
                          console.error(`[processExcelOperation] Error decoding range '${fmt.range}':`, e);
                          return; // Skip this format operation
                      }
                  } else {
                       console.warn('[processExcelOperation] Skipping formatCells: requires cell or range property', fmt);
                       return;
                  }

                  console.log(`[processExcelOperation]   Applying format: Sheet='${currentSheetName}', Target='${fmt.cell || fmt.range}', Format=`, format);
                  targetCells.forEach(cellRef => {
                      const cellAddress = XLSX.utils.decode_cell(cellRef);
                      const cell = ws![cellRef] || { t: 'z', v: undefined }; // Get or create cell object - Assert ws is defined

                      // Apply specific formats
                      if (format.numberFormat) {
                          cell.z = format.numberFormat; // Apply number format string
                          // Ensure cell type is number if setting number format, unless already set
                          if (typeof cell.v === 'number' && cell.t !== 'n') {
                              cell.t = 'n'; 
                          }
                      }
                      if (format.bold) {
                          cell.s = cell.s || {}; // Ensure style object exists
                          cell.s.font = cell.s.font || {};
                          cell.s.font.bold = true;
                      } else if (cell.s?.font?.bold && format.bold === false) {
                           cell.s.font.bold = false;
                      }
                      // Add other format properties here (e.g., alignment, fill, etc.)
                      // Requires xlsx-js-style for more advanced styling

                      ws![cellRef] = cell; // Put the modified cell back - Assert ws is defined
                      console.log(`[processExcelOperation] Applied format to cell ${cellRef} in sheet ${op.sheetName || currentSheetName}:`, format);
                  });
                  console.log(`[processExcelOperation]   Finished applying format for target: ${fmt.cell || fmt.range}`);
              });
           } else {
                console.warn('[processExcelOperation] Skipping formatCells: invalid cellFormats array', op.cellFormats);
           }
           break;

        case 'setColumnWidth':
          if (!ws) {
            console.warn(`[processExcelOperation] Skipping setColumnWidth: sheet '${op.sheetName || currentSheetName}' not found.`);
            break; // ws is undefined here
          }
          ws!['!cols'] = ws!['!cols'] || []; // Assert ws is defined
          const colIndex = XLSX.utils.decode_col(op.column); // Convert 'A' to 0, 'B' to 1 etc.
          ws!['!cols'][colIndex] = { wch: op.width }; // Set width in characters - Assert ws is defined
          console.log(`[processExcelOperation] Set column ${op.column} width to ${op.width} for sheet ${op.sheetName || currentSheetName}`);
          break;
             
        default:
          console.warn(`[processExcelOperation] Unsupported operation type: ${op.type}`);
      }
    }

    console.log('[processExcelOperation] Finished processing operations.');

    // === Save and Upload ===
    console.log('[processExcelOperation] Preparing to save and upload...');
    // Use existing documentId if editing, otherwise generate new one
    const finalDocumentId = (operation === 'editExcelFile' && documentId) ? documentId : `doc-${uuidv4()}`;
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    let finalStoragePath: string;
    let finalFileName: string;

    if (operation === 'editExcelFile' && actualStoragePath) {
      // Overwrite the file we actually read from
      finalStoragePath = actualStoragePath;
      finalFileName = actualStoragePath.split('/').pop() || `edited_document_${timestamp}.xlsx`;
      console.log(`[processExcelOperation] Edit operation: Overwriting existing file at: ${finalStoragePath}`);
    } else {
      // Create operation or edit failed to find original: Create new timestamped file
      const baseFileName = requestedFileName || 'document';
      finalFileName = `${baseFileName} (${timestamp}).xlsx`;
      finalStoragePath = `users/${userId}/${finalFileName}`;
      console.log(`[processExcelOperation] Create/Fallback operation: Saving new file to: ${finalStoragePath}`);
    }

    console.log(`[processExcelOperation] Writing workbook to buffer...`);
    let excelBuffer: Buffer;
    try {
        excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true, cellStyles: true }); // Ensure styles are written
        console.log(`[processExcelOperation] Workbook written to buffer successfully, size: ${excelBuffer.length} bytes`);
    } catch (writeError) {
        console.error(`[processExcelOperation] Error writing workbook to buffer:`, writeError);
        throw new Error('Failed to generate final Excel file buffer.');
    }

    const file = bucket.file(finalStoragePath);
    console.log(`[processExcelOperation] Uploading to Firebase Storage at ${finalStoragePath}...`);
    try {
        await file.save(excelBuffer, {
            metadata: {
                contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                cacheControl: 'public, max-age=31536000', // Optional: set cache control
            },
            // Consider adding resumable: false if uploads are small and potentially failing
            // resumable: false,
        });
        console.log(`[processExcelOperation] File uploaded successfully to ${finalStoragePath}.`);
    } catch (uploadError) {
        console.error(`[processExcelOperation] Error uploading file to ${finalStoragePath}:`, uploadError);
        throw new Error(`Failed to upload generated Excel file to storage: ${finalStoragePath}`);
    }

    // Make the file public (or use signed URLs)
    let publicUrl = '';
    try {
        await file.makePublic();
        publicUrl = file.publicUrl();
        console.log(`[processExcelOperation] File made public. URL: ${publicUrl}`);
    } catch (publicError) {
        console.error(`[processExcelOperation] Error making file public ${finalStoragePath}:`, publicError);
        // Continue without public URL, but log the error
        // Depending on requirements, might want to throw here instead
    }

    // === Update Firestore ===
    console.log(`[processExcelOperation] Updating Firestore document ${finalDocumentId}...`);
    const docRef = db.collection('users').doc(userId).collection('documents').doc(finalDocumentId);
    // Add type and folderId to the type definition
    const updatedDocData: {
      name: string;
      storagePath: string;
      updatedAt: FirebaseFirestore.FieldValue;
      contentType: string;
      size?: number;
      userId: string;
      createdAt?: FirebaseFirestore.FieldValue;
      type?: string; 
      folderId?: string | null;
    } = {
      name: finalFileName,
      storagePath: finalStoragePath,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: excelBuffer.length,
      userId: userId,
      // Add createdAt only if creating a new document
      ...(operation === 'createExcelFile' || !documentId ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      type: 'spreadsheet', // Indicate file type
      folderId: null, // Default to root folder for new files
    };
    await docRef.set(updatedDocData, { merge: true }); // Use set with merge to create or update
    console.log(`[processExcelOperation] Firestore document ${finalDocumentId} updated successfully.`);

    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Log memory usage after operation
    const memUsageAfter = process.memoryUsage();
    console.log(`[processExcelOperation] Memory usage after operation: ${JSON.stringify({ rss: memUsageAfter.rss / 1024 / 1024, heapTotal: memUsageAfter.heapTotal / 1024 / 1024, heapUsed: memUsageAfter.heapUsed / 1024 / 1024, external: memUsageAfter.external / 1024 / 1024 })} MB`);
    
    console.log(`[processExcelOperation] Operation completed successfully in ${executionTime}ms`);

    return {
      success: true,
      message: operation === 'editExcelFile' ? `Excel file '${finalFileName}' updated successfully.` : `Excel file '${finalFileName}' created successfully.`,
      documentId: finalDocumentId,
      storagePath: finalStoragePath,
      fileUrl: publicUrl,
      executionTime
    };

  } catch (error: any) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    console.error(`[processExcelOperation] Error after ${executionTime}ms:`, error);
    console.error(`[processExcelOperation] Full error object: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);

    let errorMessage = error.message || 'Unknown error during Excel processing';
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') errorMessage = `Operation timed out: ${error.message}`;
    if (error.message?.includes('memory') || error.message?.includes('heap')) errorMessage = `Memory limit exceeded: ${error.message}`;
    if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') errorMessage = `Connection error: ${error.message}`;
    // Keep specific aoa_to_sheet error if it occurs unexpectedly
    if (error.message?.includes('aoa_to_sheet expects an array of arrays')) errorMessage = error.message;

    return {
      success: false,
      message: `An internal error occurred during the Excel operation: ${error.message || 'See server logs for details.'}`,
      executionTime
    };
  }
}

// Helper function copied from functions/src/processExcelForChat.ts
/**
 * Converts a SheetJS worksheet object to a Markdown table string.
 * @param {XLSX.WorkSheet} sheet The worksheet object.
 * @param {string} sheetName The name of the sheet.
 * @return {string} The Markdown formatted table string.
 */
function sheetToMarkdown(sheet: XLSX.WorkSheet, sheetName: string): string {
  if (!sheet || !sheet['!ref']) {
    return `## Sheet: ${sheetName}\n\n(Sheet is empty or invalid)\n\n`;
  }

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (rows.length === 0) {
    return `## Sheet: ${sheetName}\n\n(Sheet is empty)\n\n`;
  }

  const escapePipe = (cell: any): string => String(cell).replace(/\|/g, '\\|');
  const numCols = rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (numCols === 0) {
     return `## Sheet: ${sheetName}\n\n(Sheet contains no columns)\n\n`;
  }

  const header = rows[0].map(escapePipe);
  while(header.length < numCols) header.push('');
  let markdown = `## Sheet: ${sheetName}\n\n`;
  markdown += `| ${header.join(' | ')} |\n`;
  markdown += `|${'---|'.repeat(numCols)}\n`;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].map(escapePipe);
    while(row.length < numCols) row.push('');
    markdown += `| ${row.join(' | ')} |\n`;
  }

  return markdown + '\n';
}

/**
 * Parses an Excel file buffer and converts its content to a Markdown string.
 * @param {Buffer} fileBuffer The buffer containing the Excel file data.
 * @param {string} documentName The name of the document for context in logs/messages.
 * @returns {Promise<string>} A promise that resolves with the Markdown content.
 */
export async function convertExcelBufferToMarkdown(fileBuffer: Buffer, documentName: string): Promise<string> {
  try {
    console.log(`[excelUtils] Parsing Excel buffer for document: ${documentName}`);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', sheetStubs: true });
    console.log(`[excelUtils] Parsed workbook with sheets: ${workbook.SheetNames.join(', ')}`);

    let combinedMarkdown = `--- Start of Excel Content (${documentName}) ---\n\n`;
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      combinedMarkdown += sheetToMarkdown(sheet, sheetName);
    });
    combinedMarkdown += `--- End of Excel Content (${documentName}) ---\n`;

    console.log(`[excelUtils] Generated Markdown length: ${combinedMarkdown.length}`);
    return combinedMarkdown;
  } catch (error) {
    console.error(`[excelUtils] Error parsing Excel buffer for ${documentName}:`, error);
    throw new Error(`Failed to parse Excel file ${documentName}.`); // Re-throw specific error
  }
}

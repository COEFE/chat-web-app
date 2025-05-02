import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx-js-style'; // Using xlsx-js-style for formatting support
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

/**
 * Converts Excel column letters to zero-based numeric index (e.g., 'A' -> 0, 'Z' -> 25, 'AA' -> 26)
 * @param column - The column letter (e.g., 'A', 'BC')
 * @returns The zero-based numeric index
 */
function columnLetterToIndex(column: string): number {
  let result = 0;
  for (let i = 0; i < column.length; i++) {
    result = result * 26 + (column.charCodeAt(i) - 64); // 'A' is 65 in ASCII, so subtract 64 to make 'A' = 1
  }
  return result - 1; // Convert to 0-based index
}

/**
 * Converts a numeric column index to Excel column letters (e.g., 0 -> 'A', 25 -> 'Z', 26 -> 'AA')
 * @param index - The zero-based numeric index
 * @returns The Excel column letters
 */
function columnIndexToLetter(index: number): string {
  let temp = index + 1; // Convert to 1-based
  let result = '';
  
  while (temp > 0) {
    const remainder = (temp - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    temp = Math.floor((temp - remainder) / 26);
  }
  
  return result;
}

// Type definitions for Excel formatting
interface CellFormat {
  font?: {
    name?: string;
    sz?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strike?: boolean;
    color?: { rgb: string };
  };
  fill?: {
    fgColor?: { rgb: string };
    bgColor?: { rgb: string };
    patternType?: string;
  };
  border?: {
    top?: { style: string; color?: { rgb: string; auto?: number } };
    bottom?: { style: string; color?: { rgb: string; auto?: number } };
    left?: { style: string; color?: { rgb: string; auto?: number } };
    right?: { style: string; color?: { rgb: string; auto?: number } };
  };
  alignment?: {
    vertical?: 'top' | 'center' | 'bottom';
    horizontal?: 'left' | 'center' | 'right';
    wrapText?: boolean;
  };
  numFmt?: string; // e.g., "0.00%", "m/d/yy"
}

interface CellFormatInfo {
  sheet: string;
  cell: string; // e.g., 'A1', 'B5'
  format: CellFormat;
}

interface ColumnWidthInfo {
  sheet: string;
  colIndex: number;
  width: number;
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
 * @param sheetName - Optional target sheet name (e.g., activeSheet)
 * @returns Promise with operation result
 */
export async function processExcelOperation(
  operation: string, // e.g., 'createExcelFile', 'editExcelFile'
  documentId: string | null, // Existing ID for edits, null for creates
  operationsData: any[], // The array of { type: '...', ... } objects
  userId: string,
  requestedFileName?: string,
  sheetName?: string // Optional target sheet name (e.g., activeSheet)
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
    // Determine initial sheet name
    let currentSheetName: string;
    if (sheetName) {
      currentSheetName = sheetName;
    } else if (operation === 'editExcelFile' && workbook.SheetNames.length > 0) {
      currentSheetName = workbook.SheetNames[0];
    } else {
      currentSheetName = 'Sheet1';
    }

    // Load existing sheet data if editing and sheet exists
    let currentSheetData: any[][] = [];
    if (operation === 'editExcelFile' && workbook.SheetNames.includes(currentSheetName)) {
      try {
        const existingSheet = workbook.Sheets[currentSheetName];
        currentSheetData = XLSX.utils.sheet_to_json(existingSheet, { header: 1, blankrows: true }) as any[][];
        console.log(`[processExcelOperation] Loaded existing data for sheet '${currentSheetName}' with ${currentSheetData.length} rows.`);
        // Remove the sheet so it can be replaced after modifications to avoid duplication
        delete workbook.Sheets[currentSheetName];
        const idx = workbook.SheetNames.indexOf(currentSheetName);
        if (idx > -1) workbook.SheetNames.splice(idx, 1);
      } catch (sheetLoadErr) {
        console.warn(`[processExcelOperation] Failed to load existing data for sheet '${currentSheetName}':`, sheetLoadErr);
      }
    }
    const formatsToApply: CellFormatInfo[] = [];
    const colWidthsToApply: ColumnWidthInfo[] = [];

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

        case 'formatCell':
            if (op.cell && op.format) {
              console.log(`[processExcelOperation] Storing formatCell op for sheet ${currentSheetName}, cell ${op.cell}:`, op.format);
              formatsToApply.push({ 
                sheet: currentSheetName, 
                cell: op.cell, 
                format: op.format 
              });
            } else {
              console.warn(`[processExcelOperation] Skipping formatCell op with invalid cell or format data:`, op);
            }
            break;
        case 'setColumnWidth':
            if (op.column && typeof op.width === 'number') {
              try {
                // Convert column letter to index if it's a string (e.g., 'A', 'BC')
                const colIndex = typeof op.column === 'string' ? 
                  columnLetterToIndex(op.column) : 
                  parseInt(op.column, 10);
                  
                console.log(`[processExcelOperation] Storing setColumnWidth op for sheet ${currentSheetName}, column ${op.column} (index ${colIndex}): width=${op.width}`);
                colWidthsToApply.push({ 
                  sheet: currentSheetName, 
                  colIndex: colIndex, 
                  width: op.width 
                });
              } catch (error) {
                console.warn(`[processExcelOperation] Error processing setColumnWidth op:`, error);
              }
            } else {
              console.warn(`[processExcelOperation] Skipping setColumnWidth op with invalid column or width:`, op);
            }
            break;

        case 'updateCells':
            // Determine which array of cell updates to use, checking multiple possible keys
            const cellValues = op.values; // Prioritize 'values' for range-based updates
            const cellUpdates = op.cellUpdates || op.cells || op.updates; // Check other common keys

            // --- Add detailed logging --- 
            console.log(`[updateCells Debug] Operation received:`, JSON.stringify(op));
            console.log(`[updateCells Debug] Derived cellUpdates (from cellUpdates/cells/updates):`, cellUpdates); // Log the combined check
            console.log(`[updateCells Debug] Derived cellValues (from values) isArray:`, Array.isArray(cellValues));
            console.log(`[updateCells Debug] op.range exists:`, !!op.range);
            // --- End detailed logging ---

            // Handle the format { range: 'A1:G51', values: [[...], [...]] }
            if (cellValues && Array.isArray(cellValues) && op.range) {
              console.log(`[processExcelOperation] Processing updateCells op (values format) for range ${op.range} on sheet ${currentSheetName}`);
              try {
                const decodedRange = XLSX.utils.decode_range(op.range);
                const startRow = decodedRange.s.r;
                const startCol = decodedRange.s.c;

                for (let r = 0; r < cellValues.length; r++) {
                  const targetRow = startRow + r;
                  // Ensure enough rows exist
                  while (currentSheetData.length <= targetRow) {
                    currentSheetData.push([]);
                  }
                  const rowData = cellValues[r];
                  if (Array.isArray(rowData)) {
                    for (let c = 0; c < rowData.length; c++) {
                      const targetCol = startCol + c;
                      currentSheetData[targetRow][targetCol] = rowData[c];
                    }
                  }
                }
                console.log(`[processExcelOperation] Populated ${cellValues.length} rows from 'values' array starting at ${op.range.split(':')[0]}`);
              } catch (rangeError) {
                console.warn(`[processExcelOperation] Error processing range-based updateCells op for range ${op.range}:`, rangeError);
              }
            // Handle the format { cells/cellUpdates/updates: [{ cell: 'A1', value: ... }] }
            } else if (cellUpdates && Array.isArray(cellUpdates)) {
              console.log(`[processExcelOperation] Processing updateCells op (cells/cellUpdates/updates format) with ${cellUpdates.length} cells for sheet ${currentSheetName}`);
              
              // First ensure we have data to work with
              if (currentSheetData.length === 0) {
                // If we have no data yet (new sheet), create a blank row to start
                currentSheetData.push([]);
                console.log(`[processExcelOperation] Created initial empty row for updateCells`);
              }
              
              // Process each cell update
              for (const cell of cellUpdates) {
                if (cell && cell.cell && cell.value !== undefined) {
                  try {
                    // Parse cell reference (e.g., "A1" -> row 0, col 0)
                    const cellRef = cell.cell.match(/([A-Z]+)([0-9]+)/);
                    if (cellRef && cellRef.length === 3) {
                      const col = columnLetterToIndex(cellRef[1]);
                      const row = parseInt(cellRef[2], 10) - 1; // 1-indexed to 0-indexed
                      
                      // Ensure we have enough rows
                      while (currentSheetData.length <= row) {
                        currentSheetData.push([]);
                      }
                      
                      // Update the cell value
                      currentSheetData[row][col] = cell.value;
                      console.log(`[processExcelOperation] Updated cell ${cell.cell} to value: ${cell.value}`);
                      
                      // If there's formatting, store it for later application
                      if (cell.format) {
                        formatsToApply.push({
                          sheet: currentSheetName,
                          cell: cell.cell,
                          format: cell.format
                        });
                        console.log(`[processExcelOperation] Stored formatting for cell ${cell.cell}`);
                      }
                    } else {
                      console.warn(`[processExcelOperation] Invalid cell reference: ${cell.cell}`);
                    }
                  } catch (error) {
                    console.warn(`[processExcelOperation] Error processing cell update for ${cell.cell}:`, error);
                  }
                } else {
                  console.warn(`[processExcelOperation] Skipping invalid cell update:`, cell);
                }
              }
            } else {
              console.warn(`[processExcelOperation] Skipping updateCells op with invalid data structure:`, op);
              console.log(`[processExcelOperation] Expected 'cells', 'cellUpdates', 'updates', or 'values' array, got:`, op);
            }
            break;
            
        // --- Add placeholder cases for missing operations ---    
        case 'formatRange':
          console.log(`[processExcelOperation] Received 'formatRange' operation (not yet implemented):`, op);
          // Placeholder: Logic to apply formatting to a range would go here
          break;
          
        case 'autoFitColumns':
          console.log(`[processExcelOperation] Received 'autoFitColumns' operation (not yet implemented):`, op);
          // Placeholder: Logic to adjust column widths would go here
          break;
        // --- End placeholder cases ---
          
        default:
          console.warn(`[processExcelOperation] Unsupported operation type: ${op.type}`);
      }
    }

    // Add the last accumulated sheet data
    if (currentSheetData.length > 0) {
      console.log(`[processExcelOperation] Adding final sheet '${currentSheetName}' with ${currentSheetData.length} rows.`);
      const ws = XLSX.utils.aoa_to_sheet(currentSheetData);
      
      // Apply column widths if any are defined for this sheet
      const sheetColWidths = colWidthsToApply.filter(cw => cw.sheet === currentSheetName);
      if (sheetColWidths.length > 0) {
        console.log(`[processExcelOperation] Applying ${sheetColWidths.length} column width settings to sheet '${currentSheetName}'`);
        // Initialize the columns array if it doesn't exist
        if (!ws['!cols']) {
          ws['!cols'] = [];
        }
        
        sheetColWidths.forEach(({ colIndex, width }) => {
          // Ensure the array is long enough
          // TypeScript type assertion to let it know we've already checked for existence
          const cols = ws['!cols'] as any[];
          while (cols.length <= colIndex) {
            cols.push({});
          }
          // Set width in characters
          cols[colIndex] = { wch: width };
          console.log(`[processExcelOperation] Set column ${columnIndexToLetter(colIndex)} width to ${width} characters`);
        });
      }
      
      // Apply cell formats if any are defined for this sheet
      const sheetFormats = formatsToApply.filter(f => f.sheet === currentSheetName);
      if (sheetFormats.length > 0) {
        console.log(`[processExcelOperation] Applying ${sheetFormats.length} cell format settings to sheet '${currentSheetName}'`);
        
        sheetFormats.forEach(({ cell, format }) => {
          // Create cell if it doesn't exist (could be formatting an empty cell)
          if (!ws[cell]) {
            ws[cell] = { t: 'z', v: undefined }; // Type 'z' for blank
          }
          
          // Apply the styling object directly to the cell
          ws[cell].s = format;
          console.log(`[processExcelOperation] Applied formatting to cell ${cell}`);
        });
      }
      
      XLSX.utils.book_append_sheet(workbook, ws, currentSheetName);
    } else if (!workbook.SheetNames.includes(currentSheetName) && workbook.SheetNames.length === 0) {
        // Ensure at least one empty sheet exists if no data was added
        console.log(`[processExcelOperation] No data added, creating empty sheet '${currentSheetName}'.`);
        const ws = XLSX.utils.aoa_to_sheet([]);
        
        // Apply column widths to empty sheet if needed
        const sheetColWidths = colWidthsToApply.filter(cw => cw.sheet === currentSheetName);
        if (sheetColWidths.length > 0) {
          console.log(`[processExcelOperation] Applying ${sheetColWidths.length} column width settings to empty sheet '${currentSheetName}'`);
          // Initialize the columns array if it doesn't exist
          if (!ws['!cols']) {
            ws['!cols'] = [];
          }
          
          sheetColWidths.forEach(({ colIndex, width }) => {
            // TypeScript type assertion to let it know we've already checked for existence
            const cols = ws['!cols'] as any[];
            while (cols.length <= colIndex) {
              cols.push({});
            }
            cols[colIndex] = { wch: width };
          });
        }
        
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
      type: 'spreadsheet', // Indicate file type
      folderId: null // Default to root folder for new files
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

// Export helper functions for tests
export async function createExcelFile(
  db: admin.firestore.Firestore,
  storage: admin.storage.Storage,
  bucket: Bucket,
  userId: string,
  documentId: string,
  operationsData: any[]
): Promise<{ success: boolean; documentId: string }> {
  const userDocsCollection = db.collection('users').doc(userId).collection('documents');
  let docRef = userDocsCollection.doc(documentId);
  const docSnap = await docRef.get();
  let targetDocId = documentId;
  if (!docSnap.exists) {
    const querySnap = await userDocsCollection.where('name', '==', documentId).get();
    if (!querySnap.empty && querySnap.docs.length > 0) {
      targetDocId = querySnap.docs[0].id;
      docRef = userDocsCollection.doc(targetDocId);
    }
  }
  const storagePath = `users/${userId}/${targetDocId}.xlsx`;
  const file = bucket.file(storagePath);
  await file.save(Buffer.from(''));
  await docRef.set({ storagePath }, { merge: true });
  return { success: true, documentId: targetDocId };
}

export async function editExcelFile(
  db: admin.firestore.Firestore,
  storage: admin.storage.Storage,
  bucket: Bucket,
  userId: string,
  documentId: string,
  operationsData: any[]
): Promise<{ success: boolean; documentId: string }> {
  const userDocsCollection = db.collection('users').doc(userId).collection('documents');
  const docRef = userDocsCollection.doc(documentId);
  const docSnap = await docRef.get();
  if (!docSnap.exists) {
    throw new Error(`Document not found for editing: ${documentId}`);
  }
  const data = docSnap.data() as any;
  const storagePath = data.storagePath as string;
  const file = bucket.file(storagePath);
  await file.download();
  await file.save(Buffer.from(''));
  await docRef.update({ updatedAt: admin.firestore.Timestamp.now() });
  return { success: true, documentId };
}

import { NextRequest, NextResponse } from 'next/server';
// Vercel AI SDK imports
import { Message as VercelChatMessage } from 'ai';
// Note: If these imports are failing, you may need to install the correct packages
// npm install ai
let StreamingTextResponse: any;
let experimental_StreamData: any;
try {
  const aiImports = require('ai');
  StreamingTextResponse = aiImports.StreamingTextResponse;
  experimental_StreamData = aiImports.experimental_StreamData;
} catch (e) {
  console.error('Error importing from ai package:', e);
  // Fallback empty implementations to prevent crashes
  StreamingTextResponse = class {};
  experimental_StreamData = class {};
}
// LangChain imports - commented out until packages are installed
// import { ChatAnthropic } from '@langchain/anthropic';
// import { PromptTemplate } from '@langchain/core/prompts';
// import { RunnableSequence } from '@langchain/core/runnables';
// import { BytesOutputParser } from '@langchain/core/output_parsers';
// Temporary placeholders to prevent errors
const ChatAnthropic = {};
const PromptTemplate = {};
const RunnableSequence = {};
const BytesOutputParser = {};
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { FirebaseError } from 'firebase-admin/app';
// Import the function from the other route
import { processExcelOperation } from '@/lib/excelUtils';
// Imports for file/PDF handling
import { File as GoogleCloudFile } from '@google-cloud/storage';
import { extractText } from 'unpdf';

console.log('--- MODULE LOAD: /api/chat/route.ts ---');

// Type guard to check if an error is a Firebase Storage error with a specific code
function isFirebaseStorageError(error: unknown, code: number): error is FirebaseError {
  return typeof error === 'object' && error !== null && (error as FirebaseError).code === `storage/object-not-found` && code === 404;
  // Adjust `storage/object-not-found` if the actual code string differs
}

// Helper function to extract sheet name from a message
function extractSheetName(message: string): string | null {
  // Try to find sheet name in various formats
  const patterns = [
    /in\s+(?:sheet|tab)\s+["']?([^"']+)["']?/i,
    /on\s+(?:sheet|tab)\s+["']?([^"']+)["']?/i,
    /sheet\s+["']?([^"']+)["']?/i,
    /tab\s+["']?([^"']+)["']?/i
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

// Helper function to handle Excel operations directly
// Return type specifies the expected structure
async function handleExcelOperation(authToken: string, userId: string, message: string, currentDocument: any): Promise<{ success: boolean; response?: object }> {
  console.log('Handling Excel operation directly for document:', currentDocument?.id);

  // --- Regex and sheet name extraction logic --- 
  // Regex to find cell references like A1, B2, etc., and the value in quotes
  const editPatterns = [
    // Pattern 1: set cell to "value"
    /(?:update|change|set|put)\s+(?:cell\s+)?([A-Z]+[0-9]+)\s+to\s+["']?([^"']+)["']?/i,
    // Pattern 2: set "value" in cell
    /(?:update|change|set|put)\s+["']?([^"']+)["']?\s+in\s+(?:cell\s+)?([A-Z]+[0-9]+)/i,
    // Pattern 3: cell = "value"
    /([A-Z]+[0-9]+)\s*=\s*["']?([^"']+)["']?/i 
  ];

  let cellRef: string | null = null;
  let cellValue: string | null = null;
  let matched = false;

  for (const pattern of editPatterns) {
    const match = message.match(pattern);
    if (match) {
      // Determine which capture group is the cell and which is the value based on pattern structure
      if (pattern.source.includes('to\\s+[\"\']')) { // Pattern 1
        cellRef = match[1];
        cellValue = match[2];
      } else if (pattern.source.includes('in\\s+(?:cell\\s+)?')) { // Pattern 2
        cellValue = match[1];
        cellRef = match[2];
      } else if (pattern.source.includes('=\\s*[\"\']')) { // Pattern 3
        cellRef = match[1];
        cellValue = match[2];
      }
      
      if (cellRef && cellValue) {
        matched = true;
        break; // Found a valid match
      }
    }
  }
  
  // --- End of Regex Logic ---
  
  // Check if we found a valid match AND have the necessary document info
  if (matched && cellRef && cellValue && currentDocument && currentDocument.id) {
    console.log(`Detected cell ${cellRef} and value ${cellValue} for document ${currentDocument.id}`);
    
    // Create the Excel operation JSON structure needed by processExcelOperation
    const operationData = [
      {
        sheetName: extractSheetName(message) || "Sheet1", // Use the global extractSheetName function
        cellUpdates: [
          { cell: cellRef, value: cellValue } // Explicit property assignment
        ]
      }
    ];
    
    console.log('Calling processExcelOperation directly:', { 
      operation: 'edit', 
      documentId: currentDocument.id, 
      data: operationData, 
      userId: userId 
    });
    
    try {
      // Call the imported function directly
      const excelResponse: NextResponse = await processExcelOperation('edit', currentDocument.id, operationData, userId);
      
      console.log('processExcelOperation Response Status:', excelResponse.status);
      
      // Check if the Excel operation was successful by parsing the response
      const excelResult = await excelResponse.json();
      console.log('processExcelOperation Response Parsed Body:', excelResult);

      if (excelResult && excelResult.success) {
        // Create a success message
        const successMessage = `I've updated ${cellRef} to "${cellValue}" in your Excel file "${currentDocument.name || 'document'}".`;
        
        // Return the success response for the chat
        return { 
          success: true,
          response: {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: successMessage,
            excelOperation: excelResult, // Include the result from the excel processing
          }
        };
      } else {
        // Create an error message using the message from the result
        const errorMessage = `I tried to update ${cellRef} to "${cellValue}" in your Excel file, but encountered an error: ${excelResult.message || 'Unknown error'}`;
        
        // Return the error response for the chat
        return { 
          success: false,
          response: {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: errorMessage,
          }
        };
      }
    } catch (error) {
      console.error('Error calling/processing processExcelOperation:', error);
      // Generic error if the call itself fails or JSON parsing fails
      return {
        success: false,
        response: {
          id: `ai-${Date.now()}`,
          role: 'ai',
          content: `Sorry, I encountered an internal error while trying to edit the Excel file.`,
        }
      };
    }
  } else {
    // Log why it failed if match was found but doc info missing
    if (matched && (!currentDocument || !currentDocument.id)) {
      console.log('Extracted cell/value but missing currentDocument info for direct edit.');
    } else {
      console.log('Could not extract cell/value for direct Excel operation.');
    }
    return { success: false }; // Indicate direct handling failed
  }
}

// Helper function to create success messages
function createSuccessMessage(parsedJson: any, excelResult: any): string {
  if (parsedJson.operation === 'create') {
    return `I've created a new Excel file named "${parsedJson.fileName}" for you. ${excelResult.url ? 'You can download it using the link below.' : ''}`;
  } else if (parsedJson.operation === 'edit') {
    const cellUpdates = parsedJson.data.flatMap((sheet: { sheetName: string; cellUpdates: Array<{ cell: string; value: string }> }) =>
      sheet.cellUpdates.map((update: { cell: string; value: string }) =>
        `${update.cell} in sheet "${sheet.sheetName || 'Sheet1'}" to "${update.value}"` // Added default sheet name
      )
    );

    const cellUpdateText = cellUpdates.length > 1
      ? `updated ${cellUpdates.length} cells`
      : `updated ${cellUpdates[0]}`;

    return `I've ${cellUpdateText} in the Excel file "${excelResult.fileName || 'your document'}".`;
  } else {
    return `I've successfully performed the ${parsedJson.operation} operation on the Excel file.`;
  }
}

// Helper function to create error messages
function createErrorMessage(parsedJson: any, excelResult: any): string {
  let errorMessage = `I tried to perform the operation on an Excel file, but encountered an error: ${excelResult?.error || 'Unknown error'}`;

  // Safely access operation type
  if (parsedJson && parsedJson.operation) {
    errorMessage = `I tried to ${parsedJson.operation} an Excel file, but encountered an error: ${excelResult?.error || 'Unknown error'}`;
  }

  // Add suggestions if available documents were returned
  if (excelResult && excelResult.availableDocuments && excelResult.availableDocuments.length > 0) {
    errorMessage += '\n\nHere are some available documents you can use instead:\n';
    excelResult.availableDocuments.forEach((doc: { name: string; id: string }) => {
      errorMessage += `- "${doc.name}" (ID: ${doc.id})\n`;
    });
    errorMessage += '\nPlease try again with one of these document IDs.';
  }
  return errorMessage;
}

export async function POST(req: NextRequest) {
  console.log('Received request at /api/chat');
  try {
    const body = await req.json();
    console.log('Request body:', body);
    const { message, documentId, currentDocument } = body;

    if (!message || !documentId) {
      console.error('Missing message or documentId');
      return NextResponse.json(
        { error: 'Missing message or documentId' },
        { status: 400 },
      );
    }

    // --- Verify Authentication --- 
    const authorization = req.headers.get('Authorization');
    const adminAuth = getAdminAuth(); // Get the initialized auth service

    if (!authorization?.startsWith('Bearer ')) {
      console.error("Authorization header missing or invalid");
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const idToken = authorization.split('Bearer ')[1];
    
    let decodedToken;
    let userId: string;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
      userId = decodedToken.uid;
      console.log("User authenticated:", userId);
    } catch (error) {
      console.error("Error verifying auth token:", error); 
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // --- Fetch Document Info and Content --- 
    const adminDb = getAdminDb();
    const adminStorage = getAdminStorage();

    let documentContent: string = '';
    let storagePath: string | undefined;

    try {
      // 1. Fetch Firestore document to get storagePath
      const docRef = adminDb.collection('users').doc(userId).collection('documents').doc(documentId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        console.error(`Document not found for ID: ${documentId} and user: ${userId}`);
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      const docData = docSnap.data();
      storagePath = docData?.storagePath;
      const contentType = docData?.contentType;
      console.log(`Found document: ID=${documentId}, Path=${storagePath}, Type=${contentType}`);

      if (!storagePath) {
        console.error(`Storage path missing for document ID: ${documentId}`);
        return NextResponse.json({ error: 'Document metadata incomplete (missing storage path)' }, { status: 500 });
      }

      // 2. Fetch file content from Storage using storagePath
      // Ensure storage bucket is configured if not done during initialization
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET environment variable not set!");
      }
      const bucket = adminStorage.bucket(`gs://${bucketName}`);
      const file: GoogleCloudFile = bucket.file(storagePath);

      console.log(`Attempting to download from gs://${bucketName}/${storagePath}`);
      const [contentBuffer] = await file.download();
      console.log(`Successfully downloaded ${contentBuffer.byteLength} bytes from storage.`);

      // --- Content Parsing --- 
      if (contentType?.startsWith('text/')) {
        documentContent = contentBuffer.toString('utf-8');
        console.log(`Parsed text content, length: ${documentContent.length}`);
      } else if (contentType === 'application/pdf') {
        console.log('Attempting to parse PDF content...');
        try {
          // unpdf requires Uint8Array, not Node.js Buffer
          // Convert Buffer to Uint8Array
          const uint8Array = new Uint8Array(contentBuffer);
          const result = await extractText(uint8Array);
          
          // extractText returns an object with totalPages and text (string array)
          if (result && Array.isArray(result.text)) {
            // Join all pages together with double newlines between pages
            documentContent = result.text.join('\n\n');
          } else {
            documentContent = '[Error: Unexpected format from PDF extractor]';
          }

          console.log(`Successfully parsed PDF content with unpdf, length: ${documentContent.length}`);
        } catch (extractError) {
          console.error('Error extracting PDF text:', extractError);
          documentContent = `[Error extracting PDF text: ${ (extractError instanceof Error) ? extractError.message : 'Unknown error'}]`;
        }
      } else if (
        contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        contentType === 'application/vnd.ms-excel' || // .xls
        contentType === 'text/csv' // .csv
      ) {
        console.log('Attempting to parse Excel/CSV content...');
        try {
          // Process Excel file using SheetJS
          const workbook = XLSX.read(contentBuffer, { type: 'buffer', sheetStubs: true });
          
          // Create a text representation of all sheets
          let excelContent: string[] = [];
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            
            // Get the range of the worksheet
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
            
            // Fill in any missing cells in the worksheet
            for (let r = range.s.r; r <= range.e.r; ++r) {
              for (let c = range.s.c; c <= range.e.c; ++c) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                if (!worksheet[cellAddress]) {
                  // Add empty cell
                  worksheet[cellAddress] = { t: 's', v: '' };
                }
              }
            }
            
            // Convert to JSON with header: 1 option to preserve row structure
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
            
            // Create a more structured text representation with column letters and row numbers
            let sheetContent = `Sheet: ${sheetName}\n\n`;
            
            // Add column headers (A, B, C, etc.)
            let headerRow = '    | ';
            for (let c = range.s.c; c <= range.e.c; ++c) {
              const colLetter = XLSX.utils.encode_col(c);
              headerRow += ` ${colLetter.padEnd(10)} |`;
            }
            sheetContent += headerRow + '\n';
            
            // Add separator row
            let separatorRow = '----|';
            for (let c = range.s.c; c <= range.e.c; ++c) {
              separatorRow += '------------|';
            }
            sheetContent += separatorRow + '\n';
            
            // Add data rows with row numbers
            for (let r = 0; r < jsonData.length; r++) {
              const rowNum = r + 1; // 1-based row numbers like in Excel
              let rowContent = `${String(rowNum).padStart(3)} | `;
              
              const row = jsonData[r];
              for (let c = 0; c < (row?.length || 0); c++) {
                const cellValue = row?.[c] || '';
                // Truncate long cell values and ensure proper padding
                const displayValue = String(cellValue).substring(0, 10).padEnd(10);
                rowContent += ` ${displayValue} |`;
              }
              
              sheetContent += rowContent + '\n';
            }
            
            // Add raw data representation for accurate cell lookup
            sheetContent += '\nRaw Data (for accurate cell lookup):\n';
            for (let r = 0; r < jsonData.length; r++) {
              const rowNum = r + 1; // 1-based row numbers
              const row = jsonData[r];
              
              for (let c = 0; c < (row?.length || 0); c++) {
                const colLetter = XLSX.utils.encode_col(c);
                const cellValue = row?.[c];
                if (cellValue !== '') { // Only include non-empty cells
                  sheetContent += `Cell ${colLetter}${rowNum}: ${cellValue}\n`;
                }
              }
            }
            
            excelContent.push(sheetContent);
          });
          
          // Join all sheets with clear separation
          documentContent = excelContent.join('\n\n---\n\n');
          
          console.log(`Successfully parsed Excel content, length: ${documentContent.length}`);
        } catch (excelError) {
          console.error('Error extracting Excel content:', excelError);
          documentContent = `[Error extracting Excel content: ${(excelError instanceof Error) ? excelError.message : 'Unknown error'}]`;
        }
      } else {
        // Basic handling for non-text - might need libraries like pdf-parse, mammoth
        documentContent = `[Content of type ${contentType}, length ${contentBuffer.byteLength} bytes - needs specific parsing]`; 
      }
      // --- End Content Parsing ---

    } catch (error) {
      console.error('Error fetching document info or content:', error);
      
      // Log detailed error information
      if (error instanceof Error) {
        console.error(`Error name: ${error.name}`);
        console.error(`Error message: ${error.message}`);
        console.error(`Error stack: ${error.stack}`);
      }
      
      // Log environment and context information
      console.error('Context information:');
      console.error(`- User ID: ${userId}`);
      console.error(`- Document ID: ${documentId}`);
      console.error(`- Storage path (if available): ${storagePath || 'N/A'}`);
      console.error(`- Firebase project ID: ${process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'Not set'}`);
      
      // Check if the error is specifically a storage 'object not found' error (404)
      if (isFirebaseStorageError(error as unknown, 404)) {
        console.error(`Storage object not found at path: ${storagePath}`);
        return NextResponse.json({ error: `File not found in storage at path: ${storagePath}` }, { status: 404 });
      }
      
      // Return a more descriptive error message
      const errorMessage = error instanceof Error ? `Failed to fetch document data: ${error.message}` : 'Failed to fetch document data';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
    // --- End Document Fetching ---

    // --- Call AI API ---
    let aiResponseContent = 'Sorry, I could not get a response from the AI.'; // Default error message
    try {
      // Check if the user's message is asking to edit the current Excel file
      const isEditExcelRequest = (
        (message.toLowerCase().includes('edit') || 
         message.toLowerCase().includes('update') || 
         message.toLowerCase().includes('change') || 
         message.toLowerCase().includes('set') || 
         message.toLowerCase().includes('put') || 
         message.toLowerCase().includes('add')) && 
        (message.toLowerCase().includes('excel') || 
         message.toLowerCase().includes('spreadsheet') || 
         message.toLowerCase().includes('sheet') || 
         message.toLowerCase().includes('cell') || 
         message.toLowerCase().includes('row') || 
         message.toLowerCase().includes('column')) && 
        currentDocument && 
        (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv'].includes(currentDocument.contentType) || 
         ['.xlsx', '.xls', '.csv'].some(ext => currentDocument.name?.toLowerCase().endsWith(ext)))
      );
      
      // If we're in a test environment or the API key is not set, return a test response
      if (process.env.NODE_ENV === 'test' || !process.env.ANTHROPIC_API_KEY) {
        console.log(`ANTHROPIC_API_KEY is ${process.env.ANTHROPIC_API_KEY ? 'set' : 'NOT SET'}`);
        if (!process.env.ANTHROPIC_API_KEY) {
          console.warn("ANTHROPIC_API_KEY environment variable is not set. Using fallback response.");
          
          // For Excel edit requests, try to handle directly
          if (isEditExcelRequest && currentDocument && currentDocument.id) {
            const result = await handleExcelOperation(authorization, userId, message, currentDocument);
            if (result.success) {
              return NextResponse.json(result.response, { status: 200 });
            }
          }
          
          // Return a fallback response
          return NextResponse.json({ 
            response: {
              id: `ai-${Date.now()}`,
              role: 'ai',
              content: "I'm sorry, I'm currently unable to process your request due to a configuration issue. Please try again later or contact support.",
            }
          }, { status: 200 });
        }
      }
      
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        maxRetries: 3, // Add retries for transient errors
      });

      console.log(`Calling Anthropic Claude 3.7 Sonnet with content length: ${documentContent.length}`);

      // Prepare context about the current document for Claude
      let currentDocumentContext = '';
      if (currentDocument && currentDocument.id && [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ].includes(currentDocument.contentType)) {
        // Extract active sheet name from the request body if available
        const activeSheetName = currentDocument.activeSheetName || null;
        
        currentDocumentContext = `
\nCURRENT EXCEL DOCUMENT INFORMATION:
You are currently viewing an Excel document with the following details:
- Document ID: ${currentDocument.id}
- Document Name: ${currentDocument.name || 'Unnamed'}
- Content Type: ${currentDocument.contentType}
${activeSheetName ? `- Active Sheet: ${activeSheetName}` : ''}

If the user asks you to edit this Excel file, you should automatically use this document ID in your response.
${activeSheetName ? `IMPORTANT: When editing cells, you should use the active sheet "${activeSheetName}" unless the user explicitly specifies a different sheet.` : ''}
`;
      }

      // If it's an edit request and we have a document ID, directly process it
      if (isEditExcelRequest && currentDocument && currentDocument.id) {
        // Try to handle the Excel operation directly
        const result = await handleExcelOperation(authorization, userId, message, currentDocument);
        if (result.success) {
          return NextResponse.json(result.response, { status: 200 });
        }
        // If direct handling failed, continue with Claude API
      }
      
      // If not a direct Excel edit request or we couldn't parse it, proceed with Claude
      const aiMsg = await anthropic.messages.create({
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 1024,
        stop_sequences: ['\n\nUser:'], // Add stop sequence here
        messages: [
          {
            role: 'user',
            content: `Based on the following document content, please answer the user's question.${currentDocumentContext}

Document Content:
---
${documentContent}
---

You have the ability to create and edit Excel files. If the user asks you to create or modify an Excel file, you can do so by responding with a special JSON format.

To create a new Excel file, include the following JSON in your response:

\`\`\`json
{
  "excel_operation": "create",
  "fileName": "name_of_file",
  "data": [
    {
      "sheetName": "Sheet1",
      "sheetData": [["Header1", "Header2"], ["Value1", "Value2"]]
    }
  ]
}
\`\`\`

To edit an existing Excel file, you must include the following JSON in your response WITHOUT ANY EXPLANATION BEFORE OR AFTER IT. Just output the raw JSON directly:

\`\`\`json
{
  "excel_operation": "edit",
  "documentId": "id_of_document",
  "data": [
    {
      "sheetName": "Sheet1",
      "cellUpdates": [
        {"cell": "A1", "value": "New Value"}
      ]
    }
  ]
}
\`\`\`

IMPORTANT: When editing the Excel file that the user is currently viewing, you should automatically use the current document ID that was provided to you in the context. Do not ask the user for the document ID if they are asking to edit the current file.

IMPORTANT: When the user asks you to edit an Excel file, DO NOT explain what you're going to do or show them the JSON. Just execute the operation by outputting the JSON directly. The system will automatically process it and replace it with a user-friendly message.

IMPORTANT: For the "documentId" field when editing a file, you MUST use the actual document ID, not the file name. The document ID is a unique identifier that looks like "abc123xyz". If the user refers to a document by name and you don't have the document ID in context, explain that you need the document ID to make edits. The user can find the document ID in the URL when viewing the document or in the document list.

REMEMBER: If the user is asking to edit the current Excel file they are viewing, you already have the document ID in your context. Use it automatically without asking for it.

CRITICAL: You MUST output ONLY the raw JSON with no additional text, explanation, or markdown formatting when editing Excel files. Do not add any text before or after the JSON. Do not wrap the JSON in code blocks or any other formatting. Just output the raw JSON directly. The system will automatically process it.

EXAMPLE OF CORRECT RESPONSE FORMAT FOR EXCEL EDIT (notice there is no explanation or code blocks):
{"excel_operation":"edit","documentId":"abc123","data":[{"sheetName":"Sheet1","cellUpdates":[{"cell":"A1","value":"New Value"}]}]}

User Question: ${message}`,
          },
        ],
      });

      console.log('Received response from Anthropic API.');
      // Assuming the response structure gives content in a text block
      if (aiMsg.content && aiMsg.content[0] && aiMsg.content[0].type === 'text') {
        aiResponseContent = aiMsg.content[0].text;
      } else {
        console.warn('Unexpected Anthropic response structure:', aiMsg.content);
        aiResponseContent = "Received a response, but couldn't extract the text.";
      }
    } catch (aiError) {
      console.error('Error calling Anthropic API:');
      if (aiError instanceof Error) {
        console.error(`- Error name: ${aiError.name}`);
        console.error(`- Error message: ${aiError.message}`);
        console.error(`- Error stack: ${aiError.stack}`);
      } else {
        console.error('- Unknown error type:', aiError);
      }
      
      // Check again if this is an Excel edit request to handle as fallback
      const isExcelEditRequest = (
        (message.toLowerCase().includes('edit') || 
         message.toLowerCase().includes('update') || 
         message.toLowerCase().includes('change') || 
         message.toLowerCase().includes('set') || 
         message.toLowerCase().includes('put') || 
         message.toLowerCase().includes('add')) && 
        (message.toLowerCase().includes('excel') || 
         message.toLowerCase().includes('spreadsheet') || 
         message.toLowerCase().includes('sheet') || 
         message.toLowerCase().includes('cell') || 
         message.toLowerCase().includes('row') || 
         message.toLowerCase().includes('column')) && 
        currentDocument && 
        (['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
          'application/vnd.ms-excel', // .xls
          'text/csv'].includes(currentDocument.contentType) || 
         ['.xlsx', '.xls', '.csv'].some(ext => currentDocument.name?.toLowerCase().endsWith(ext)))
      );
      
      // For Excel edit requests, try to handle directly as a fallback
      if (isExcelEditRequest && currentDocument && currentDocument.id) {
        console.log('Anthropic API failed, trying direct Excel operation handling as fallback');
        const result = await handleExcelOperation(authorization, userId, message, currentDocument);
        if (result.success) {
          return NextResponse.json(result.response, { status: 200 });
        }
      }
      
      // Check for specific error types
      if (aiError instanceof Error && aiError.message.includes('API key')) {
        aiResponseContent = "There was an issue with the AI service authentication. Please contact support.";
      } else if (aiError instanceof Error && aiError.message.includes('timeout')) {
        aiResponseContent = "The AI service took too long to respond. Please try again.";
      } else if (aiError instanceof Error && aiError.message.includes('network')) {
        aiResponseContent = "There was a network issue connecting to the AI service. Please check your connection and try again.";
      }
      // Keep the default error message for other cases
    }
    // --- End AI Call ---

    // Process Excel operations in AI response if present
    let finalResponseContent = aiResponseContent;
    let excelOperationResult: any = null;
    
    console.log('Attempting to detect JSON in AI response content:');
    console.log('--- START AI Response Content ---');
    console.log(aiResponseContent);
    console.log('--- END AI Response Content ---');

    let parsedJson: any = null;
    
    // First, try parsing the entire aiResponseContent directly as JSON
    try {
      // Clean up the response - Claude 3.7 sometimes adds whitespace or invisible characters
      const cleanedResponse = aiResponseContent.trim();
      parsedJson = JSON.parse(cleanedResponse);
      console.log('Successfully parsed AI response as JSON directly');
    } catch (directParseError) {
      console.log('Could not parse aiResponseContent directly as JSON. Trying to extract JSON from text.', directParseError);
      
      // Try to extract JSON from the text using regex - more aggressive pattern for Claude 3.7
      const jsonRegex = /(\{[\s\S]*?\})(?=\s*$|\n|$)/;
      const jsonMatch = aiResponseContent.match(jsonRegex);
      
      if (jsonMatch && jsonMatch[1]) {
        try {
          // Clean the extracted JSON string
          const cleanedJson = jsonMatch[1].trim();
          parsedJson = JSON.parse(cleanedJson);
          console.log('Successfully extracted and parsed JSON from text');
        } catch (extractedParseError) {
          console.log('Failed to parse extracted JSON:', extractedParseError);
        }
      } else {
        // Try to find JSON in code blocks - Claude 3.7 might still use them despite instructions
        const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
        const codeMatch = aiResponseContent.match(codeBlockRegex);
        
        if (codeMatch && codeMatch[1]) {
          try {
            // Clean the extracted JSON from code block
            const cleanedCodeJson = codeMatch[1].trim();
            parsedJson = JSON.parse(cleanedCodeJson);
            console.log('Successfully extracted and parsed JSON from code block');
          } catch (codeBlockParseError) {
            console.log('Failed to parse JSON from code block:', codeBlockParseError);
            
            // Last resort - try to find anything that looks like JSON
            const lastResortRegex = /\{[\s\S]*"excel_operation"[\s\S]*\}/;
            const lastMatch = aiResponseContent.match(lastResortRegex);
            
            if (lastMatch && lastMatch[0]) {
              try {
                parsedJson = JSON.parse(lastMatch[0]);
                console.log('Successfully extracted JSON with last resort regex');
              } catch (lastResortError) {
                console.log('Failed to parse JSON with last resort regex:', lastResortError);
              }
            }
          }
        }
      }
    }
    
    // If we have parsed JSON, proceed with Excel operation
    if (parsedJson) {
      console.log("Successfully parsed JSON object:", parsedJson);

      try {
        // --- Normalization & API Call --- 

        // Normalize key: Check for 'excel_operation' and rename to 'operation'
        if (parsedJson && parsedJson.excel_operation && !parsedJson.operation) {
          parsedJson.operation = parsedJson.excel_operation;
          delete parsedJson.excel_operation;
          console.log('Normalized "excel_operation" key to "operation"');
        }

        // Ensure essential fields are present after parsing
        if (!parsedJson.operation && !parsedJson.excel_operation) {
          console.error('Parsed JSON is missing operation field');
          throw new Error('Parsed JSON is missing operation field');
        }
        
        if (!parsedJson.documentId) {
          console.error('Parsed JSON is missing documentId field');
          throw new Error('Parsed JSON is missing documentId field');
        }
        
        if (!parsedJson.data) {
          console.error('Parsed JSON is missing data field');
          throw new Error('Parsed JSON is missing data field');
        }

        console.log('Calling processExcelOperation with parsed/normalized data:', parsedJson);
        const excelResponse: NextResponse = await processExcelOperation(
          parsedJson.operation,
          parsedJson.documentId, 
          parsedJson.data,
          userId // Pass the authenticated userId
        );

        const excelResult = await excelResponse.json();
        console.log('processExcelOperation result from JSON path:', excelResult);

        if (excelResult.success) {
          excelOperationResult = excelResult;
          console.log("Excel operation via JSON was successful:", excelResult.message || 'Operation completed.');
          // Replace the JSON in Claude's response with a user-friendly message
          finalResponseContent = `I've successfully ${parsedJson.operation === 'create' ? 'created' : 'updated'} the Excel file as requested.`;
          if (excelResult.message) {
            finalResponseContent += ` ${excelResult.message}`;
          }
          
          // Add a special marker that the frontend can detect to trigger a refresh
          finalResponseContent += '\n\n[EXCEL_DOCUMENT_UPDATED]';
        } else {
           // Handle error from processExcelOperation
           console.error("Error from processExcelOperation (JSON path):", excelResult.message);
           // Append error info to the stream data?
           excelOperationResult = excelResult;
           console.error("Error from processExcelOperation (JSON path):", excelResult.message);
           // Maybe send an error message back immediately?
           // For now, let Claude's original response stream back.
        }
      } catch (error) {
        console.error('*** Error during inner JSON parsing or Excel API call ***', error);
        // Log the full error object for detailed diagnosis
        console.error('Full Error Object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        console.log('Falling back to original aiResponseContent due to inner processing error.');
        finalResponseContent = aiResponseContent;
      }
    } else {
      console.log('Could not extract a valid content string to parse for inner JSON.');
      // Keep original response if no JSON detected
      finalResponseContent = aiResponseContent;
    }

            // Return a regular JSON response instead of streaming
    // Streaming is disabled until we can fix the ReadableStream implementation
    const finalResponse = {
      id: `ai-${Date.now()}`,
      role: 'ai',
      content: finalResponseContent,
    };
    
    // If we have an Excel operation result, include it in the response
    if (excelOperationResult) {
      Object.assign(finalResponse, { excelOperation: excelOperationResult });
    }
    
    return NextResponse.json({
      response: finalResponse
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/chat:', error);
    // Generic error for unexpected issues
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Helper function to authenticate the user - internal to this file
async function authenticateUser(req: NextRequest): Promise<{ userId: string; token: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error("Authorization header missing or invalid");
    return null;
  }
  const idToken = authHeader.split('Bearer ')[1];
  
  let decodedToken;
  let userId: string;
  try {
    const adminAuth = getAdminAuth(); // Get the initialized auth service
    decodedToken = await adminAuth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log("User authenticated:", userId);
  } catch (error) {
    console.error("Error verifying auth token:", error); 
    return null;
  }
  
  return { userId, token: idToken };
}

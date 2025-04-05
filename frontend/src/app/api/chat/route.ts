import { NextRequest, NextResponse } from 'next/server';
import {
  getAdminAuth,
  getAdminDb,
  getAdminStorage,
} from '@/lib/firebaseAdminConfig'; // Import getters
import { File } from '@google-cloud/storage';
import { extractText } from 'unpdf'; // Import unpdf's extractText function
import Anthropic from '@anthropic-ai/sdk';
import { FirebaseError } from 'firebase-admin/app';
import * as XLSX from 'xlsx'; // Import xlsx library for Excel processing

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
async function handleExcelOperation(req: NextRequest, userId: string, message: string, currentDocument: any) {
  console.log('Handling Excel operation directly for document:', currentDocument?.id);
  
  // Extract the cell and value from the message using multiple regex patterns
  const patterns = [
    // Standard pattern: cell A1 to "value"
    /(?:cell\s+)?([A-Z]+\d+)\s+(?:to|with|as|=|:)\s+["']?([^"']+)["']?/i,
    
    // Put "value" in cell A1
    /(?:put|add|set)\s+["']?([^"']+)["']?\s+(?:in|into|to)\s+(?:cell\s+)?([A-Z]+\d+)/i,
    
    // Change A1 to "value"
    /(?:change|update|edit)\s+(?:cell\s+)?([A-Z]+\d+)\s+(?:to|with|as|=|:)\s+["']?([^"']+)["']?/i,
    
    // Add "value" to A1
    /(?:add|put)\s+["']?([^"']+)["']?\s+(?:in|into|to)\s+([A-Z]+\d+)/i
  ];
  
  let cell = '';
  let value = '';
  let match = null;
  
  // Try each pattern until we find a match
  for (const pattern of patterns) {
    match = message.match(pattern);
    if (match) {
      // For patterns where cell is first capture group
      if (pattern.toString().includes('([A-Z]+\\d+)\\s+(?:to|with|as|=|:)')) {
        cell = match[1];
        value = match[2];
      } else {
        // For patterns where value is first capture group
        value = match[1];
        cell = match[2];
      }
      break;
    }
  }
  
  if (match && cell && value) {
    console.log(`Detected cell ${cell} and value ${value}`);
    
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
    
    // Create the Excel operation JSON
    const excelOperation = {
      operation: "edit", // This needs to match the parameter name in the Excel API
      documentId: currentDocument.id,
      data: [
        {
          // Try to extract sheet name from message, default to Sheet1
          sheetName: extractSheetName(message) || "Sheet1",
          cellUpdates: [
            {cell, value}
          ]
        }
      ]
    };
    
    // Log the Excel operation being sent
    console.log('Sending Excel operation to API:', JSON.stringify(excelOperation));
    
    try {
      // Call the Excel API to perform the operation
      const excelResponse = await fetch(`${req.nextUrl.origin}/api/excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('Authorization') || '',
        },
        body: JSON.stringify(excelOperation),
      });
      
      const excelResult = await excelResponse.json();
      console.log('Excel API response status:', excelResponse.status);
      console.log('Excel API response result:', excelResult);
      
      if (excelResponse.ok) {
        // Create a success message
        const successMessage = `I've updated ${cell} to "${value}" in your Excel file "${currentDocument.name}".`;
        
        // Return the success response
        return { 
          success: true,
          response: {
            id: `ai-${Date.now()}`,
            role: 'ai',
            content: successMessage,
            excelOperation: excelResult,
          }
        };
      } else {
        // Create an error message
        const errorMessage = `I tried to update ${cell} to "${value}" in your Excel file, but encountered an error: ${excelResult.error || 'Unknown error'}`;
        
        // Return the error response
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
      console.error('Error calling Excel API:', error);
      return {
        success: false,
        response: {
          id: `ai-${Date.now()}`,
          role: 'ai',
          content: `I tried to update ${cell} to "${value}" in your Excel file, but encountered a system error. Please try again later.`,
        }
      };
    }
  }
  
  return { success: false };
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
      const file: File = bucket.file(storagePath); // Use File type from @google-cloud/storage

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
            const result = await handleExcelOperation(req, userId, message, currentDocument);
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

      console.log(`Calling Anthropic Claude 3.5 Sonnet with content length: ${documentContent.length}`);

      // Prepare context about the current document for Claude
      let currentDocumentContext = '';
      if (currentDocument && currentDocument.id && [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel', // .xls
        'text/csv' // .csv
      ].includes(currentDocument.contentType)) {
        currentDocumentContext = `
\nCURRENT EXCEL DOCUMENT INFORMATION:
You are currently viewing an Excel document with the following details:
- Document ID: ${currentDocument.id}
- Document Name: ${currentDocument.name || 'Unnamed'}
- Content Type: ${currentDocument.contentType}

If the user asks you to edit this Excel file, you should automatically use this document ID in your response.
`;
      }

      // If it's an edit request and we have a document ID, directly process it
      if (isEditExcelRequest && currentDocument && currentDocument.id) {
        // Try to handle the Excel operation directly
        const result = await handleExcelOperation(req, userId, message, currentDocument);
        if (result.success) {
          return NextResponse.json(result.response, { status: 200 });
        }
        // If direct handling failed, continue with Claude API
      }
      
      // If not a direct Excel edit request or we couldn't parse it, proceed with Claude
      const aiMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
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
        const result = await handleExcelOperation(req, userId, message, currentDocument);
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
    let processedResponse = aiResponseContent;
    let excelOperationResult = null;
    
    // Check for Excel operation JSON in the response
    // Try multiple regex patterns to catch different ways Claude might format the JSON
    const jsonCodeBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;
    const jsonRawRegex = /({\s*"(?:excel_operation|operation)"[\s\S]*?})/g;
    const jsonOperationRegex = /\{[^\}]*"(?:excel_operation|operation)"\s*:\s*"(?:create|edit)"[^\}]*\}/g;
    
    // Try code block format first (most common)
    let jsonMatches = [...aiResponseContent.matchAll(jsonCodeBlockRegex)];
    
    // If no matches, try raw JSON format
    if (jsonMatches.length === 0) {
      jsonMatches = [...aiResponseContent.matchAll(jsonRawRegex)];
      console.log('Trying raw JSON regex, found matches:', jsonMatches.length);
    }
    
    // If still no matches, try the operation-specific regex
    if (jsonMatches.length === 0) {
      jsonMatches = [...aiResponseContent.matchAll(jsonOperationRegex)];
      console.log('Trying operation-specific regex, found matches:', jsonMatches.length);
    }
    
    // Log the full AI response for debugging
    console.log('Full AI response content:', aiResponseContent);
    console.log('JSON matches found:', jsonMatches.length);
    
    if (jsonMatches.length > 0) {
      // Process the first JSON block that contains an Excel operation
      for (const match of jsonMatches) {
        try {
          const jsonStr = match[1];
          console.log('Extracted JSON string:', jsonStr);
          
          const jsonData = JSON.parse(jsonStr);
          console.log('Parsed JSON data:', jsonData);
          
          if (jsonData.excel_operation) {
            console.log('Detected Excel operation in AI response:', jsonData.excel_operation);
            console.log('Document ID in operation:', jsonData.documentId);
            
            // Call the Excel API to perform the operation
            const excelResponse = await fetch(`${req.nextUrl.origin}/api/excel`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.get('Authorization') || '',
              },
              body: JSON.stringify(jsonData),
            });
            
            const excelResult = await excelResponse.json();
            
            if (excelResponse.ok) {
              excelOperationResult = excelResult;
              
              // Replace the JSON block with a success message
              let successMessage = '';
              
              if (jsonData.excel_operation === 'create') {
                successMessage = `I've created a new Excel file named "${jsonData.fileName}" for you. ${excelResult.url ? 'You can download it using the link below.' : ''}`;
              } else if (jsonData.excel_operation === 'edit') {
                // Create a more detailed message for edit operations
                const cellUpdates = jsonData.data.flatMap((sheet: { sheetName: string; cellUpdates: Array<{ cell: string; value: string }> }) => 
                  sheet.cellUpdates.map((update: { cell: string; value: string }) => 
                    `${update.cell} in sheet "${sheet.sheetName}" to "${update.value}"`
                  )
                );
                
                const cellUpdateText = cellUpdates.length > 1 
                  ? `updated ${cellUpdates.length} cells` 
                  : `updated ${cellUpdates[0]}`;
                  
                successMessage = `I've ${cellUpdateText} in the Excel file "${excelResult.fileName || 'your document'}".`;
              } else {
                successMessage = `I've successfully performed the ${jsonData.excel_operation} operation on the Excel file.`;
              }
              
              processedResponse = processedResponse.replace(match[0], successMessage);
            } else {
              // Replace the JSON block with an error message
              let errorMessage = `I tried to ${jsonData.excel_operation} an Excel file, but encountered an error: ${excelResult.error || 'Unknown error'}`;
              
              // Add suggestions if available documents were returned
              if (excelResult.availableDocuments && excelResult.availableDocuments.length > 0) {
                errorMessage += '\n\nHere are some available documents you can use instead:\n';
                excelResult.availableDocuments.forEach((doc: { name: string; id: string }) => {
                  errorMessage += `- "${doc.name}" (ID: ${doc.id})\n`;
                });
                errorMessage += '\nPlease try again with one of these document IDs.';
              }
              
              processedResponse = processedResponse.replace(match[0], errorMessage);
            }
            
            // Only process the first valid Excel operation
            break;
          }
        } catch (error) {
          console.error('Error processing JSON in AI response:', error);
          // Continue to the next JSON block if there's an error
        }
      }
    }
    
    return NextResponse.json({ 
      response: {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: processedResponse,
        excelOperation: excelOperationResult,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/chat:', error);
    // Generic error for unexpected issues
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

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
async function handleExcelOperation(authToken: string, userId: string, message: string, currentDocument: any, activeSheet?: string): Promise<{ success: boolean; response?: object; message?: string }> {
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
    // Try to extract operation parameters via regex or some heuristics
    const sheetName = extractSheetName(message) || activeSheet || 'Sheet1';
    console.log(`[handleExcelOperation] Using sheet: ${sheetName} (extracted from message: ${extractSheetName(message)}, active sheet: ${activeSheet})`);
    
    // Default operation: Use current document and create a simple edit
    // CRITICAL: Always use the current document's ID for editing to prevent duplicates
    const documentId = currentDocument ? currentDocument.id : null;
    console.log(`[handleExcelOperation] Using document ID: '${documentId}'`);
    
    if (!documentId) {
      return { 
        success: false, 
        message: 'No document ID provided for Excel operation.' 
      };
    }
    
    // Create the Excel operation JSON structure needed by processExcelOperation
    const operationData = [
      {
        sheetName: sheetName, // Use the global extractSheetName function
        cellUpdates: [
          { cell: cellRef, value: cellValue } // Explicit property assignment
        ]
      }
    ];
    
    console.log('Calling processExcelOperation directly:', { 
      operation: 'edit', 
      documentId: documentId, 
      data: operationData, 
      userId: userId 
    });
    
    try {
      // Call the imported function directly
      const excelResponse: NextResponse = await processExcelOperation(
        'edit', // operation
        currentDocument.id, // documentId
        operationData, // data (array of row objects)
        userId // userId
      );
      
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
  try {
    initializeFirebaseAdmin(); // Ensure admin app is initialized
    const db = getAdminDb();
    const storage = getAdminStorage();
    const auth = getAdminAuth();
    console.log('--- API ROUTE: /api/chat POST Request ---');

    // --- 1. Authentication --- 
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { userId, token } = authResult;
    console.log(`Authenticated user: ${userId}`);

    // --- 2. Extract Data from Request Body --- 
    const body = await req.json();
    const messages: VercelChatMessage[] = body.messages ?? [];
    const documentIds: string[] = body.documentIds ?? []; // Expect an array
    const primaryDocumentId: string | null = body.primaryDocumentId ?? null; // Expect the ID of the main doc
    const activeSheet: string | undefined = body.activeSheet; // Active sheet for primary doc (optional)

    console.log(`Received request for documents: [${documentIds.join(', ')}], Primary: ${primaryDocumentId || 'None'}, ActiveSheet: ${activeSheet || 'N/A'}`);

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }
    if (documentIds.length === 0 && !primaryDocumentId) {
       console.warn('No document IDs provided in the request.');
       // Allow requests without documents for general chat? For now, let's assume context is needed.
       // return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
    }

    const latestUserMessage = messages[messages.length - 1]?.content;
    if (!latestUserMessage) {
       return NextResponse.json({ error: 'Latest user message content is missing' }, { status: 400 });
    }

    // --- 3. Check for Direct Excel Operation --- 
    let primaryDocumentData: any = null;
    if (primaryDocumentId) {
      try {
        const docSnap = await db.collection('users').doc(userId).collection('documents').doc(primaryDocumentId).get();
        if (docSnap.exists) {
          primaryDocumentData = { id: docSnap.id, ...docSnap.data() };
          console.log(`Fetched primary document data for potential edits: ${primaryDocumentData.name}`);
        } else {
          console.warn(`Primary document ${primaryDocumentId} not found in Firestore.`);
          // Don't fail the whole request, but edits won't work
        }
      } catch (error) {
        console.error(`Error fetching primary document ${primaryDocumentId}:`, error);
        // Don't fail the whole request
      }
    }

    if (primaryDocumentData && (latestUserMessage.toLowerCase().includes('update ') || latestUserMessage.toLowerCase().includes('change ') || latestUserMessage.toLowerCase().includes('set '))) { 
      console.log('Attempting to handle as direct Excel operation...');
      const excelOpResult = await handleExcelOperation(token, userId, latestUserMessage, primaryDocumentData, activeSheet);
      if (excelOpResult.success && excelOpResult.response) {
        console.log('Direct Excel operation handled successfully.');
        return NextResponse.json(excelOpResult.response); 
      } else if (!excelOpResult.success && excelOpResult.response) {
        console.log('Direct Excel operation failed, returning AI message.');
        return NextResponse.json(excelOpResult.response);
      } else {
         console.log('Direct Excel operation handler decided not to handle, proceeding to Claude.');
         // Fall through to Claude if not handled (e.g., pattern didn't match clearly)
      }
    }

    // --- 4. Fetch Context for ALL Selected Documents --- 
    let combinedContext = "";
    const contextFetchPromises = documentIds.map(async (docId) => {
      try {
        console.log(`Fetching context for document: ${docId}`);
        const docSnap = await db.collection('users').doc(userId).collection('documents').doc(docId).get();

        if (!docSnap.exists) {
          console.warn(`Document ${docId} not found for user ${userId}. Skipping.`);
          return `\n--- Document: ${docId} (Not Found) ---\n`;
        }

        const docData = docSnap.data();
        const storagePath = docData?.storagePath;
        const contentType = docData?.contentType;
        const docName = docData?.name || `Document ${docId}`;
        console.log(`- Found: ${docName}, Type: ${contentType}, Path: ${storagePath}`);

        if (!storagePath || !contentType) {
           console.warn(`Document ${docId} is missing storage path or content type. Skipping content fetch.`);
          return `\n--- Document: ${docName} (Metadata Error) ---\n`;
        }

        let docContent = `Error fetching content for ${docName}.`;
        const fileRef: GoogleCloudFile = storage.bucket().file(storagePath);
        const fileExists = await fileRef.exists();

        if (!fileExists[0]) {
           console.warn(`File not found in storage at path: ${storagePath}`);
           return `\n--- Document ID: ${docId} (File Not Found in Storage) ---\n`;
        }

        // Fetch content based on type
        if (contentType.includes('spreadsheetml') || contentType.includes('excel')) {
          console.log(`- Fetching Excel content for ${docName}`);
          const [fileBuffer] = await fileRef.download();
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          let excelTextContent = "";
          const sheetToRead = (docId === primaryDocumentId && activeSheet) ? activeSheet : workbook.SheetNames[0];
          if (workbook.SheetNames.includes(sheetToRead)) {
             const worksheet = workbook.Sheets[sheetToRead];
             excelTextContent = XLSX.utils.sheet_to_csv(worksheet); // Convert to CSV for text context
             console.log(`- Extracted content from sheet '${sheetToRead}' for ${docName}`);
          } else if (activeSheet && docId === primaryDocumentId) {
             console.warn(`- Active sheet '${activeSheet}' not found in primary document ${docName}. Reading first sheet '${workbook.SheetNames[0]}'.`);
             const worksheet = workbook.Sheets[workbook.SheetNames[0]];
             excelTextContent = XLSX.utils.sheet_to_csv(worksheet);
          } else {
             console.warn(`- Could not determine sheet for ${docName}. Reading first sheet '${workbook.SheetNames[0]}'.`);
             const worksheet = workbook.Sheets[workbook.SheetNames[0]];
             excelTextContent = XLSX.utils.sheet_to_csv(worksheet);
          }
          docContent = excelTextContent.substring(0, 5000); // Limit context size
        } else if (contentType === 'application/pdf') {
          console.log(`- Fetching PDF content for ${docName}`);
          const [fileBuffer] = await fileRef.download();
          const { text } = await extractText(fileBuffer); // text is string[]
          // Join the array of page strings into a single string
          const joinedText = Array.isArray(text) ? text.join('\n\n') : ''; // Use double newline separator
          docContent = joinedText.substring(0, 5000); // Limit context size
           console.log(`- Extracted text from PDF ${docName}`);
        } else if (contentType.startsWith('text/')) {
          console.log(`- Fetching Text content for ${docName}`);
          const [fileBuffer] = await fileRef.download();
          docContent = fileBuffer.toString('utf-8').substring(0, 5000); // Limit context size
           console.log(`- Read text content from ${docName}`);
        } else {
          console.warn(`- Unsupported content type '${contentType}' for document ${docName}. Skipping content.`);
          docContent = "Unsupported file type for context extraction.";
        }

        return `\n--- Document: ${docName} (ID: ${docId}) ---\n${docContent}\n--- End Document: ${docName} ---\n`;

      } catch (error) {
        console.error(`Error fetching context for document ${docId}:`, error);
         if (isFirebaseStorageError(error, 404)) {
           return `\n--- Document ID: ${docId} (File Not Found in Storage) ---\n`;
         } else {
           return `\n--- Document ID: ${docId} (Error Fetching Context) ---\n`;
         }
      }
    });

    const contextResults = await Promise.all(contextFetchPromises);
    combinedContext = contextResults.join('');
    console.log(`Combined context length: ${combinedContext.length}`);

    // --- 5. Prepare Messages for AI --- 
    const formattedMessages = messages.map(msg => ({ role: msg.role, content: msg.content }));

    // --- 6. Define System Prompt --- 
    let systemPrompt = "You are a helpful AI assistant interacting with documents.";
    if (documentIds.length > 1) {
      systemPrompt += ` The user has provided context from ${documentIds.length} documents. Use the provided context from all documents to answer the user's questions or perform comparisons.`;
    } else if (documentIds.length === 1) {
      systemPrompt += " The user has provided context from one document.";
    } else {
      systemPrompt += " The user has not provided specific document context for this query.";
    }
    
    if (primaryDocumentId && primaryDocumentData?.contentType?.includes('excel')) {
      systemPrompt += ` The primary document (ID: ${primaryDocumentId}) is an Excel file. Direct editing commands (like 'set A1 to "value"') apply ONLY to this primary document.`;
      if (activeSheet) {
         systemPrompt += ` The currently active sheet in the primary Excel document is '${activeSheet}'. Edits will target this sheet unless another sheet is specified in the command.`;
      }
    }
    
    systemPrompt += " If asked to perform an Excel operation like updating a cell, respond ONLY with a JSON object containing the 'excelOperation' details. Do not add conversational text before or after the JSON. The required JSON format is: { \"excelOperation\": { \"operation\": \"edit\", \"documentId\": \"TARGET_DOCUMENT_ID\", \"data\": [{ \"sheetName\": \"TARGET_SHEET_NAME\", \"cellUpdates\": [{ \"cell\": \"TARGET_CELL\", \"value\": \"NEW_VALUE\" }] }] } }. Use the primaryDocumentId for TARGET_DOCUMENT_ID. Determine TARGET_SHEET_NAME from the user query or the active sheet. Extract TARGET_CELL and NEW_VALUE from the query."
    systemPrompt += " For all other requests, provide a normal conversational response.";

    // --- 7. Inject Context into Messages --- 
    if (combinedContext.length > 0) {
      const lastMessageIndex = formattedMessages.length - 1;
      formattedMessages[lastMessageIndex].content = `Context from selected documents:\n${combinedContext}\n\nUser Query:\n${formattedMessages[lastMessageIndex].content}`;
      console.log('Prepended combined context to the last user message.');
    }

    // --- 8. Call Anthropic API --- 
    console.log('Attempting to instantiate Anthropic. API Key available:', !!process.env.ANTHROPIC_API_KEY);
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }); // Explicitly pass API Key
    console.log('Sending request to Anthropic...');
    const stream = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Or your preferred model
      system: systemPrompt,
      messages: formattedMessages as any, // Cast needed if types mismatch slightly
      max_tokens: 1024,
      stream: true,
    });
    console.log('Received stream from Anthropic.');

    // --- 9. Process Stream and Return Response --- 
    const data = new experimental_StreamData();
    const transformStream = new TransformStream({
      async transform(chunk, controller) {
        const messageDelta = JSON.parse( Buffer.from(chunk).toString('utf-8') );
        if (messageDelta.type === 'content_block_delta' && messageDelta.delta.type === 'text_delta') {
           controller.enqueue(messageDelta.delta.text);
        }
         if (messageDelta.type === 'message_stop') {
             data.close(); // Close the data stream when the message stream stops
         }
      },
      flush(controller) {
         try {
             data.close();
         } catch (e) {
             // Ignore error if already closed
         }
      }
    });

    const finalStream = stream.toReadableStream().pipeThrough(transformStream);
    
    return new StreamingTextResponse(finalStream, {}, data);

  } catch (error) {
    console.error("--- ERROR in /api/chat ---:", error);
    let errorMessage = 'Internal Server Error';
    let statusCode = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.message.includes('authentication')) {
        statusCode = 401;
      }
    }
    
    console.error("API Chat Error Details:", { 
        error: error, 
        message: errorMessage, 
        stack: (error instanceof Error) ? error.stack : 'N/A' 
    });

    return NextResponse.json({ error: 'An error occurred processing your chat request.', details: errorMessage }, { status: statusCode });
  }
}

// Helper function to authenticate the user - internal to this file
async function authenticateUser(req: NextRequest): Promise<{ userId: string; token: string } | null> {
  const authorizationHeader = req.headers.get('Authorization');
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error("Authorization header missing or invalid");
    return null;
  }
  const idToken = authorizationHeader.split('Bearer ')[1];
  
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

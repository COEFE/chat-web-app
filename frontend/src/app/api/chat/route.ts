import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { CoreMessage, streamText, StreamData, Message as VercelChatMessage } from 'ai'; 
import { 
    anthropic as vercelAnthropic 
} from '@ai-sdk/anthropic';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin'; 
import { firestore } from 'firebase-admin'; 
import { FirebaseError } from 'firebase-admin/app'; 
import { getAdminDb, initializeFirebaseAdmin } from '@/lib/firebaseAdminConfig'; 
import { getStorage as getAdminStorage } from 'firebase-admin/storage'; 
import { getAuth as getAdminAuth } from 'firebase-admin/auth'; 
import { processExcelOperation } from '@/lib/excelUtils'; 
import { File as GoogleCloudFile } from '@google-cloud/storage'; 
import * as XLSX from 'xlsx'; 
import { extractText } from 'unpdf'; 

console.log("--- MODULE LOAD: /api/chat/route.ts ---");

// --- Initialize Firebase Admin SDK ---
if (!admin.apps.length) {
  try {
    initializeFirebaseAdmin();
    console.log('[route.ts] Firebase Admin SDK Initialized');
  } catch (error) {
    console.error('[route.ts] Firebase Admin SDK Initialization Error:', error);
    // Handle initialization error appropriately, maybe throw?
  }
}

// --- Constants ---
const MODEL_NAME = 'claude-3-5-sonnet-20240620'; 
const MAX_TOKENS = 4000; 
const EXCEL_MAX_TOKENS = 4000; 
// Timeout constants optimized for Vercel Pro plan (60s limit)
const ANTHROPIC_TIMEOUT_MS = 30000; // 30 seconds for Anthropic API calls
const EXCEL_OPERATION_TIMEOUT_MS = 25000; // 25 seconds for Excel operations
const DEFAULT_SYSTEM_PROMPT = `You are Claude, a helpful AI assistant integrated into a web chat application. Provide concise and accurate responses. If the user asks you to interact with an Excel file, format your response strictly as a JSON object containing 'action' ('createExcelFile' or 'editExcelFile') and 'args' (specific arguments for the action, including operations like 'createSheet', 'updateCells', 'formatCells'). Do not include any explanatory text outside the JSON object when performing Excel actions. For example:
{
  "action": "editExcelFile",
  "args": {
    "operations": [
      { "type": "updateCells", "sheetName": "Sheet1", "cellUpdates": [ { "cell": "A1", "value": "New Value" } ] },
      { "type": "formatCells", "sheetName": "Sheet1", "cellFormats": [ { "cell": "A1", "format": { "bold": true } } ] }
    ]
  }
}
`;

// Initialize Anthropic SDK Client (outside of POST function)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Helper functions for creating messages
function createSuccessMessage(parsedJson: any, result: any): string {
  if (parsedJson.operation === "create") {
    return `I've created a new Excel file named "${
      parsedJson.fileName
    }" for you. ${
      result.url ? "You can download it using the link below." : ""
    }`;
  } else if (parsedJson.operation === "edit") {
    const cellUpdates = parsedJson.data.flatMap(
      (sheet: {
        sheetName: string;
        cellUpdates: Array<{ cell: string; value: string }>;
      }) =>
        sheet.cellUpdates.map(
          (update: { cell: string; value: string }) =>
            `${update.cell} in sheet "${sheet.sheetName || "Sheet1"}" to "${
              update.value
            }"` // Added default sheet name
        )
    );

    const cellUpdateText =
      cellUpdates.length > 1
        ? `updated ${cellUpdates.length} cells`
        : `updated ${cellUpdates[0]}`;

    return `I've ${cellUpdateText} in the Excel file "${
      result.fileName || "your document"
    }".`;
  } else {
    return `I've successfully performed the ${parsedJson.operation} operation on the Excel file.`;
  }
}

function createErrorMessage(parsedJson: any, result: any): string {
  let errorMessage = `I tried to perform the operation on an Excel file, but encountered an error: ${
    result?.message || result?.error || "Unknown error"
  }`;

  // Safely access operation type
  if (parsedJson && parsedJson.action) { // Check for action property
    errorMessage = `I tried to ${parsedJson.action} an Excel file, but encountered an error: ${result?.message || result?.error || "Unknown error"}`;
  }

  // Add suggestions if available documents were returned
  if (
    result &&
    result.availableDocuments &&
    result.availableDocuments.length > 0
  ) {
    errorMessage +=
      "\n\nHere are some available documents you can use instead:\n";
    result.availableDocuments.forEach(
      (doc: { name: string; id: string }) => {
        errorMessage += `- "${doc.name}" (ID: ${doc.id})\n`;
      }
    );
    errorMessage += "\nPlease try again with one of these document IDs.";
  }
  return errorMessage;
}

// Type guard to check if an error is a Firebase Storage error with a specific code
function isFirebaseStorageError(
  error: unknown,
  code: number
): error is FirebaseError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as FirebaseError).code === `storage/object-not-found` &&
    code === 404
  );
  // Adjust `storage/object-not-found` if the actual code string differs
}

// Helper function to extract sheet name from a message
function extractSheetName(message: string): string | null {
  // Try to find sheet name in various formats
  const patterns = [
    /in\s+(?:sheet|tab)\s+["']?([^"']+)["']?/i,
    /on\s+(?:sheet|tab)\s+["']?([^"']+)["']?/i,
    /sheet\s+["']?([^"']+)["']?/i,
    /tab\s+["']?([^"']+)["']?/i,
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
async function handleExcelOperation(
  authToken: string,
  userId: string,
  message: string, // Should be the JSON string payload
  currentDocument: any,
  activeSheet?: string
): Promise<{ success: boolean; response?: object; message?: string; docId?: string; storagePath?: string }> { // Added docId and storagePath to return type
  console.log('[handleExcelOperation] Received request:', { userId, message, currentDocument, activeSheet }); // <<< ADDED LOGGING

  let parsedJson: any;
  try {
    parsedJson = JSON.parse(message);
    console.log('[handleExcelOperation] Parsed JSON payload:', parsedJson); // <<< ADDED LOGGING
  } catch (error) {
    console.error('[handleExcelOperation] Failed to parse JSON message:', error);
    return { success: false, message: 'Invalid JSON format in the request message.' };
  }

  let { action, args } = parsedJson;
  // Legacy format handling - Enhanced
  if (!action && parsedJson.excelOperation && typeof parsedJson.excelOperation === 'object') {
      console.log('[handleExcelOperation] Detected legacy excelOperation format. Normalizing...'); // <<< ADDED LOGGING
      const legacyOp = parsedJson.excelOperation;
      action = legacyOp.actionType; // Assuming 'actionType' field exists
      args = { // Reconstruct args based on expected legacy structure
          docId: legacyOp.docId || currentDocument?.id || null,
          operations: legacyOp.operations || [],
          fileName: legacyOp.fileName || (legacyOp.docId ? currentDocument?.name : 'Untitled Spreadsheet'),
          sheetName: activeSheet || extractSheetName(message) || legacyOp.sheetName || 'Sheet1',
      };
      // Basic validation for normalized legacy data
      if (!action || !args.operations || !Array.isArray(args.operations)) {
          console.error('[handleExcelOperation] Failed to normalize legacy format or missing essential fields.');
          return { success: false, message: 'Failed to normalize legacy Excel request format or essential fields are missing.' };
      }
      console.log('[handleExcelOperation] Normalized legacy data:', { action, args }); // <<< ADDED LOGGING
  }

  console.log('[handleExcelOperation] Determined action and args:', { action, args }); // <<< ADDED LOGGING


  if (!action || !args) {
    console.error('[handleExcelOperation] Missing action or args in parsed JSON.');
    return { success: false, message: 'Missing action or arguments in the parsed request.' };
  }

  // Ensure args is an object before destructuring
  if (typeof args !== 'object' || args === null) {
    console.error('[handleExcelOperation] Invalid args format. Expected an object.');
    return { success: false, message: 'Invalid args format in the parsed request. Expected an object.' };
  }

  const docId = args.docId || currentDocument?.id || null;
  const operations = args.operations;
  const fileName = args.fileName || (docId ? currentDocument?.name : 'Untitled Spreadsheet'); // Use current doc name if editing
  const sheetName = args.sheetName || activeSheet || 'Sheet1'; // Prioritize activeSheet

  console.log('[handleExcelOperation] Extracted parameters:', { docId, operations, fileName, sheetName, action }); // <<< ADDED LOGGING


  if (!operations || !Array.isArray(operations) || operations.length === 0) {
      console.error('[handleExcelOperation] Missing or invalid operations array.');
      return { success: false, message: 'Missing or invalid operations array in the request.' };
  }

  // Timeout mechanism for the entire Excel operation processing
  // Using the global constant for consistent timeout handling
  let timeoutId: NodeJS.Timeout | null = null;

  const operationPromise = new Promise<{ success: boolean; response?: object; message?: string; docId?: string; storagePath?: string }>(async (resolve, reject) => {
    timeoutId = setTimeout(() => {
      console.warn(`[handleExcelOperation] Excel operation timed out after ${EXCEL_OPERATION_TIMEOUT_MS}ms.`);
      reject(new Error('Excel operation timed out.'));
    }, EXCEL_OPERATION_TIMEOUT_MS);

    try {
      let result;
      console.log(`[handleExcelOperation] Calling processExcelOperation with action: ${action}`); // <<< ADDED LOGGING
      // Ensure all necessary arguments, including fileName and sheetName, are passed
      result = await processExcelOperation(action, docId, operations, userId, fileName, sheetName); // Args should now match updated signature
      console.log('[handleExcelOperation] processExcelOperation result:', result); // <<< ADDED LOGGING

      clearTimeout(timeoutId!); // Clear timeout if operation completes successfully
      resolve(result); // Resolve the promise with the plain object result from processExcelOperation
    } catch (error: any) {
        console.error('[handleExcelOperation] Error calling processExcelOperation:', error); // <<< ADDED LOGGING
        console.error('[handleExcelOperation] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error))); // <<< ADDED LOGGING
        clearTimeout(timeoutId!); // Clear timeout on error as well
        if (error.message === 'Excel operation timed out.') {
            // Resolve with failure instead of rejecting, as the outer promise expects resolution
            resolve({ success: false, message: 'The Excel creation/editing process took too long and timed out. Please try a simpler request.' });
        } else if (isFirebaseStorageError(error, 401) || isFirebaseStorageError(error, 403)) {
            console.error('[handleExcelOperation] Firebase Storage permission error:', error);
            resolve({ success: false, message: 'Permission denied. Please ensure you have the correct permissions for Firebase Storage.' });
        } else if (error instanceof Error) {
            console.error('[handleExcelOperation] Unexpected error during Excel operation:', error);
            resolve({ success: false, message: `An unexpected error occurred during the Excel operation: ${error.message}` });
        } else {
            console.error('[handleExcelOperation] Unknown error during Excel operation:', error);
            resolve({ success: false, message: 'An unknown error occurred during the Excel operation.' });
        }
    }
  });

  try {
      const finalResult = await operationPromise;
      console.log('[handleExcelOperation] Final result after timeout handling:', finalResult); // <<< ADDED LOGGING
      return finalResult;
  } catch (error: any) { // Catch timeout error specifically if the promise was rejected (e.g., by the setTimeout directly)
      console.error('[handleExcelOperation] Caught error from operationPromise:', error); // <<< ADDED LOGGING
      if (error.message === 'Excel operation timed out.') {
          return { success: false, message: 'The Excel creation/editing process took too long and timed out. Please try a simpler request.' };
      }
      // Re-throw other unexpected errors if necessary
      return { success: false, message: `An unexpected error occurred: ${error.message}` };
  }
}

export async function POST(req: NextRequest) {
  console.log("--- /api/chat POST request received ---");

  // Get Firebase services using getter functions
  const db = getAdminDb();
  const storage = getAdminStorage();
  const auth = getAdminAuth();
  const bucket = storage.bucket(); // Default bucket

  // 1. Authentication
  const authorizationHeader = req.headers.get("Authorization");
  let userId: string;
  try {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Unauthorized: Missing or invalid Authorization header" }, { status: 401 });
    }
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log("User authenticated:", userId);
  } catch (error) {
    console.error("Authentication error:", error);
    // Explicitly log message and stack if available
    if (error instanceof Error) {
      const authErrorMessage = error.message;
      if (error.stack) {
        console.error(`[authenticateUser] Auth Error Stack: ${error.stack}`);
      }
      console.error(`[authenticateUser] Auth Error Message: ${authErrorMessage}`);
    } else {
      console.error('Non-standard error object received during authentication.');
    }
    return NextResponse.json({ error: "Unauthorized: Invalid token" }, { status: 401 });
  }

  // 2. Parse Request Body
  let body;
  try {
    body = await req.json();
    console.log("Request body parsed:", body);
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // --- Get messages, documentId, currentDocument, activeSheet from body --- 
  // Explicitly type messages as VercelChatMessage[] upon destructuring
  // Use firestore.DocumentData for currentDocument
  const { messages, documentId, currentDocument, activeSheet }: {
    messages: VercelChatMessage[];
    documentId?: string;
    currentDocument?: firestore.DocumentData;
    activeSheet?: string;
  } = body;

  // Validate required fields
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing 'messages' array in request body" }, { status: 400 });
  }
  if (!documentId) {
    console.warn("Missing documentId in request body, proceeding without document context.");
    // Allow proceeding for general chat, but document-specific features won't work
  }

  // --- Get the last user message --- 
  // The useChat hook sends the full history, the last message is the user's current input
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return NextResponse.json({ error: "Last message must be from the user" }, { status: 400 });
  }
  const userMessageContent = lastMessage.content;
  console.log(`Last user message content: "${userMessageContent}"`);
  console.log(`Active Sheet provided: ${activeSheet}`);

  // 3. Document Context Handling (if documentId provided)
  let fileContent: string | null = null;
  let fileType: string | null = null;
  let fileName: string | null = null;

  if (documentId && currentDocument?.storagePath) {
    console.log(`Processing request with document context: ID=${documentId}, Path=${currentDocument.storagePath}`);
    fileName = currentDocument.name || documentId;
    fileType = fileName?.split('.').pop()?.toLowerCase() || null;
    console.log(`File type determined as: ${fileType}`);

    try {
      const file: GoogleCloudFile = bucket.file(currentDocument.storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`File not found at path: ${currentDocument.storagePath}`);
        return NextResponse.json(
          { error: "Document file not found in storage." },
          { status: 404 }
        );
      }

      // Download file content
      const [fileBuffer] = await file.download();
      console.log(`File downloaded successfully (${fileBuffer.length} bytes)`);

      // Process based on file type
      if (fileType === 'xlsx') {
        // --- Direct Excel Handling --- 
        // Removed direct Excel handling logic
      } else if (fileType === 'pdf') {
        console.log(`[route.ts] Attempting PDF text extraction for document: ${documentId} using unpdf...`); 
        try {
           // Convert Node.js Buffer to Uint8Array
           const fileUint8Array = new Uint8Array(fileBuffer); 
           console.log(`[route.ts] Converted Buffer (length: ${fileBuffer.length}) to Uint8Array (length: ${fileUint8Array.length}) for unpdf.`);
          // Pass the Uint8Array to extractText
          const { text } = await extractText(fileUint8Array); 
          fileContent = text.join('\n'); // Join array elements into a single string
           console.log(`[route.ts] PDF content extracted successfully for document: ${documentId}.`); 
         } catch (pdfError: any) { 
             console.error(`[route.ts] Error during unpdf text extraction for document ${documentId}:`, pdfError);
             fileContent = ''; // Set to empty string on PDF extraction failure
            // Explicitly log message and stack if they exist
            if (pdfError.message) {
              console.error(`[route.ts] unpdf Error Message: ${pdfError.message}`);
            }
            if (pdfError.stack) {
              console.error(`[route.ts] unpdf Error Stack: ${pdfError.stack}`);
            }
            // Re-throw the error to be caught by the outer catch block
            throw new Error(`unpdf extraction failed: ${pdfError.message || 'Unknown PDF processing error'}`);
        }
       } else if (['txt', 'md', 'csv', 'json', 'html', 'xml', 'js', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rb', 'php'].includes(fileType || '')) {
         fileContent = fileBuffer.toString('utf-8');
         console.log("Plain text content extracted.");
       } else {
         console.warn(`Unsupported file type for content extraction: ${fileType}`);
         fileContent = `Cannot display content for file type: ${fileType}`;
       }
    } catch (error) {
      console.error(`Error processing document ${documentId}:`, error);
      // Check if it's a GCS 'object not found' error using the helper function
      if (isFirebaseStorageError(error, 404)) { 
         return NextResponse.json({ error: "Document file not found in storage." }, { status: 404 });
       } else {
         const apiErrorMessage = error instanceof Error ? error.message : "Failed to process document";
         console.error(`[route.ts] Returning 500 error: ${apiErrorMessage}`); 
         return NextResponse.json({ error: apiErrorMessage }, { status: 500 });
       }
    }
  }

  // 4. Prepare prompt for AI
  // Use the full message history
  const formattedPreviousMessages = messages
     .slice(0, -1) // Exclude the last message (current user input)
     .map((msg: VercelChatMessage) => `${msg.role}: ${msg.content}`) // Format as role: content
     .join('\n');
     
  // Construct the prompt - include history and document context
  const documentContext = fileContent 
     ? `\n\n--- Document Content (${fileName || 'current document'}) ---\n${fileContent.substring(0, 20000)} ${fileContent.length > 20000 ? '\n[Content Truncated]' : ''}\n--- End Document Content ---` 
     : '\n\nNo document context provided.';
     
  // Combine history, document context, and the latest user message
  // NOTE: Adjust formatting based on how your chosen AI model best handles history and context.
  const finalPromptContent = `Chat History:\n${formattedPreviousMessages}\n\n${documentContext}\n\nUser Question: ${userMessageContent}`;
  
  // If using LangChain or similar, you might pass the messages array directly
  // For direct Anthropic SDK, construct a prompt string or use their message format

  console.log("--- Final Prompt Content Sent to AI (excluding potential system prompt) ---");
  // console.log(finalPromptContent); // Be careful logging large prompts
  console.log("History Length:", formattedPreviousMessages.length);
  console.log("Doc Context Length:", documentContext.length);
  console.log("User Question Length:", userMessageContent.length);
  console.log("Total Prompt Approx Length:", finalPromptContent.length);
  console.log("---------------------------------------------------------------------");

  // 5. Call AI (Anthropic Example)
  try {
    // --- Build System Prompt (including Document Context if available) ---
    let finalSystemPrompt = "You are a helpful assistant. If asked to modify an Excel file or create a spreadsheet, respond ONLY with the complete JSON in the following format:\n\n{\n  \"action\": \"createExcelFile\",\n  \"args\": {\n    \"operations\": [\n      {\n        \"type\": \"createSheet\",\n        \"name\": \"Sheet1\"\n      },\n      {\n        \"type\": \"addRow\",\n        \"row\": [\"Column A\", \"Column B\", \"Column C\"]\n      },\n      {\n        \"type\": \"formatCell\",\n        \"cell\": \"A1\",\n        \"format\": {\n          \"bold\": true,\n          \"fontSize\": 14\n        }\n      },\n      {\n        \"type\": \"setColumnWidth\",\n        \"column\": \"A\",\n        \"width\": 200\n      }\n    ]\n  }\n}\n\nYour JSON response must be complete and not truncated. Do not use 'excelOperation' as a key. Always use 'action' and 'args' as the top-level keys. Do not add any introductory text, explanations, or concluding remarks around the JSON. If asked a general question or a question about the document content, answer normally.";
    if (fileContent) {
        // Append document context, truncating if necessary
        const truncatedContent = fileContent.substring(0, 20000); // Limit context size
        const isTruncated = fileContent.length > 20000;
        finalSystemPrompt += `
        
--- Document Context (${fileName || 'current document'}) ---
${truncatedContent}${isTruncated ? '\n[Content Truncated]' : ''}
--- End Document Context ---`;
        console.log(`[route.ts] Appending document context (${fileName || 'current document'}) to system prompt. Length: ${truncatedContent.length}, Truncated: ${isTruncated}`);
    } else {
        console.log("[route.ts] No document context (fileContent) to append to system prompt.");
    }
     
    // --- Prepare messages for AI API (Use the full conversation history for context) ---
    // Map VercelChatMessages to CoreMessages, filtering for valid roles.
    const messagesForStreamText: CoreMessage[] = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') // Keep only valid roles
      .map(msg => ({ // Map to the structure CoreMessage expects
        role: msg.role,
        content: msg.content,
      })) as CoreMessage[]; // Explicitly cast the final array

    // Check if this is an Excel-related request
    const lastUserMessage = messagesForStreamText.filter(msg => msg.role === 'user').pop();
    const isExcelRequest = lastUserMessage && typeof lastUserMessage.content === 'string' && (
      lastUserMessage.content.toLowerCase().includes('excel') ||
      lastUserMessage.content.toLowerCase().includes('spreadsheet') ||
      lastUserMessage.content.toLowerCase().includes('workbook') ||
      lastUserMessage.content.toLowerCase().includes('sheet') ||
      lastUserMessage.content.toLowerCase().includes('put it in a table')
    );
    
    console.log("[route.ts] Is Excel request:", isExcelRequest);
    console.log("[route.ts] Payload for AI call (Anthropic):", JSON.stringify(messagesForStreamText, null, 2)); // Log the exact payload

    // ---- START: Conditional Streaming/Non-Streaming Logic ----
    if (isExcelRequest) {
      // ---- NON-STREAMING CALL FOR EXCEL REQUESTS ----
      console.log("[route.ts] Handling as non-streaming Excel request.");
      try {
        // Filter messages for Anthropic API (user/assistant roles only)
        const finalAiMessagesForApi: MessageParam[] = messagesForStreamText
          .filter(msg => msg.role === 'user' || msg.role === 'assistant')
          .map(msg => ({
            role: msg.role as 'user' | 'assistant', // Explicitly cast role
            content: msg.content as string, // Content is expected to be string
          }));

        // Create a timeout promise for the Anthropic API call using the constant
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Anthropic API call timed out after ${ANTHROPIC_TIMEOUT_MS/1000} seconds.`));
          }, ANTHROPIC_TIMEOUT_MS);
        });
        
        // Make the non-streaming API call using the initialized 'anthropic' client from @anthropic-ai/sdk
        const response = await Promise.race([
          anthropic.messages.create({ // This uses the SDK client instance
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 4000, // Increased token limit
            system: finalSystemPrompt, // Use the potentially augmented system prompt
            messages: finalAiMessagesForApi,
          }),
          timeoutPromise
        ]) as { choices?: { message: { content: string } }[], id?: string }; // Correct type assertion for the non-streaming Anthropic response structure

        console.log("[route.ts] Non-streaming Anthropic response received:", JSON.stringify(response)); // Log the received structure

        let excelResult: { success: boolean; message?: string; fileUrl?: string } = { 
          success: false, 
          message: "Initialization error before processing AI response."
        };
        
        // Adjust the condition to check the correct path for message content
        if (response.choices && response.choices.length > 0 && response.choices[0].message && response.choices[0].message.content) {
          const jsonContent = response.choices[0].message.content;
          console.log('[route.ts] Attempting to parse AI response JSON content. Length:', jsonContent.length); // Log length
          // console.log('[route.ts] Raw JSON content:', jsonContent); // Optionally log raw content if needed for debugging, but be mindful of log size
          try {
            const aiJson = JSON.parse(jsonContent);
            console.log('[route.ts] Successfully parsed AI JSON.');
            console.log('[route.ts] Parsed JSON from non-streaming response:', aiJson);

            // Check for the presence of excelOperation and necessary fields
            if (aiJson && aiJson.action && aiJson.args && Array.isArray(aiJson.args.operations)) {
              console.log('[route.ts] AI JSON structure is valid for Excel operation. Preparing to call handleExcelOperation.');
              // Pass necessary data to the background task
              const operationData = aiJson.args.operations; // Use operations
              const operationType = aiJson.action;
              const documentIdToUse = currentDocument?.id || null; // Pass existing doc ID if available

              console.log(`[route.ts] Calling handleExcelOperation with: operation=${operationType}, docId=${documentIdToUse}, data length=${Array.isArray(operationData) ? operationData.length : 'N/A'}`);
              
              // Await the promise returned by handleExcelOperation
              try {
                  // Use the existing handleExcelOperation which now contains detailed logging
                  const operationResult = await handleExcelOperation(operationType, documentIdToUse, JSON.stringify(aiJson), userId);
                  console.log('[route.ts] handleExcelOperation result:', operationResult);
                  excelResult = operationResult as { success: boolean; message?: string; fileUrl?: string; documentId?: string; storagePath?: string; executionTime?: number };
              } catch (opError: any) {
                  console.error("[route.ts] Error calling or parsing processExcelOperation:", opError);
                  console.error("[route.ts] Full error object:", JSON.stringify(opError, Object.getOwnPropertyNames(opError)));
                  const isTimeout = opError.message && opError.message.includes('timeout');
                  excelResult = { 
                    success: false, 
                    message: isTimeout 
                      ? `The Excel operation timed out. Please try again with a simpler request or fewer operations.` 
                      : `Error performing Excel operation: ${opError.message || 'Unknown error'}` 
                  };
              }
            } else {
               console.error("[route.ts] AI response JSON did not match expected structure for Excel operation. Parsed JSON:", aiJson);
               excelResult = { success: false, message: "AI response was not a valid Excel action JSON." };
            }
          } catch (parseError: any) {
            console.error("[route.ts] Error parsing JSON from AI response:", parseError);
            console.error("[route.ts] Full JSON parse error object:", JSON.stringify(parseError, Object.getOwnPropertyNames(parseError)));
            console.error("[route.ts] Raw content that failed parsing:", jsonContent); // Log the raw content on error
            excelResult = { success: false, message: `Error parsing AI response: ${parseError.message}` };
          }
        } else {
           console.error("[route.ts] Could not find message content in non-streaming AI response structure.", JSON.stringify(response)); // Log the structure that failed
           excelResult = { success: false, message: "Could not find message content in AI response." }; // Assign to excelResult
        }

        // Construct a VercelChatMessage-like response to send back to the client
        const responseMessage: VercelChatMessage = {
            id: response.id || `excel-response-${Date.now()}`,
            role: 'assistant',
            content: excelResult.success 
              ? excelResult.message || 'Excel operation successful.'
              : excelResult.message || 'Excel operation failed.',
            // Include fileUrl if available and operation was successful
            ...(excelResult.success && excelResult.fileUrl && { excelFileUrl: excelResult.fileUrl })
        };

        // Send the single message back as the response body
        // Note: The client needs to handle this non-streamed response
        return new Response(JSON.stringify(responseMessage), {
          headers: { 'Content-Type': 'application/json' },
        });

      } catch (error: any) {
        console.error('[route.ts] Error during non-streaming Anthropic call:', error);
        const isTimeout = error.message && error.message.includes('timeout');
        const statusCode = isTimeout ? 504 : 500; // Use proper 504 status code for timeouts
        const errorMessage = isTimeout 
          ? 'The AI request timed out. Please try again with a simpler request.' 
          : 'Error processing Excel request with AI.';
          
        return new Response(JSON.stringify({ 
          error: errorMessage, 
          details: error.message,
          isTimeout: isTimeout
        }), { status: statusCode, headers: { 'Content-Type': 'application/json' } });
      }

    } else {
      // ---- STREAMING CALL FOR REGULAR CHAT ----
      console.log("[route.ts] Handling as streaming chat request.");
      // Capture variables needed in onFinish in local constants to ensure they're available in the closure
      const capturedAuthToken = req.headers.get('Authorization');
      const capturedUserId = userId;
      const capturedDocumentId = documentId;
      const capturedCurrentDocument = currentDocument;
      const capturedActiveSheet = activeSheet;
      const capturedMessages = messages;
      
      const result = await streamText({
        model: vercelAnthropic('claude-3-7-sonnet-20250219'),
        system: finalSystemPrompt, // Use the potentially augmented system prompt
        messages: messagesForStreamText, // Pass the full conversation history
        maxTokens: 4096, // Use the constant for regular chat
        onFinish: async ({ text, toolCalls, toolResults, usage, finishReason, logprobs }) => {
          console.log(`[route.ts][onFinish] Stream finished. Reason: ${finishReason}. Final text length: ${text.length}`);

          // Wrap ALL onFinish logic in its own try/catch for better error isolation
          try {
            const aiResponseText = text; // Final text from stream
            let isExcelOperation = false; // Reset for this context
            let parsedJson: any = null;
            let finalAiMessageContent = aiResponseText; // Default to raw text
            let excelResult: any = null; // Store potential Excel result

            // --- Try parsing potential JSON (Excel or otherwise) ---
            try { // Inner try for JSON parsing
              const potentialJson = aiResponseText.trim();
              if (potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
                console.log('[route.ts][onFinish] Attempting to parse AI response JSON content. Length:', potentialJson.length); // Log length
                // console.log('[route.ts][onFinish] Raw JSON content:', potentialJson); // Optionally log raw content if needed for debugging, but be mindful of log size
                parsedJson = JSON.parse(potentialJson);
                console.log('[route.ts][onFinish] Successfully parsed AI JSON.');
                console.log('[route.ts][onFinish] Parsed JSON from stream:', parsedJson);

                // Check if it IS an excel operation (this shouldn't happen if isExcelRequest was false, but check anyway)
                if (parsedJson.action && (parsedJson.action === 'editExcelFile' || parsedJson.action === 'createExcelFile') && parsedJson.args) {
                  console.warn("[route.ts][onFinish] Detected Excel JSON in non-Excel request stream!");
                  isExcelOperation = true; // Flag it, handle below
                } else if (parsedJson.excelOperation) {
                  console.warn("[route.ts][onFinish] Detected legacy Excel JSON in non-Excel request stream!");
                  // Convert legacy format if needed (logic omitted for brevity, should be same as before)
                  isExcelOperation = true; // Flag it, handle below
                }
              }
            } catch (processError) {
              console.error("[route.ts][onFinish] Error processing potential JSON in stream:", processError);
            }
            // --- End JSON Parsing ---


            // --- Handle Excel Operation (if unexpectedly detected) ---
            if (isExcelOperation && parsedJson) {
              console.log(`[route.ts][onFinish] Handling unexpected Excel Op in stream: ${parsedJson.action}`);
              // Check authToken just in case, though it should be defined
              if (!capturedAuthToken) { 
                console.error("[route.ts][onFinish] Auth token missing unexpectedly during Excel op handling.");
                finalAiMessageContent = "Error: Authentication token was missing unexpectedly.";
              } else {
                // Call handleExcelOperation - ensure arguments are correct
                const stringifiedJsonPayload = JSON.stringify(parsedJson); // Use the full parsed JSON
                excelResult = await handleExcelOperation(
                  capturedAuthToken, // Pass the captured token (now checked)
                  capturedUserId,
                  stringifiedJsonPayload,
                  capturedCurrentDocument,
                  capturedActiveSheet // Use captured activeSheet if available
                );
                console.log('[route.ts][onFinish] Unexpected Excel Op Result:', excelResult);
                // Update final message content based on result
                finalAiMessageContent = excelResult.success
                  ? createSuccessMessage(parsedJson, excelResult)
                  : createErrorMessage(parsedJson, excelResult);
              }
            }
            // --- End Unexpected Excel Handling ---


            // --- Save Chat History ---
            try { 
              if (capturedDocumentId && capturedUserId) {
                const messagesCollectionRef = db.collection('users').doc(capturedUserId).collection('documents').doc(capturedDocumentId).collection('messages');
                // Get the last user message that was actually sent in this request
                const lastUserMsgForSave = capturedMessages.filter(m => m.role === 'user').pop();

                // Ensure lastUserMsgForSave exists before accessing its properties
                if (lastUserMsgForSave) { 
                  await messagesCollectionRef.add({
                    role: lastUserMsgForSave.role, // Safe access
                    content: lastUserMsgForSave.content, // Safe access
                    createdAt: firestore.FieldValue.serverTimestamp(),
                  });
                  console.log(`[route.ts][onFinish] User message saved (streaming) for document ${capturedDocumentId}`);
                }
                
                // Save assistant message
                await messagesCollectionRef.add({
                  role: 'assistant',
                  content: finalAiMessageContent, // Use the final content after potential Excel handling
                  createdAt: firestore.FieldValue.serverTimestamp(),
                  ...(isExcelOperation && excelResult && excelResult.success && excelResult.fileUrl ? { excelFileUrl: excelResult.fileUrl } : {}), // Add URL if applicable
                });
                console.log(`[route.ts][onFinish] Assistant message saved (streaming) for document ${capturedDocumentId}`);
              } else {
                console.log("[route.ts][onFinish] Skipping chat history save (streaming) - no documentId or userId.");
              }
            } catch (saveError: any) {
              console.error(`[route.ts][onFinish] Error saving chat messages (streaming) for document ${capturedDocumentId}:`, saveError);
            }

          } catch (onFinishError: any) { // Catch errors specifically within the onFinish logic
            console.error('[route.ts][onFinish] Error during onFinish processing:', onFinishError);
            // Potentially append an error message to the stream or log it
            // Note: It's tricky to modify the response *after* the stream has finished
            // Best practice is robust logging here.
          } 
        }, // End onFinish
      }); // End streamText call
    // Return the stream response
    return result.toDataStreamResponse();
  } // End of else block
} // Closing brace for the main try block
  catch (error: any) {
    console.error("Error calling Anthropic API:", error);
    // --- SAVE HISTORY EVEN ON ERROR? --- 
    // Decide if you want to save history when the AI call fails.
    // It might be useful for debugging, but could store incomplete conversations.
    // Example: Save history including an error message from AI
    const errorMessage: VercelChatMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `Sorry, there was an error processing your request. ${error instanceof Error ? error.message : ''}`
    };
    const finalMessagesOnError = [...messages, errorMessage];
    try {
      if (documentId && userId) {
        const messagesCollectionRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
        // Get the last user message
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();

        // Ensure lastUserMsgForSave exists before accessing its properties
        if(lastUserMessage) { 
          await messagesCollectionRef.add({
            role: lastUserMessage.role,
            content: lastUserMessage.content,
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          console.log(`User message saved (on error) for document ${documentId}`);
        }
        
        // Save error message from assistant
        await messagesCollectionRef.add({
          role: 'assistant',
          content: `Sorry, there was an error processing your request. ${error instanceof Error ? error.message : ''}`,
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Error message saved for document ${documentId}`);
      } else {
        console.log("Skipping chat history save (on error) as no documentId or userId was provided.");
      }
    } catch (saveError) {
      console.error(`Error saving chat history (on error) for document ${documentId}:`, saveError);
    }

    const apiErrorMessage = error instanceof Error ? error.message : "Failed to get response from AI";
    console.error(`[route.ts] Returning 500 error: ${apiErrorMessage}`); 
    return NextResponse.json({ error: apiErrorMessage }, { status: 500 });
  }
}; // End of POST function

// Helper function to authenticate the user - internal to this file
async function authenticateUser(
  req: NextRequest
): Promise<{ userId: string; token: string } | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('[route.ts] Authentication failed: Missing or invalid Authorization header.');
    // Return null instead of throwing to allow the caller to handle the 401 response more gracefully
    return null; 
  }
  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log('[route.ts] User authenticated successfully:', decodedToken.uid);
    return { userId: decodedToken.uid, token };
  } catch (error: any) {
    console.error('[route.ts] Authentication failed:', error.message);
    // Return null here as well for consistency
    return null; 
  }
} // Closing brace for authenticateUser

// Ensure the route segment configuration is present if needed, e.g., for edge runtime
// export const runtime = 'edge'; // or remove if using nodejs runtime by default

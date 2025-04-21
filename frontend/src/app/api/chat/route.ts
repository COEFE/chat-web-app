import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { 
  CoreMessage, 
  streamText, 
  StreamData, 
  ToolCallPart, 
  ToolResultPart,
  CoreToolMessage,
  ImagePart,
  TextPart
} from 'ai';
import { z } from 'zod'; // Import Zod
import { anthropic as vercelAnthropic } from '@ai-sdk/anthropic';
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin'; 
import { firestore } from 'firebase-admin'; 
import { FirebaseError } from 'firebase-admin/app'; 
import { getAdminDb, initializeFirebaseAdmin } from '@/lib/firebaseAdminConfig'; 
import { getStorage as getAdminStorage } from 'firebase-admin/storage'; 
import { getAuth as getAdminAuth } from 'firebase-admin/auth'; 
import { processExcelOperation, extractBaseFilename } from '@/lib/excelUtils';
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

export async function POST(req: NextRequest) {
  console.log("--- /api/chat POST request received ---");

  // Get Firebase services using getter functions
  const db = getAdminDb();
  const storage = getAdminStorage();
  const auth = getAdminAuth();
  // Explicitly get bucket by name
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app'; // Match file-proxy logic
  console.log(`[Chat API] Using bucket name: ${bucketName}`);
  const bucket = storage.bucket(bucketName);

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
    console.log("Request body parsed:"); // Removed potentially large body log
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { messages, documentContext } = body;

  // Validate messages format (basic check)
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing 'messages' array in request body" }, { status: 400 });
  }

  // Initialize array for additional document contents
  if (!body.additionalContents) {
    body.additionalContents = [];
  }
  
  // Process additional documents if provided
  if (body.additionalDocumentIds && body.additionalDocumentIds.length > 0 && body.additionalDocuments && body.additionalDocuments.length > 0) {
    console.log(`Processing ${body.additionalDocumentIds.length} additional documents`);
    
    // Process each additional document
    for (let i = 0; i < body.additionalDocuments.length; i++) {
      const addDoc = body.additionalDocuments[i];
      const addDocId = body.additionalDocumentIds[i];
      
      if (!addDoc || !addDoc.storagePath) {
        console.warn(`Skipping additional document ${addDocId}: Missing storage path`);
        continue;
      }
      
      console.log(`Processing additional document: ID=${addDocId}, Path=${addDoc.storagePath}`);
      const addFileName = addDoc.name || addDocId;
      const addFileType = addFileName?.split('.').pop()?.toLowerCase() || null;
      
      try {
        // Decode the storage path
        const decodedPath = decodeURIComponent(addDoc.storagePath);
        console.log(`[Chat API] Decoded additional path: ${decodedPath}`);
        const file: GoogleCloudFile = bucket.file(decodedPath); // Use decoded path
        const [exists] = await file.exists();
        if (!exists) {
          console.warn(`Additional file not found at path: ${decodedPath}`);
          continue; // Skip this document but continue processing others
        }
        
        // Download file content
        const [fileBuffer] = await file.download();
        console.log(`Additional file downloaded successfully (${fileBuffer.length} bytes)`);
        
        let addFileContent: string;
        
        // Process file content based on file type
        if (addFileType === 'pdf') {
          try {
            // Convert Buffer to Uint8Array for PDF extraction
            const fileUint8Array = new Uint8Array(fileBuffer);
            const extractResult = await extractText(fileUint8Array);
            
            // Handle the result which might be an object with text array
            addFileContent = Array.isArray(extractResult.text) 
              ? extractResult.text.join('\n') 
              : typeof extractResult === 'string' 
                ? extractResult 
                : typeof extractResult.text === 'string' 
                  ? extractResult.text 
                  : 'Error: Could not extract text from PDF';
          } catch (pdfError) {
            console.error('Additional PDF text extraction error:', pdfError);
            continue; // Skip this document but continue processing others
          }
        } else if (addFileType === 'xlsx' || addFileType === 'xls') {
          try {
            const workbook = XLSX.read(fileBuffer);
            const sheetNames = workbook.SheetNames;
            const sheetToUse = sheetNames[0]; // Use first sheet for additional documents
            const worksheet = workbook.Sheets[sheetToUse];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            addFileContent = `Excel file "${addFileName}" sheet "${sheetToUse}" contents:\n`;
            addFileContent += jsonData.map((row: any) => row.join('\t')).join('\n');
          } catch (excelError) {
            console.error('Additional Excel processing error:', excelError);
            continue; // Skip this document but continue processing others
          }
        } else {
          // Default: treat as text file
          addFileContent = fileBuffer.toString('utf-8');
        }
        
        // Add to additional contents array
        body.additionalContents.push({
          id: addDocId,
          name: addFileName,
          content: addFileContent,
          type: addFileType || 'text'
        });
        
        console.log(`Added additional document ${addFileName} (${addFileContent.length} chars)`);
      } catch (error) {
        console.error(`Error processing additional document ${addDocId}:`, error);
        // Continue with other documents
      }
    }
  }

  // --- Get messages, documentId, currentDocument, additionalDocuments, activeSheet from body --- 
  // Explicitly type messages as CoreMessage[] upon destructuring
  // Use firestore.DocumentData for currentDocument and additionalDocuments
  const { documentId, currentDocument, additionalDocumentIds, additionalDocuments, additionalContents, activeSheet }: {
    documentId?: string;
    currentDocument?: firestore.DocumentData;
    additionalDocumentIds?: string[];
    additionalDocuments?: firestore.DocumentData[];
    additionalContents?: Array<{id: string, name: string, content: string, type: string}>;
    activeSheet?: string;
  } = body;

  // Validate required fields
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

  let systemPrompt = DEFAULT_SYSTEM_PROMPT;
  let fileContent: string | Buffer | null = null;
  let isImageContext = false;
  let imageMediaType: string | undefined;
  let imageBase64Data: string | undefined;

  // Define allowed image media types for Anthropic
  type AnthropicImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  const ALLOWED_IMAGE_TYPES: AnthropicImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

  // 3. Process Document Context (if provided)
  if (documentContext && documentContext.storagePath && documentContext.contentType && documentContext.userId === userId) {
    console.log('Processing document context:', documentContext.storagePath);
    const filePath = documentContext.storagePath;
    const contentType = documentContext.contentType;
    const fileRef = bucket.file(filePath);

    // --- IMAGE HANDLING --- 
    if (contentType.startsWith('image/')) {
      console.log(`[Chat API] Identified image context: ${contentType}`);
      isImageContext = true;
      imageMediaType = contentType;
      systemPrompt = "You are analyzing an image provided by the user. Answer their questions about it."; // Updated system prompt for image
      try {
        // Download image data as a buffer
        const [buffer] = await fileRef.download();
        imageBase64Data = buffer.toString('base64');
        console.log(`[Chat API] Successfully fetched and encoded image: ${filePath}`);
        // We don't set fileContent here, image data is handled separately
      } catch (error: any) {
        console.error(`[Chat API] Error fetching image ${filePath}:`, error);
        if (isFirebaseStorageError(error, 404)) {
          return NextResponse.json({ error: `File not found: ${filePath}` }, { status: 404 });
        } else {
          return NextResponse.json({ error: `Failed to fetch image: ${error.message}` }, { status: 500 });
        }
      }
    } 
    // --- PDF/EXCEL/TEXT HANDLING (Existing Logic) --- 
    else if (contentType === 'application/pdf') {
      console.log(`[route.ts] Attempting PDF text extraction for document: ${documentId} using unpdf...`); 
      try {
         // Convert Node.js Buffer to Uint8Array
         const [fileBuffer] = await fileRef.download();
         const fileUint8Array = new Uint8Array(fileBuffer); 
         console.log(`[route.ts] Converted Buffer (length: ${fileBuffer.length}) to Uint8Array (length: ${fileUint8Array.length}) for unpdf.`);
        // Pass the Uint8Array to extractText
        const extractResult = await extractText(fileUint8Array);
        // Handle the result which might be an object with text array
        fileContent = Array.isArray(extractResult.text) 
          ? extractResult.text.join('\n') 
          : typeof extractResult === 'string' 
            ? extractResult 
            : typeof extractResult.text === 'string' 
              ? extractResult.text 
              : 'Error: Could not extract text from PDF';
         console.log(`[route.ts] PDF content extracted successfully for document: ${documentId}.`); 
      } catch (pdfError: any) { 
          console.error(`[route.ts] Error during unpdf text extraction for document ${documentId}:`, pdfError);
          fileContent = ''; // Set to empty string on PDF extraction failure
         // Explicitly log message and stack if available
         if (pdfError.message) {
           console.error(`[route.ts] unpdf Error Message: ${pdfError.message}`);
         }
         if (pdfError.stack) {
           console.error(`[route.ts] unpdf Error Stack: ${pdfError.stack}`);
         }
         // Re-throw the error to be caught by the outer catch block
         throw new Error(`unpdf extraction failed: ${pdfError.message || 'Unknown PDF processing error'}`);
      }
    } else if (contentType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || contentType === 'application/vnd.ms-excel') {
      // Handle Excel files
      try {
        // Parse Excel file
        const [fileBuffer] = await fileRef.download();
        const workbook = XLSX.read(fileBuffer);
        const sheetNames = workbook.SheetNames;
        
        // If activeSheet is specified and exists, use that sheet
        // Otherwise, use the first sheet
        const sheetToUse = activeSheet && sheetNames.includes(activeSheet) 
          ? activeSheet 
          : sheetNames[0];
          
        const worksheet = workbook.Sheets[sheetToUse];
        
        // Convert worksheet to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Convert JSON data to string representation
        fileContent = `Excel file "${documentContext.name}" sheet "${sheetToUse}" contents:\n`;
        fileContent += jsonData.map((row: any) => row.join('\t')).join('\n');
        
        console.log(`Excel content extracted from sheet "${sheetToUse}" (${fileContent.length} chars)`);
      } catch (excelError) {
        console.error('Excel processing error:', excelError);
        return NextResponse.json(
          { error: "Failed to process Excel file." },
          { status: 500 }
        );
      }
    } else {
      // Default: treat as text file
      try {
        const [fileBuffer] = await fileRef.download();
        fileContent = fileBuffer.toString('utf-8');
        console.log(`Text file content extracted (${fileContent.length} chars)`);
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
  }

  // 4. Prepare messages for Anthropic API (Deep copy and ensure CoreMessage structure)
  // Need to ensure it matches CoreMessage[] required by streamText
  let processedMessages: CoreMessage[] = JSON.parse(JSON.stringify(messages)).map((msg: any): CoreMessage | null => {
    // Basic validation and transformation
    if ((msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') && msg.content) {
        // Ensure content is string or valid block array for CoreMessage
        const content = typeof msg.content === 'string' || Array.isArray(msg.content)
            ? msg.content
            : JSON.stringify(msg.content); // Fallback for unexpected content types
        return { role: msg.role, content: content };
    } else if (msg.role === 'tool' && msg.tool_call_id && msg.content) {
        // Structure content as ToolResultPart for CoreToolMessage
        const toolContent: ToolResultPart = {
          type: 'tool-result',
          toolCallId: msg.tool_call_id,
          toolName: 'unknown', // Attempt to determine if possible, else keep generic
          result: msg.content, // Assuming msg.content contains the result
        };
        return { role: 'tool', content: [toolContent] }; // CoreToolMessage only needs role and content
    }
    console.warn("[Chat API] Filtering out invalid message structure:", msg);
    return null; // Filter out invalid messages
  }).filter((msg: CoreMessage | null): msg is CoreMessage => msg !== null); // Remove null entries

  // --- Inject Image into the Last User Message --- 
  if (isImageContext && imageBase64Data && imageMediaType && ALLOWED_IMAGE_TYPES.includes(imageMediaType as AnthropicImageMediaType)) {
    const lastUserMessageIndex = processedMessages.slice().reverse().findIndex(msg => msg.role === 'user');
    if (lastUserMessageIndex !== -1) {
      const actualIndex = processedMessages.length - 1 - lastUserMessageIndex;
      const originalContent = processedMessages[actualIndex].content;
      let textContent = "";

      if (typeof originalContent === 'string') {
        textContent = originalContent;
      } else if (Array.isArray(originalContent)) {
        // Find the first text block if it exists
        const textBlock = originalContent.find(block => block.type === 'text');
        if (textBlock) {
          textContent = textBlock.text;
        }
      }
      
      if (!textContent) {
        // Default text if none found (should ideally not happen with user input)
        textContent = "Analyze this image."; 
      }

      // Construct the new content array with image first (Vercel AI SDK format)
      processedMessages[actualIndex].content = [
        {
          type: 'image',
          image: Buffer.from(imageBase64Data, 'base64'), // Pass the image data directly as a Buffer
          // mediaType is often inferred or handled by the provider SDK
        },
        {
          type: 'text',
          text: textContent,
        },
      ];
      console.log('[Chat API] Injected image block into the last user message.');
    } else {
      console.warn('[Chat API] Could not find a user message to inject image into.');
      // Handle error? Or proceed without image?
    }
  }

  // Add file content to the system prompt or user message if not an image context
  if (!isImageContext && fileContent) {
    // Existing logic for adding PDF/Excel content...
    // ... (Ensure this logic doesn't conflict)
    const contextMessage = `\n\n--- Document Context (${documentContext?.contentType || 'unknown'}) ---\n${typeof fileContent === 'string' ? fileContent.substring(0, 10000) : '[Binary Content]'}\n--- End Document Context ---`;
    
    // Append context to the last user message for better focus
    const lastUserMessage = processedMessages.findLast(msg => msg.role === 'user');
    if (lastUserMessage) {
      if (typeof lastUserMessage.content === 'string') {
         lastUserMessage.content += contextMessage;
      } else if (Array.isArray(lastUserMessage.content)) {
         // If content is already an array (e.g. complex input), find the last text block
         const lastTextBlock = lastUserMessage.content.findLast(block => block.type === 'text');
         if (lastTextBlock) {
            lastTextBlock.text += contextMessage;
         } else {
             // If no text block, add one (edge case)
             lastUserMessage.content.push({ type: 'text', text: contextMessage });
         }
      }
    } else {
      // Fallback: Add to system prompt if no user message (less ideal)
      systemPrompt += contextMessage;
    }

  }

  // 5. Call Anthropic API via Vercel AI SDK
  try {
    console.log('Calling Anthropic API with model:', MODEL_NAME);
    // Filter messages again just before sending to be absolutely sure
    // Ensure the messages conform to CoreMessage structure
    const finalMessagesForApi = processedMessages.filter(
        (msg): msg is CoreMessage => typeof msg === 'object' && msg !== null && 'role' in msg && 'content' in msg
    );

    const result = await streamText({
      model: vercelAnthropic(MODEL_NAME),
      system: systemPrompt,
      messages: finalMessagesForApi, // Use the correctly typed and filtered array
      maxTokens: MAX_TOKENS,
      // --- Define the Tool ---
      tools: {
        excelOperation: {
          description: 'Performs operations on Excel files (create or edit).',
          parameters: z.object({
            action: z.enum(['createExcelFile', 'editExcelFile']),
            args: z.object({
              operations: z.array(z.any()).describe('Array of operation objects (e.g., { type: "createSheet", name: "Sheet1" }, { type: "addRow", row: ["A", "B"] })'),
              fileName: z.string().optional().describe('Optional desired filename for the new Excel file.'),
              sheetName: z.string().optional().describe('Optional target sheet name (often handled by createSheet operation).')
            })
          }),
        },
      },
      onFinish: async ({ text, toolCalls, toolResults, usage, finishReason, logprobs }) => {
        console.log(`[route.ts][onFinish] Stream finished. Reason: ${finishReason}. Text length: ${text?.length ?? 0}. Tool calls: ${toolCalls?.length ?? 0}`);

        try {
          let finalAiMessageContent = text || ''; // Default to any text response
          let excelResult: any = null;
          let isExcelOperation = false;

          // Check if the Excel tool was called
          const excelToolCall = toolCalls?.find(call => call.toolName === 'excelOperation');

          if (excelToolCall) {
            isExcelOperation = true;
            console.log(`[route.ts][onFinish] Detected 'excelOperation' tool call.`);

            // Check auth token
            if (!authorizationHeader) {
              console.error("[route.ts][onFinish] Auth token missing for Excel tool call.");
              finalAiMessageContent = "Error: Authentication token was missing unexpectedly.";
              excelResult = { success: false, message: finalAiMessageContent }; // Set error state
            } else {
              try {
                // Extract validated arguments from the tool call
                // SDK automatically parses args based on schema if valid
                const { action, args } = excelToolCall.args as { action: 'createExcelFile' | 'editExcelFile', args: { operations: any[], fileName?: string, sheetName?: string } };
                const { operations, fileName, sheetName } = args;
                const documentIdToUse = documentId || null;

                // Basic check for required args
                if (!action || !operations) {
                  throw new Error("Missing required arguments ('action', 'args.operations') in tool call.");
                }

                console.log(`[route.ts][onFinish] Calling processExcelOperation via tool: action=${action}, docId=${documentIdToUse}, ops=${operations.length}, file=${fileName}, sheet=${sheetName}`);

                // Call processExcelOperation
                excelResult = await processExcelOperation(
                  action,
                  documentIdToUse,
                  operations,
                  userId,
                  fileName,
                  sheetName
                );

                console.log('[route.ts][onFinish] processExcelOperation result:', excelResult);

                // Set the final message based on the result
                if (excelResult.success) {
                  finalAiMessageContent = excelResult.message || (action === 'editExcelFile' ? 'Excel file updated.' : 'Excel file created.');
                  // Optionally include file URL if available and successful
                  if (excelResult.fileUrl) {
                    // Append a markdown link or similar - adjust formatting as needed
                    // Attempting to get filename from result, fallback to generic
                    const displayFileName = excelResult.name || (fileName ? extractBaseFilename(fileName).baseName + '.xlsx' : 'Excel File');
                    finalAiMessageContent += `\n\n[Download ${displayFileName}](${excelResult.fileUrl})`;
                  }
                } else {
                  finalAiMessageContent = excelResult.message || 'An error occurred during the Excel operation.';
                }

              } catch (opError: any) {
                console.error("[route.ts][onFinish] Error during processExcelOperation call (tool):", opError);
                const isTimeout = opError.message && opError.message.includes('timeout');
                finalAiMessageContent = isTimeout
                  ? `The Excel operation timed out. Please try again with a simpler request.`
                  : `Error performing Excel operation: ${opError.message || 'Unknown error'}`;
                excelResult = { success: false, message: finalAiMessageContent }; // Ensure excelResult reflects the error
              }
            }
          } else if (text) {
            // Handle regular text responses if no tool was called
            console.log('[route.ts][onFinish] No Excel tool call detected, using text response.');
            finalAiMessageContent = text;
          } else {
            // Handle cases where there's neither text nor a relevant tool call
            console.warn('[route.ts][onFinish] Stream finished with no text and no relevant tool call.');
            finalAiMessageContent = ''; // Or some default message like "Processing complete."
          }

          // --- Save Assistant's Final Message in onFinish --- 
          if (documentId && userId) { 
            const messagesCollectionRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
            // Save assistant message (could be text response or Excel result message)
            await messagesCollectionRef.add({
              role: 'assistant',
              content: finalAiMessageContent, // This now holds the correct message
              userId: userId, // Use userId directly
              documentId: documentId, // Use documentId directly
              createdAt: firestore.FieldValue.serverTimestamp(),
              // Add excelFileUrl only if the operation was successful and resulted in a file
              ...(isExcelOperation && excelResult?.success && excelResult?.fileUrl ? { excelFileUrl: excelResult.fileUrl } : {}),
            });
            console.log(`[route.ts][onFinish] Assistant message saved (tool/text) for document ${documentId}`);
          } else {
            console.log("[route.ts][onFinish] Skipping assistant message save - no documentId or userId.");
          }

        } catch (onFinishError: any) {
          console.error('[route.ts][onFinish] Error during onFinish processing:', onFinishError);
        }
      }, // End onFinish
    }); // End streamText call

    // Return the stream response
    return result.toDataStreamResponse();
  } // End of try block
  catch (error: any) {
    console.error("Error calling Anthropic API:", error);
    // --- SAVE HISTORY EVEN ON ERROR? --- 
    // Decide if you want to save history when the AI call fails.
    // It might be useful for debugging, but could store incomplete conversations.
    // Example: Save history including an error message from AI
    const errorMessage: CoreMessage = {
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
            userId: userId, // Use userId directly
            documentId: documentId, // Use documentId directly
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          console.log(`User message saved (on error) for document ${documentId}`);
        }
        
        // Save error message from assistant
        await messagesCollectionRef.add({
          role: 'assistant',
          content: `Sorry, there was an error processing your request. ${error instanceof Error ? error.message : ''}`,
          userId: userId, // Use userId directly
          documentId: documentId, // Use documentId directly
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

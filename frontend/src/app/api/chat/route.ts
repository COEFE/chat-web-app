import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { CoreMessage, streamText, StreamData, Message as VercelChatMessage, ToolCallPart, ToolResultPart } from 'ai';
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
    console.log("Request body parsed:", body);
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
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
  // Explicitly type messages as VercelChatMessage[] upon destructuring
  // Use firestore.DocumentData for currentDocument and additionalDocuments
  const { messages, documentId, currentDocument, additionalDocumentIds, additionalDocuments, additionalContents, activeSheet }: {
    messages: VercelChatMessage[];
    documentId?: string;
    currentDocument?: firestore.DocumentData;
    additionalDocumentIds?: string[];
    additionalDocuments?: firestore.DocumentData[];
    additionalContents?: Array<{id: string, name: string, content: string, type: string}>;
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
  let primaryFileContent: string | null = null;
  let primaryFileType: string | null = null;
  let primaryFileName: string | null = null;
  
  // We'll use body.additionalContents to store additional document content

  // Process primary document first
  if (documentId && currentDocument?.storagePath) {
    console.log(`Processing primary document: ID=${documentId}, Path=${currentDocument.storagePath}`);
    primaryFileName = currentDocument.name || documentId;
    primaryFileType = primaryFileName?.split('.').pop()?.toLowerCase() || null;
    console.log(`Primary file type determined as: ${primaryFileType}`);

    try {
      // Decode the storage path
      const decodedPath = decodeURIComponent(currentDocument.storagePath);
      console.log(`[Chat API] Decoded primary path: ${decodedPath}`);
      const file: GoogleCloudFile = bucket.file(decodedPath); // Use decoded path
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`Primary file not found at path: ${decodedPath}`);
        return NextResponse.json(
          { error: "Primary document file not found in storage." },
          { status: 404 }
        );
      }

      // Download file content
      const [fileBuffer] = await file.download();
      console.log(`Primary file downloaded successfully (${fileBuffer.length} bytes)`);

      // Process based on file type
      if (primaryFileType === 'pdf') {
        console.log(`[route.ts] Attempting PDF text extraction for document: ${documentId} using unpdf...`); 
        try {
           // Convert Node.js Buffer to Uint8Array
           const fileUint8Array = new Uint8Array(fileBuffer); 
           console.log(`[route.ts] Converted Buffer (length: ${fileBuffer.length}) to Uint8Array (length: ${fileUint8Array.length}) for unpdf.`);
          // Pass the Uint8Array to extractText
          const extractResult = await extractText(fileUint8Array);
          // Handle the result which might be an object with text array
          primaryFileContent = Array.isArray(extractResult.text) 
            ? extractResult.text.join('\n') 
            : typeof extractResult === 'string' 
              ? extractResult 
              : typeof extractResult.text === 'string' 
                ? extractResult.text 
                : 'Error: Could not extract text from PDF';
           console.log(`[route.ts] PDF content extracted successfully for document: ${documentId}.`); 
         } catch (pdfError: any) { 
             console.error(`[route.ts] Error during unpdf text extraction for document ${documentId}:`, pdfError);
             primaryFileContent = ''; // Set to empty string on PDF extraction failure
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
       } else if (primaryFileType === 'xlsx' || primaryFileType === 'xls') {
         // Handle Excel files
         try {
           // Parse Excel file
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
           primaryFileContent = `Excel file "${primaryFileName}" sheet "${sheetToUse}" contents:\n`;
           primaryFileContent += jsonData.map((row: any) => row.join('\t')).join('\n');
           
           console.log(`Excel content extracted from sheet "${sheetToUse}" (${primaryFileContent.length} chars)`);
         } catch (excelError) {
           console.error('Excel processing error:', excelError);
           return NextResponse.json(
             { error: "Failed to process Excel file." },
             { status: 500 }
           );
         }
       } else {
         // Default: treat as text file
         primaryFileContent = fileBuffer.toString('utf-8');
         console.log(`Text file content extracted (${primaryFileContent.length} chars)`);
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
  const documentContext = primaryFileContent 
     ? `\n\n--- Document Content (${primaryFileName || 'current document'}) ---\n${primaryFileContent.substring(0, 20000)} ${primaryFileContent.length > 20000 ? '\n[Content Truncated]' : ''}\n--- End Document Content ---` 
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

  // --- Zod Schema for Excel Tool --- 
  const excelOperationSchema = z.object({
    action: z.enum(['createExcelFile', 'editExcelFile']),
    args: z.object({
      operations: z.array(z.any()).describe('Array of operation objects (e.g., { type: "createSheet", name: "Sheet1" }, { type: "addRow", row: ["A", "B"] })'),
      fileName: z.string().optional().describe('Optional desired filename for the new Excel file.'),
      sheetName: z.string().optional().describe('Optional target sheet name (often handled by createSheet operation).')
    })
  });

  // Type alias for convenience
  type ExcelOperationArgs = z.infer<typeof excelOperationSchema>;

  // 5. Call AI (Anthropic Example)
  try {
    // --- Build System Prompt (Instructing AI to use the tool) ---
    let finalSystemPrompt = `You are a helpful assistant.
If asked to modify an Excel file or create a spreadsheet, call the 'excelOperation' tool with the required arguments ('action', 'args.operations', optional 'args.fileName', optional 'args.sheetName').
Do not output raw JSON. Use the tool.
If asked a general question or a question about the document content, answer normally.`;

    // Add primary document context if available
    if (primaryFileContent) {
        // Append document context, truncating if necessary
        const truncatedContent = primaryFileContent.substring(0, 20000); // Limit context size
        const isTruncated = primaryFileContent.length > 20000;
        finalSystemPrompt += `
        
--- Primary Document Context (${primaryFileName || 'current document'}) ---
${truncatedContent}${isTruncated ? '\n[Content Truncated]' : ''}
--- End Primary Document Context ---`;
        console.log(`[route.ts] Appending primary document context (${primaryFileName || 'current document'}) to system prompt. Length: ${truncatedContent.length}, Truncated: ${isTruncated}`);
    } else {
        console.log("[route.ts] No primary document context to append to system prompt.");
    }
    
    // Add additional document contexts if available
    if (body.additionalContents && body.additionalContents.length > 0) {
        console.log(`[route.ts] Appending ${body.additionalContents.length} additional document contexts to system prompt.`);
        
        // Calculate remaining space for additional documents
        const basePromptLength = finalSystemPrompt.length;
        const maxTotalLength = 80000; // Adjust based on model's context window
        const remainingSpace = Math.max(0, maxTotalLength - basePromptLength);
        const spacePerAdditionalDoc = Math.floor(remainingSpace / body.additionalContents.length);
        
        for (const addDoc of body.additionalContents) {
            // Truncate additional content to fit within allocated space
            const truncatedAddContent = addDoc.content.length > spacePerAdditionalDoc
                ? addDoc.content.substring(0, spacePerAdditionalDoc) + "\n[Content Truncated]"
                : addDoc.content;
            
            finalSystemPrompt += `
            
--- Additional Document: ${addDoc.name} (${addDoc.type}) ---
${truncatedAddContent}
--- End Additional Document ---`;
            
            console.log(`[route.ts] Added additional document ${addDoc.name} to system prompt. Length: ${truncatedAddContent.length}`);
        }
        
        // Add instruction for handling multiple documents
        finalSystemPrompt += `

When answering questions, use information from both the primary document and any additional documents. If information appears in multiple documents, synthesize it and note the different sources.`;
    }
     
    // --- Prepare messages for AI API (Use the full conversation history for context) ---
    // Map VercelChatMessages to CoreMessages, filtering for valid roles.
    const messagesForStreamText: CoreMessage[] = messages
      .filter(msg => msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') // Keep only valid roles
      .map(msg => ({ // Map to the structure CoreMessage expects
        role: msg.role,
        content: msg.content,
      })) as CoreMessage[]; // Explicitly cast the final array

    console.log("[route.ts] Payload for AI call (Anthropic):", JSON.stringify(messagesForStreamText, null, 2)); // Log the exact payload

    // Capture variables needed in onFinish in local constants to ensure they're available in the closure
    const capturedAuthToken = req.headers.get('Authorization');
    const capturedUserId = userId;
    const capturedDocumentId = documentId;
    const capturedCurrentDocument = currentDocument;
    const capturedActiveSheet = activeSheet;
    const capturedMessages = messages;
      
    // --- Save User's Latest Message BEFORE Calling AI --- 
    try {
      if (documentId && userId) {
        const messagesCollectionRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
        const lastUserMsg = messages[messages.length - 1]; // Get the actual last message from the input
        if (lastUserMsg && lastUserMsg.role === 'user') { 
          await messagesCollectionRef.add({ 
            role: lastUserMsg.role,
            content: lastUserMsg.content,
            userId: capturedUserId, // Add userId
            documentId: capturedDocumentId, // Add documentId
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          console.log(`[route.ts] User message saved BEFORE AI call for document ${documentId}`);
        } else {
          console.warn(`[route.ts] Did not save user message before AI call - last message not from user.`);
        }
      } else {
        console.log("[route.ts] Skipping user message save before AI call - no documentId or userId.");
      }
    } catch (saveError: any) {
      console.error(`[route.ts] Error saving user message before AI call for document ${documentId}:`, saveError);
    }

    const result = await streamText({
      model: vercelAnthropic('claude-3-7-sonnet-20250219'),
      system: finalSystemPrompt, // Use the potentially augmented system prompt
      messages: messagesForStreamText, // Pass the full conversation history
      maxTokens: 4096, // Use the constant for regular chat
      // --- Define the Tool --- 
      tools: {
        excelOperation: {
          description: 'Performs operations on Excel files (create or edit).',
          parameters: excelOperationSchema,
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
            if (!capturedAuthToken) {
              console.error("[route.ts][onFinish] Auth token missing for Excel tool call.");
              finalAiMessageContent = "Error: Authentication token was missing unexpectedly.";
              excelResult = { success: false, message: finalAiMessageContent }; // Set error state
            } else {
              try {
                // Extract validated arguments from the tool call
                // SDK automatically parses args based on schema if valid
                const { action, args } = excelToolCall.args as { action: 'createExcelFile' | 'editExcelFile', args: { operations: any[], fileName?: string, sheetName?: string } };
                const { operations, fileName, sheetName } = args;
                const documentIdToUse = capturedCurrentDocument?.id || null;

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
                  capturedUserId,
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

import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { 
  CoreMessage, 
  CoreToolMessage,
  ImagePart,
  TextPart,
  streamText, 
  StreamData, 
  ToolCallPart, 
  ToolResultPart, 
} from 'ai';
import { z } from 'zod'; // Import Zod
import { anthropic as vercelAnthropic } from '@ai-sdk/anthropic'; // Use this one
import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin'; 
import { firestore } from 'firebase-admin'; 
import { FirebaseError } from 'firebase-admin/app'; 
import { getAdminDb, initializeFirebaseAdmin } from '@/lib/firebaseAdminConfig'; 
import { getStorage as getAdminStorage } from 'firebase-admin/storage'; 
import { getAuth as getAdminAuth } from 'firebase-admin/auth'; 
import { processExcelOperation, extractBaseFilename } from '@/lib/excelUtils';
import { File as GoogleCloudFile } from '@google-cloud/storage'; 
import * as XLSX from 'xlsx-js-style'; 
import { extractText } from 'unpdf'; 
import { findRelevantGLCodes, mightBeAboutGLCodes } from '@/lib/glUtils';

console.log("--- MODULE LOAD: /api/chat/route.ts ---");

// Function to check if a message is related to GL codes
function checkIfGLCodeRelated(message: string): boolean {
  const glCodeKeywords = [
    'gl code', 
    'gl-code', 
    'general ledger', 
    'ledger code', 
    'accounting code', 
    'chart of accounts',
    'account code',
    'expense code',
    'revenue code',
    'asset code',
    'liability code',
    'equity code',
    'transaction code',
    'how do i code',
    'which code',
    'what code'
  ];
  
  const messageLower = message.toLowerCase();
  
  // Check for specific keywords
  if (glCodeKeywords.some(keyword => messageLower.includes(keyword))) {
    return true;
  }
  
  // Check for code-related patterns
  if ((messageLower.includes('code') || messageLower.includes('account')) && 
      (messageLower.includes('use') || messageLower.includes('which') || 
       messageLower.includes('what') || messageLower.includes('how'))) {
    return true;
  }
  
  return false;
}

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
// Using Claude 3.5 Sonnet (valid model name)
const MODEL_NAME = 'claude-3-5-sonnet-20240620'; 
const MAX_TOKENS = 4000; 
const EXCEL_MAX_TOKENS = 4000; 
// Timeout constants optimized for Vercel Pro plan (60s limit)
const ANTHROPIC_TIMEOUT_MS = 30000; // 30 seconds for Anthropic API calls
const EXCEL_OPERATION_TIMEOUT_MS = 25000; // 25 seconds for Excel operations
const DEFAULT_SYSTEM_PROMPT = `You are Claude, a helpful AI assistant integrated into a web chat application. Provide concise and accurate responses.
**CRITICAL:** Only call the 'excelOperation' tool when the user EXPLICITLY requests you to *create* or *edit* an Excel workbook (e.g. "create a budget sheet", "update cell B2").
If the user is merely asking questions about the contents of an existing spreadsheet—such as calculating a total, listing values, or explaining data—DO **NOT** call the tool. Just answer directly in plain text.
Use the following arguments for the tool:
- action: "createExcelFile" or "editExcelFile"
- operations: An array of operation objects.
  - For creating sheets: { "type": "createSheet", "name": "SheetName" }
  - **IMPORTANT For updating cells:** Use the format { "type": "updateCells", "range": "A1:B10", "values": [[row1col1, row1col2], [row2col1, row2col2]] }. Provide the full data grid in 'values'. Avoid the 'updates' or 'cells' formats if possible.
- Optional fileName: Use the user's requested name, or generate one if not provided (e.g., "DataExport.xlsx").
- Optional sheetName: Target a specific sheet if mentioned by the user.
- For requests involving multiple distinct changes (e.g., adding several items and formatting), bundle them into a *single* 'operations' array in one tool call.

After the tool call completes successfully, respond ONLY with the confirmation message provided by the tool result (e.g., "Excel file '...' created successfully."). Do not add extra conversational text, apologies, or explanations unless the tool fails.
If the tool call fails, relay the error message provided in the tool result.
Do NOT output raw JSON instructions to the user; ALWAYS call the tool.`;

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
  
  // Check if the latest message might be about GL codes
  const latestMessage = messages[messages.length - 1];
  const userMessage = typeof latestMessage.content === 'string' 
    ? latestMessage.content 
    : Array.isArray(latestMessage.content) 
      ? latestMessage.content.filter((part: any) => part.type === 'text').map((part: any) => (part as TextPart).text).join(' ')
      : '';
  
  let glCodeContext = '';
  if (latestMessage.role === 'user' && mightBeAboutGLCodes(userMessage)) {
    console.log('[Chat API] Detected potential GL code query, retrieving GL codes');
    try {
      // Use semantic search to find relevant GL codes
      const relevantCodes = await findRelevantGLCodes(userMessage, 7);
      
      if (relevantCodes.length > 0) {
        glCodeContext = `
Here is information about General Ledger (GL) codes that might help answer the query:
${relevantCodes.map(code => `- ${code.content}`).join('\n')}

Please use this GL code information to help answer the user's question if relevant.
`;
        console.log(`[Chat API] Retrieved ${relevantCodes.length} relevant GL codes`);
      } else {
        console.log('[Chat API] No GL codes found in database');
      }
    } catch (error) {
      console.error('[Chat API] Error retrieving GL codes:', error);
    }
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

  // --- Get messages, chatId, documentId, currentDocument, additionalDocuments, activeSheet from body --- 
  // Explicitly type messages as CoreMessage[] upon destructuring
  // Use firestore.DocumentData for currentDocument and additionalDocuments
  const { chatId, documentId, currentDocument, additionalDocumentIds, additionalDocuments, additionalContents, activeSheet }: { 
    chatId?: string; 
    documentId?: string;
    currentDocument?: firestore.DocumentData;
    additionalDocumentIds?: string[];
    additionalDocuments?: firestore.DocumentData[];
    additionalContents?: Array<{id: string, name: string, content: string, type: string}>;
    activeSheet?: string;
  } = body;

  // Validate required IDs
  if (!chatId) {
    // If chatId is missing, we cannot proceed with saving history reliably.
    // DocumentId might exist for old contexts, but we prioritize chatId now.
    console.error("Critical: Missing chatId in request body. Cannot determine chat context.");
    return NextResponse.json({ error: "Missing required 'chatId' in request body" }, { status: 400 });
  } else {
    console.log(`[Chat API] Processing request for chatId: ${chatId}`);
  }
  // Log if documentId is also present (for informational purposes)
  if (documentId) {
    console.log(`[Chat API] DocumentId ${documentId} is also present in the request.`);
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

  // --- Persist user message so it shows after refresh ---
  try {
    const messagesCollectionPath = `users/${userId}/chats/${chatId}/messages`;
    const messagesCollectionRef = db.collection(messagesCollectionPath);
    await messagesCollectionRef.add({
      role: 'user',
      content: userMessageContent,
      userId,
      chatId,
      createdAt: firestore.FieldValue.serverTimestamp(),
    });
    console.log(`[Chat API] User message persisted for chatId ${chatId}`);
  } catch(saveUserErr) {
    console.error('[Chat API] Failed to save user message:', saveUserErr);
  }

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
         // Convert Node.js Buffer to Uint8Array for PDF extraction
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

    // Log the final request payload for debugging
    console.log(`[route.ts] Final messages before API call:`, 
      JSON.stringify(finalMessagesForApi.map(m => ({ role: m.role, content_length: typeof m.content === 'string' ? m.content.length : 'array' })))
    );
    console.log(`[route.ts] System prompt length: ${systemPrompt.length}`);

    const result = await streamText({
      model: vercelAnthropic(MODEL_NAME),
      system: `${systemPrompt}

${glCodeContext}`,
      messages: finalMessagesForApi, // Use the correctly typed and filtered array
      maxTokens: MAX_TOKENS,
      maxSteps: 5, // Allow the model to iterate after tool execution
      // --- Define the Tool with execute ---
      tools: {
        excelOperation: {
          description: 'Performs operations on Excel files (create or edit).',
          parameters: z.object({
            action: z.enum(['createExcelFile', 'editExcelFile']),
            operations: z.array(z.any()),
            fileName: z.string().optional(),
            sheetName: z.string().optional()
          }),
          execute: async ({ action, operations, fileName, sheetName }: { action: 'createExcelFile' | 'editExcelFile'; operations: any[]; fileName?: string; sheetName?: string }) => {
            console.log('[route.ts][tool.execute] excelOperation called with', { action, operationsLength: operations?.length, fileName, sheetName });
            if (!authorizationHeader) {
              console.error('[route.ts][tool.execute] Missing auth token, rejecting excelOperation.');
              return { success: false, message: 'Authentication token was missing.' };
            }
            try {
              const documentIdToUse = documentContext?.id || documentId || null;
              const finalAction = (action === 'editExcelFile' && !documentIdToUse) ? 'createExcelFile' : action;
              const result = await processExcelOperation(
                finalAction,
                documentIdToUse,
                operations,
                userId,
                fileName || (documentContext?.name ? extractBaseFilename(documentContext.name).baseName : undefined),
                sheetName || activeSheet
              );

              console.log('[route.ts][tool.execute] processExcelOperation result:', result);
              return result;
            } catch (err: any) {
              console.error('[route.ts][tool.execute] Error:', err);
              return { success: false, message: err?.message || 'Unknown error' };
            }
          }
        },
      },
      // --- MODIFIED: onFinish --- 
      onFinish: async ({ 
        text, 
        toolCalls, 
        toolResults, 
        usage, 
        finishReason, 
        logprobs 
      }) => {
        console.log(`[route.ts][onFinish] Stream finished. Reason: ${finishReason}. Text: ${text?.length}. Tool Calls: ${toolCalls?.length}. Tool Results: ${toolResults?.length}`);

        let finalAiMessageContent = text || '';
        let excelFileUrl: string | null = null;

        // Extract excel operation result if present
        const excelToolResult = toolResults?.find(tr => tr.toolName === 'excelOperation') as (ToolResultPart | undefined);
        const excelProcessingResult: any = excelToolResult?.result;

        if (excelProcessingResult) {
          console.log('[route.ts][onFinish] excelOperation result detected:', excelProcessingResult);
          if (excelProcessingResult.success) {
            const successMessage = excelProcessingResult.message || (excelProcessingResult.action === 'editExcelFile' ? 'Excel file updated.' : 'Excel file created.');
            finalAiMessageContent = `${successMessage} [EXCEL_DOCUMENT_UPDATED]`;
            excelFileUrl = excelProcessingResult.fileUrl || null;
          } else {
            finalAiMessageContent = excelProcessingResult.message || 'An error occurred during the Excel operation.';
          }
        }

        // Save assistant message
        try {
          const messagesCollectionPath = `users/${userId}/chats/${chatId}/messages`;
          const messagesCollectionRef = db.collection(messagesCollectionPath);
          await messagesCollectionRef.add({
            role: 'assistant',
            content: finalAiMessageContent,
            userId,
            chatId,
            createdAt: firestore.FieldValue.serverTimestamp(),
            ...(excelProcessingResult?.success && excelFileUrl ? { excelFileUrl } : {})
          });
          console.log(`[route.ts][onFinish] Assistant message saved for chatId ${chatId}. Content: ${finalAiMessageContent.substring(0,100)}...`);
        } catch (saveErr) {
          console.error('[route.ts][onFinish] Error saving assistant message:', saveErr);
        }
      }, // End onFinish
      onError: async (err) => {
        console.error('[route.ts][streamText onError]', err);
      },
      onStepFinish: async ({ toolCalls, toolResults }) => {
        console.log(`[route.ts][onStepFinish] ToolCalls: ${toolCalls?.length}, ToolResults: ${toolResults?.length}`);
        if (toolCalls && toolCalls.length) {
          console.log('[route.ts][onStepFinish] ToolCall sample:', JSON.stringify(toolCalls[0], null, 2).substring(0,500));
        }
        if (toolResults && toolResults.length) {
          console.log('[route.ts][onStepFinish] ToolResult sample:', JSON.stringify(toolResults[0], null, 2).substring(0,500));
        }
      },
    }); // End streamText call

    // Return the stream response
    return result.toDataStreamResponse();
  } // End of try block
  catch (error: any) {
    // Detailed error logging
    console.error("Error calling Anthropic API:", error);
    console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
    }
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
      // Determine Firestore path based on chatId primarily (even on error)
      if (chatId && userId) { 
        const messagesCollectionPathOnError = `users/${userId}/chats/${chatId}/messages`;
        const messagesCollectionRef = db.collection(messagesCollectionPathOnError);
        console.log(`[route.ts][onError] Using Firestore path: ${messagesCollectionPathOnError}`);
        
        // Get the last user message
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();

        // Ensure lastUserMsgForSave exists before accessing its properties
        if(lastUserMessage) { 
          await messagesCollectionRef.add({
            role: lastUserMessage.role,
            content: lastUserMessage.content,
            userId: userId, // Use userId directly
            chatId: chatId, // Save chatId
            // documentId: documentId, // Optionally save documentId if relevant
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          console.log(`User message saved (on error) for chatId ${chatId}`);
        }
        
        // Save error message from assistant
        await messagesCollectionRef.add({
          role: 'assistant',
          content: `Sorry, there was an error processing your request. ${error instanceof Error ? error.message : ''}`,
          userId: userId, // Use userId directly
          chatId: chatId, // Save chatId
          // documentId: documentId, // Optionally save documentId if relevant
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
        console.log(`Error message saved for chatId ${chatId}`);
      } else {
        console.log("Skipping chat history save (on error) as chatId or userId was missing.");
      }
    } catch (saveError) {
      console.error(`Error saving chat history (on error) for chatId ${chatId}:`, saveError);
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

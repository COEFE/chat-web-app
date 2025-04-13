import { NextRequest, NextResponse } from 'next/server';
// Vercel AI SDK imports
import { Message as VercelChatMessage, streamText, CoreMessage } from "ai"; 
import { MessageParam } from '@anthropic-ai/sdk/resources/messages'; 
// Note: If these imports are failing, you may need to install the correct packages
// npm install ai
import { anthropic } from '@ai-sdk/anthropic'; 
import { 
  getFirestore, 
  collection, 
  addDoc, 
  serverTimestamp,
} from 'firebase/firestore';
let experimental_StreamData: any;
try {
  const aiImports = require("ai");
  experimental_StreamData = aiImports.experimental_StreamData;
} catch (e) {
  console.error("Error importing from ai package:", e);
  // Fallback empty implementations to prevent crashes
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
import Anthropic from '@anthropic-ai/sdk'; 
import { FirebaseError } from 'firebase-admin/app';
import { processExcelOperation } from '@/lib/excelUtils'; 
import { File as GoogleCloudFile } from '@google-cloud/storage'; 
import { firestore } from 'firebase-admin'; 
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig'; 
import * as XLSX from 'xlsx';
import { extractText } from "unpdf";

console.log("--- MODULE LOAD: /api/chat/route.ts ---");

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
  message: string,
  currentDocument: any,
  activeSheet?: string
): Promise<{ success: boolean; response?: object; message?: string }> {
  console.log(
    "Handling Excel operation directly for document:",
    currentDocument?.id
  );

  // --- Regex and sheet name extraction logic ---
  // Regex to find cell references like A1, B2, etc., and the value in quotes
  const editPatterns = [
    // Pattern 1: set cell to "value"
    /(?:update|change|set|put)\s+(?:cell\s+)?([A-Z]+[0-9]+)\s+to\s+["']?([^"']+)["']?/i,
    // Pattern 2: set "value" in cell
    /(?:update|change|set|put)\s+["']?([^"']+)["']?\s+in\s+(?:cell\s+)?([A-Z]+[0-9]+)/i,
    // Pattern 3: cell = "value"
    /([A-Z]+[0-9]+)\s*=\s*["']?([^"']+)["']?/i,
  ];

  let cellRef: string | null = null;
  let cellValue: string | null = null;
  let matched = false;

  for (const pattern of editPatterns) {
    const match = message.match(pattern);
    if (match) {
      // Determine which capture group is the cell and which is the value based on pattern structure
      if (pattern.source.includes("to\\s+[\"']")) {
        // Pattern 1
        cellRef = match[1];
        cellValue = match[2];
      } else if (pattern.source.includes("in\\s+(?:cell\\s+)?")) {
        // Pattern 2
        cellValue = match[1];
        cellRef = match[2];
      } else if (pattern.source.includes("=\\s*[\"']")) {
        // Pattern 3
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
  if (
    matched &&
    cellRef &&
    cellValue &&
    currentDocument &&
    currentDocument.id
  ) {
    console.log(
      `Detected cell ${cellRef} and value ${cellValue} for document ${currentDocument.id}`
    );

    // Create the Excel operation JSON structure needed by processExcelOperation
    // Try to extract operation parameters via regex or some heuristics
    const sheetName = extractSheetName(message) || activeSheet || "Sheet1";
    console.log(
      `[handleExcelOperation] Using sheet: ${sheetName} (extracted from message: ${extractSheetName(
        message
      )}, active sheet: ${activeSheet})`
    );

    // Default operation: Use current document and create a simple edit
    // CRITICAL: Always use the current document's ID for editing to prevent duplicates
    const documentId = currentDocument ? currentDocument.id : null;
    console.log(`[handleExcelOperation] Using document ID: '${documentId}'`);

    if (!documentId) {
      return {
        success: false,
        message: "No document ID provided for Excel operation.",
      };
    }

    // Create the Excel operation JSON structure needed by processExcelOperation
    const operationData = [
      {
        sheetName: sheetName, // Use the global extractSheetName function
        cellUpdates: [
          { cell: cellRef, value: cellValue }, // Explicit property assignment
        ],
      },
    ];

    console.log("Calling processExcelOperation directly:", {
      operation: "edit",
      documentId: documentId,
      data: operationData,
      userId: userId,
    });

    try {
      // Call the imported function directly
      const excelResponse: NextResponse = await processExcelOperation(
        "edit", // operation
        currentDocument.id, // documentId
        operationData, // data (array of row objects)
        userId // userId
      );

      console.log(
        "processExcelOperation Response Status:",
        excelResponse.status
      );

      // Check if the Excel operation was successful by parsing the response
      const excelResult = await excelResponse.json();
      console.log("processExcelOperation Response Parsed Body:", excelResult);

      if (excelResult && excelResult.success) {
        // Create a success message
        const successMessage = `I've updated ${cellRef} to "${cellValue}" in your Excel file "${
          currentDocument.name || "document"
        }".`;

        // Return the success response for the chat
        return {
          success: true,
          response: {
            id: `ai-${Date.now()}`,
            role: "ai",
            content: successMessage,
            excelOperation: excelResult, // Include the result from the excel processing
          },
        };
      } else {
        // Create an error message using the message from the result
        const errorMessage = `I tried to update ${cellRef} to "${cellValue}" in your Excel file, but encountered an error: ${
          excelResult.message || "Unknown error"
        }`;

        // Return the error response for the chat
        return {
          success: false,
          response: {
            id: `ai-${Date.now()}`,
            role: "ai",
            content: errorMessage,
          },
        };
      }
    } catch (error) {
      console.error("Error calling/processing processExcelOperation:", error);
      // Generic error if the call itself fails or JSON parsing fails
      return {
        success: false,
        response: {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: `Sorry, I encountered an internal error while trying to edit the Excel file.`,
        },
      };
    }
  } else {
    // Log why it failed if match was found but doc info missing
    if (matched && (!currentDocument || !currentDocument.id)) {
      console.log(
        "Extracted cell/value but missing currentDocument info for direct edit."
      );
    } else {
      console.log("Could not extract cell/value for direct Excel operation.");
    }
    return { success: false }; // Indicate direct handling failed
  }
}

// Helper function to create success messages
function createSuccessMessage(parsedJson: any, excelResult: any): string {
  if (parsedJson.operation === "create") {
    return `I've created a new Excel file named "${
      parsedJson.fileName
    }" for you. ${
      excelResult.url ? "You can download it using the link below." : ""
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
      excelResult.fileName || "your document"
    }".`;
  } else {
    return `I've successfully performed the ${parsedJson.operation} operation on the Excel file.`;
  }
}

// Helper function to create error messages
function createErrorMessage(parsedJson: any, excelResult: any): string {
  let errorMessage = `I tried to perform the operation on an Excel file, but encountered an error: ${
    excelResult?.error || "Unknown error"
  }`;

  // Safely access operation type
  if (parsedJson && parsedJson.operation) {
    errorMessage = `I tried to ${
      parsedJson.operation
    } an Excel file, but encountered an error: ${
      excelResult?.error || "Unknown error"
    }`;
  }

  // Add suggestions if available documents were returned
  if (
    excelResult &&
    excelResult.availableDocuments &&
    excelResult.availableDocuments.length > 0
  ) {
    errorMessage +=
      "\n\nHere are some available documents you can use instead:\n";
    excelResult.availableDocuments.forEach(
      (doc: { name: string; id: string }) => {
        errorMessage += `- "${doc.name}" (ID: ${doc.id})\n`;
      }
    );
    errorMessage += "\nPlease try again with one of these document IDs.";
  }
  return errorMessage;
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
    let finalSystemPrompt = "You are a helpful assistant. If asked to modify an Excel file, respond ONLY with the JSON for the required 'excelOperation' function call, following the specified schema. Do not add any introductory text, explanations, or concluding remarks around the JSON. If asked a general question or a question about the document content, answer normally.";
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
 
    console.log("[route.ts] Payload for streamText (Anthropic):", JSON.stringify(messagesForStreamText, null, 2)); // Log the exact payload

    // ---- START: Streaming Implementation (Vercel AI SDK v4) ----
    const result = await streamText({
      model: anthropic('claude-3-7-sonnet-20250219'),
      system: finalSystemPrompt, // Use the potentially augmented system prompt
      messages: messagesForStreamText, // Pass the full conversation history
      maxTokens: 4096, // Increased from 1024 to handle complex Excel operations

      // --- onFinish replaces onCompletion for post-stream processing --- 
      async onFinish({ text, toolCalls, toolResults, usage, finishReason, logprobs }) {
        console.log(`[route.ts][onFinish] Stream finished. Reason: ${finishReason}. Final text length: ${text.length}`);

        // --- Re-integrated Excel/History Logic --- 
        const aiResponseText = text; // Use the final text from the stream
        let isExcelOperation = false;
        let parsedJson: any = null;

        try {
          const potentialJson = aiResponseText.trim();
          
          // Check if the response looks like JSON
          if (potentialJson.startsWith('{') && potentialJson.endsWith('}')) {
            try {
              parsedJson = JSON.parse(potentialJson);
              
              // Validate the Excel operation structure
              if (parsedJson.action && 
                  (parsedJson.action === 'editExcelFile' || parsedJson.action === 'createExcelFile') && 
                  parsedJson.args) {
                console.log("[route.ts][onFinish] Detected valid Excel operation:", parsedJson.action);
                isExcelOperation = true;
              } else {
                console.log("[route.ts][onFinish] JSON doesn't match expected Excel operation structure:", JSON.stringify(parsedJson).substring(0, 200));
              }
            } catch (error) {
              // Handle JSON parsing errors more specifically
              const jsonParseError = error as Error;
              console.error("[route.ts][onFinish] JSON parse error:", jsonParseError.message);
              console.log("[route.ts][onFinish] Attempted to parse:", potentialJson.length > 200 ? 
                potentialJson.substring(0, 100) + '...' + potentialJson.substring(potentialJson.length - 100) : potentialJson);
              
              // Try to recover from truncated JSON
              if (potentialJson.length > 500 && !potentialJson.endsWith('}}')) {
                console.log("[route.ts][onFinish] Attempting to recover from possibly truncated JSON");
                // Add closing brackets if they appear to be missing
                const fixedJson = potentialJson + (potentialJson.endsWith('}') ? '' : '}');
                try {
                  parsedJson = JSON.parse(fixedJson);
                  console.log("[route.ts][onFinish] Successfully recovered truncated JSON");
                  isExcelOperation = true;
                } catch (error) {
                  const recoveryError = error as Error;
                  console.error("[route.ts][onFinish] Recovery attempt failed:", recoveryError.message);
                }
              }
            }
          } else {
            console.log("[route.ts][onFinish] Response doesn't appear to be JSON");
          }
        } catch (parseError) {
          console.error("[route.ts][onFinish] Error processing AI response:", parseError);
          isExcelOperation = false;
        }

        let finalAiMessageContent = aiResponseText; // Default to the raw completion
        let excelResult: any = null; // Store excel result if applicable

        if (isExcelOperation && parsedJson) {
          console.log(`[route.ts][onFinish] Handling Excel Operation: ${parsedJson.action}`);
          const { action, args } = parsedJson;
          const sheetName = extractSheetName(lastMessage.content as string); // Use lastMessage from outer scope

          excelResult = await handleExcelOperation(
            '', // authToken seems removed/unused here, pass empty or adjust handleExcelOperation
            userId,
            lastMessage.content as string, // Use lastMessage from outer scope
            currentDocument, // Pass the current document context if available
            sheetName || undefined
          );

          console.log('[route.ts][onFinish] Excel Operation Result:', excelResult);

          // Use helpers to create appropriate message based on Excel result
          if (excelResult.success) {
            finalAiMessageContent = createSuccessMessage(parsedJson, excelResult);
          } else {
            finalAiMessageContent = createErrorMessage(parsedJson, excelResult);
          }
          console.log('[route.ts][onFinish] Final message after Excel op:', finalAiMessageContent);
        }

        // --- Save the user message and the final AI response as separate documents --- 
        try {
          if (documentId && userId) {
            const messagesCollectionRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');

            // Get the last user message that was sent to the AI
            const lastUserMessage = messages.filter(m => m.role === 'user').pop();

            // Save user message
            if (lastUserMessage) {
              await messagesCollectionRef.add({
                role: lastUserMessage.role,
                content: lastUserMessage.content,
                createdAt: firestore.FieldValue.serverTimestamp(), // Use admin SDK's server timestamp
              });
              console.log(`[route.ts][onFinish] User message saved for document ${documentId}`);
            }

            // Save assistant message
            await messagesCollectionRef.add({
              role: 'assistant',
              content: finalAiMessageContent,
              createdAt: firestore.FieldValue.serverTimestamp(), // Use admin SDK's server timestamp
              // Optionally include Excel result data if needed
              ...(isExcelOperation && excelResult ? { excelOperationResult: excelResult } : {}),
            });
            console.log(`[route.ts][onFinish] Assistant message saved to subcollection for document ${documentId}`);
          } else {
            console.log("[route.ts][onFinish] Skipping chat history save as no documentId or userId was provided.");
          }
        } catch (saveError) {
          console.error(`[route.ts][onFinish] Error saving chat messages to subcollection for document ${documentId}:`, saveError);
        }
        // --- End Re-integrated Logic --- 
      },
    });

    // Return the stream response
    return result.toDataStreamResponse();
    // ---- END: Streaming Implementation (Vercel AI SDK v4) ----

  } catch (error: any) {
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
        
        // Save user message
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
}

// Helper function to authenticate the user - internal to this file
async function authenticateUser(
  req: NextRequest
): Promise<{ userId: string; token: string } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.error("Authorization header missing or invalid");
    return null;
  }
  const idToken = authHeader.split("Bearer ")[1];

  let decodedToken;
  let userId: string;
  try {
    const adminAuth = getAdminAuth(); // Get auth instance
    decodedToken = await adminAuth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log("User authenticated:", userId);
  } catch (error) {
    console.error("Error verifying auth token:", error);
    return null;
  }

  return { userId, token: idToken };
}

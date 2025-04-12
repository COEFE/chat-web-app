import { NextRequest, NextResponse } from 'next/server';
// Vercel AI SDK imports
import { Message as VercelChatMessage, experimental_StreamData } from "ai"; // Import experimental_StreamData (Lint error might indicate installation/version issue)
import { StreamingTextResponse } from 'ai'; // Keep this import (Lint error might indicate installation/version issue)
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
import {
  initializeFirebaseAdmin,
  getAdminAuth,
  getAdminDb,
  getAdminStorage,
} from "@/lib/firebaseAdminConfig";
import * as XLSX from "xlsx";
import Anthropic from "@anthropic-ai/sdk";
import { FirebaseError } from "firebase-admin/app";
// Import the function from the other route
import { processExcelOperation } from "@/lib/excelUtils";
// Imports for file/PDF handling
import { File as GoogleCloudFile } from "@google-cloud/storage";
import { extractText } from "unpdf";
import { Timestamp } from 'firebase-admin/firestore'; // Import Timestamp
// Remove duplicate import of getAdminDb, keep initializeFirebaseAdmin if needed elsewhere
import { getAdminDb, getAdminAuth, getAdminStorage, initializeFirebaseAdmin } from "@/lib/firebaseAdminConfig";

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
  console.log("--- POST /api/chat START ---");
  const db = getAdminDb(); // Get Firestore instance

  // 1. Authentication
  let userId: string | null = null; // Declare userId here
  let authToken: string | null = null; // Declare authToken here
  try {
    const authResult = await authenticateUser(req);
    if (!authResult) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Assign values from the helper function
    userId = authResult.userId;
    authToken = authResult.token;
    console.log(`Authenticated user: ${userId}`);
  } catch (error) {
    console.error("Authentication error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }

  // 2. Parse Request Body
  let body;
  try {
    body = await req.json();
    console.log("Request body parsed:", { messagesCount: body.messages?.length, currentDocument: body.currentDocument?.id });
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  // Destructure AFTER parsing
  const { messages, currentDocument, activeSheet } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Missing or invalid messages array" }, { status: 400 });
  }

  // --- Add Chat History Logic ---
  const documentId = currentDocument?.id; // Use currentDocument from body
  let historyMessages: VercelChatMessage[] = [];

  // Ensure userId and documentId are valid before DB operations
  if (documentId && userId) {
    console.log(`Document ID present: ${documentId}. Attempting to load chat history.`);
    try {
      const messagesRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
      const historySnapshot = await messagesRef.orderBy('createdAt', 'asc').get();

      if (!historySnapshot.empty) {
        historyMessages = historySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id, // Include message ID if needed later
            role: data.role,
            content: data.content,
          } as VercelChatMessage;
        });
        console.log(`Loaded ${historyMessages.length} history messages for document ${documentId}`);
      } else {
        console.log(`No chat history found for document ${documentId}`);
      }
    } catch (error) {
      console.error(`Error loading chat history for document ${documentId}:`, error);
      // Proceed without history, but log the error
    }

    // Save incoming user message to history
    const currentUserMessage = messages[messages.length - 1]; // Get the last message assumed to be the user's
    if (currentUserMessage && currentUserMessage.role === 'user') {
      try {
        const messagesRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
        const userMessageData = {
          role: 'user',
          content: currentUserMessage.content,
          createdAt: Timestamp.now(),
        };
        await messagesRef.add(userMessageData);
        console.log(`Saved user message for document ${documentId}`);
      } catch (error) {
        console.error(`Error saving user message for document ${documentId}:`, error);
        // Log error but continue processing
      }
    } else {
       console.log("Last message not from user or not found, skipping save.");
    }
  } else {
     console.log("No document ID or user ID, skipping history load/save.");
     if (!documentId) console.log("Reason: documentId is missing.");
     if (!userId) console.log("Reason: userId is missing (this shouldn't happen after auth check).");
  }

  // Combine history with the *original* incoming messages for the AI prompt
  const messagesForAI = [...historyMessages, ...messages];
  // --- End Chat History Logic ---

  // 3. Prepare for AI Call (Context, Prompt, etc.)
  let contextText = ""; // Declare contextText here
  let fileType = currentDocument?.contentType || null; // Use contentType if available
  console.log("Current document type from request body:", fileType);

  // --- Optional: Direct Excel Operation Handling ---
  const lastUserMessageContent = messages[messages.length - 1]?.content?.toLowerCase() || '';
  const potentialExcelEdit = lastUserMessageContent.includes("edit") || lastUserMessageContent.includes("update") || lastUserMessageContent.includes("change") || lastUserMessageContent.includes("set") || lastUserMessageContent.includes("put") || /\b([A-Z]+[0-9]+)\s*=\s*/i.test(lastUserMessageContent);

  // Ensure we have the necessary info for Excel ops
  if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && potentialExcelEdit && userId && authToken) {
     console.log("Potential Excel edit detected for .xlsx file.");
     try {
        // Pass the correct userId and authToken from the authenticated scope
        const excelOpResult = await handleExcelOperation(
           authToken,
           userId,
           messages[messages.length - 1].content, // Pass only the last user message content
           currentDocument,
           activeSheet
        );

        if (excelOpResult.success && excelOpResult.response) {
           console.log("Excel operation handled directly, returning response.");
           const successMsg = createSuccessMessage(excelOpResult.response, excelOpResult);
           return NextResponse.json({ success: true, message: successMsg, result: excelOpResult.response });
        } else if (excelOpResult.success === false) {
           console.log("Excel operation failed directly:", excelOpResult.message);
           const errorMsg = createErrorMessage(null, excelOpResult);
           return NextResponse.json({ success: false, error: errorMsg || "Failed to perform Excel operation." }, { status: 400 });
        }
        console.log("Excel operation attempted, but falling through to AI chat.");
     } catch (error) {
        console.error("Error during direct Excel operation handling:", error);
        // Fall through to general AI chat if direct handling fails
     }
  } else if (potentialExcelEdit) {
      console.log("Potential Excel edit detected, but file type is not Excel or missing auth info.");
  }
  // --- End Excel Handling ---

  // --- Context Extraction --- (Only if not handled by Excel op)
  if (currentDocument?.storagePath) {
    console.log("Fetching content for document context:", currentDocument.storagePath);
    const bucket = getAdminStorage().bucket(); // Use getAdminStorage() here
    const file = bucket.file(currentDocument.storagePath);
    try {
      const [exists] = await file.exists();
      if (!exists) {
        console.log("File does not exist for context:", currentDocument.storagePath);
        contextText = "Error: The associated file could not be found.";
      } else {
        console.log("File exists, attempting to download for context:", currentDocument.storagePath);
        const fileBuffer = await file.download();
        console.log("File downloaded successfully for context, size:", fileBuffer[0].length);

        // Use fileType determined earlier from request body
        if (fileType === "application/pdf") {
           console.log("Extracting text from PDF for context...");
           // Convert buffer for unpdf
           const uint8Array = new Uint8Array(fileBuffer[0]);
           const { text } = await extractText(uint8Array);
           contextText = Array.isArray(text) ? text.join('\n\n') : '[Error processing PDF text]';
           console.log("PDF text extracted for context, length:", contextText.length);
        } else if (fileType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
           console.log("Processing Excel file for context...");
           const workbook = XLSX.read(fileBuffer[0], { type: "buffer" });
           const sheetNames = workbook.SheetNames;
           // Simple context for now
           contextText = `Excel file context: Sheets are: ${sheetNames.join(", ")}. Active: ${activeSheet || sheetNames[0] || 'N/A'}. Ask for specific cells or sheets.`;
           console.log("Excel context generated:", contextText);
        } else if (fileType?.startsWith("text/")) { // Handle various text types
           contextText = fileBuffer[0].toString("utf-8");
           console.log("Text file context loaded, length:", contextText.length);
        } else {
           console.log(`Unsupported file type for context generation: ${fileType}`);
           contextText = `File type '${fileType}' is not directly supported for context extraction.`;
        }
      }
    } catch (error: any) {
       console.error("Error fetching or processing document for context:", error);
       if (isFirebaseStorageError(error, 404)) { // Check for 404 specifically
         contextText = "Error: The associated file could not be found.";
       } else {
         contextText = `Error processing document context: ${error.message || "Unknown error"}`;
       }
    }
  } else {
     console.log("No current document or storage path provided for context.");
     contextText = "No document is currently selected.";
  }
  // --- End Context Extraction ---

  // 4. Format Prompt for AI
  const systemPrompt = `You are a helpful assistant. Use the following document context ONLY if relevant to answer the user's question:

START CONTEXT
${contextText}
END CONTEXT

Answer the user's question based on the chat history and the provided context. If the context is not relevant, ignore it.`;

  // Use the combined history + incoming messages for the AI
  // Filter out system messages if Anthropic needs it
  const filteredMessagesForAI = messagesForAI.filter(m => m.role === 'user' || m.role === 'assistant');

  // 5. Call AI (Anthropic)
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  try {
    console.log(`Calling Anthropic with ${filteredMessagesForAI.length} messages. System prompt included.`);
    const stream = await anthropic.messages.create({
      model: "claude-3-sonnet-20240229", // Or your preferred model
      system: systemPrompt,
      messages: filteredMessagesForAI as any, // Cast needed if type mismatch
      stream: true,
      max_tokens: 1024,
    });
    console.log("Anthropic stream initiated.");

    // Data stream for completion callback
    const data = new experimental_StreamData();

    const responseStream = new ReadableStream({
        async start(controller) {
            console.log("Stream starting...");
            try {
                for await (const chunk of stream) {
                    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
                        const text = chunk.delta.text;
                        controller.enqueue(text); // Send chunk to client
                    } else if (chunk.type === 'message_stop') {
                         console.log("Message stop event received.");
                         data.close(); // Close data stream on completion
                         controller.close(); // Close the response stream
                         break;
                    }
                }
            } catch (error) {
                console.error("Error reading Anthropic stream:", error);
                controller.error(error);
                data.close();
            } finally {
                 console.log("Stream processing finished.");
                 // Ensure controller is closed
                 try { controller.close(); } catch {}
                 // Ensure data stream is closed
                 try { data.close(); } catch {}
            }
        },
        cancel(reason) {
            console.warn("Stream cancelled:", reason);
            try { data.close(); } catch {}
        }
    });

    console.log("Returning StreamingTextResponse...");
    return new StreamingTextResponse(responseStream, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        // Use onCompletion to save the full AI response
        experimental_onCompletion: async (completion) => {
             if (!completion) {
                  console.warn("Completion callback received empty completion.");
                  return;
             }
            console.log("Stream completed. Full AI response length:", completion.length);
            // Use the userId and documentId from the outer scope
            if (documentId && userId) {
                console.log(`Attempting to save AI response for document ${documentId}`);
                try {
                    const messagesRef = db.collection('users').doc(userId).collection('documents').doc(documentId).collection('messages');
                    const aiMessageData = {
                        role: 'assistant',
                        content: completion, // The full response text from the callback
                        createdAt: Timestamp.now(),
                    };
                    await messagesRef.add(aiMessageData);
                    console.log(`Saved AI message for document ${documentId}`);
                } catch (error) {
                    console.error(`Error saving AI message for document ${documentId}:`, error);
                }
            } else {
                 console.log("Skipping AI message save: No document ID or valid user ID.");
            }
        },
        // Pass the StreamData instance if needed (currently not used for sending data back)
        // data: data,
    });

  } catch (error: any) {
    console.error("Error calling Anthropic API:", error);
    let errorMessage = "Failed to get response from AI";
    if (error.response) {
      console.error("Anthropic API Error Response:", error.response.data);
      errorMessage = error.response.data?.error?.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  } finally {
      console.log("--- POST /api/chat END ---");
  }
}

// Helper function to authenticate the user - internal to this file
// This remains unchanged, returns userId and token
async function authenticateUser(
  req: NextRequest
): Promise<{ userId: string; token: string } | null> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    console.error("Auth header missing or invalid in authenticateUser");
    return null;
  }
  const idToken = authorization.split("Bearer ")[1];
  const adminAuth = getAdminAuth();
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    return { userId: decodedToken.uid, token: idToken };
  } catch (error) {
    console.error("Error verifying token in authenticateUser:", error);
    return null;
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { Message as VercelChatMessage } from "ai";
import {
  initializeFirebaseAdmin,
  getAdminAuth,
  getAdminDb,
  getAdminStorage,
} from "@/lib/firebaseAdminConfig";
import Anthropic from "@anthropic-ai/sdk";
import { processDocumentContent } from "@/lib/documentUtils";
import { processExcelOperation } from "@/lib/excelUtils";

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdmin();

export async function POST(req: NextRequest) {
  console.log("Received request at /api/chat");
  
  try {
    const body = await req.json();
    console.log("Request body:", body);
    const { message, documentId, currentDocument, documents, isFolderChat, folderName, activeSheet } = body;
    
    // Check if this is a folder chat request
    const isMultiDocumentChat = isFolderChat === true && Array.isArray(documents) && documents.length > 0;

    // Check for required fields
    if (!message) {
      console.error("Missing message");
      return NextResponse.json(
        { error: "Missing message" },
        { status: 400 }
      );
    }
    
    // For folder chat, we need documents array. For single document chat, we need documentId
    if (!isMultiDocumentChat && !documentId) {
      console.error("Missing documentId for single document chat");
      return NextResponse.json(
        { error: "Missing documentId for single document chat" },
        { status: 400 }
      );
    }
    
    if (isMultiDocumentChat && (!Array.isArray(documents) || documents.length === 0)) {
      console.error("Missing or empty documents array for folder chat");
      return NextResponse.json(
        { error: "Missing or empty documents array for folder chat" },
        { status: 400 }
      );
    }

    // Authenticate the user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("Authorization header missing or invalid");
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }
    
    const token = authHeader.split("Bearer ")[1];
    let userId: string;
    
    try {
      // Verify the token and get the user ID
      const decodedToken = await getAdminAuth().verifyIdToken(token);
      userId = decodedToken.uid;
      
      if (!userId) {
        console.error("User ID not found in token");
        return NextResponse.json(
          { error: "Authentication failed" },
          { status: 401 }
        );
      }
    } catch (error) {
      console.error("Error verifying auth token:", error);
      return NextResponse.json(
        { error: "Authentication failed" },
        { status: 401 }
      );
    }

    // Fetch document info and content
    const adminDb = getAdminDb();
    const adminStorage = getAdminStorage();

    // Arrays to store document information
    let documentContents: string[] = [];
    let documentNames: string[] = [];
    let documentTypes: string[] = [];
    let documentIds: string[] = [];

    try {
      // Ensure storage bucket is configured
      const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      if (!bucketName) {
        throw new Error("Storage bucket not configured");
      }
      const bucket = adminStorage.bucket(`gs://${bucketName}`);

      if (isMultiDocumentChat) {
        // Handle multiple documents from folder chat
        console.log(`Processing folder chat with ${documents.length} documents`);

        // Process each document in the folder
        for (const doc of documents) {
          try {
            if (!doc || !doc.id) {
              console.warn("Skipping invalid document entry");
              continue;
            }

            documentIds.push(doc.id);

            // If the document object is provided directly with all needed data
            if (doc.storagePath && doc.name && doc.contentType) {
              console.log(`Using provided document data for ${doc.id}: ${doc.name}`);
              documentNames.push(doc.name);
              documentTypes.push(doc.contentType);

              // Fetch and process the document content
              const file = bucket.file(doc.storagePath);
              const docContent = await processDocumentContent(file, doc.contentType, activeSheet);
              documentContents.push(`--- Document: ${doc.name} ---\n\n${docContent}`);
            } else {
              // Otherwise fetch from Firestore
              console.log(`Fetching document data for ${doc.id}`);
              const docRef = adminDb
                .collection("users")
                .doc(userId)
                .collection("documents")
                .doc(doc.id);
              const docSnap = await docRef.get();

              if (!docSnap.exists) {
                console.warn(`Document ${doc.id} not found, skipping`);
                continue;
              }

              const docData = docSnap.data();
              const docName = docData?.name || 'Unnamed document';
              const docType = docData?.contentType;
              const docPath = docData?.storagePath;

              if (!docPath) {
                console.warn(`Document ${doc.id} has no storagePath, skipping`);
                continue;
              }

              documentNames.push(docName);
              documentTypes.push(docType);

              // Fetch and process the document content
              const file = bucket.file(docPath);
              const docContent = await processDocumentContent(file, docType, activeSheet);
              documentContents.push(`--- Document: ${docName} ---\n\n${docContent}`);
            }
          } catch (error) {
            console.error(`Error processing document ${doc.id}:`, error);
            // Continue with other documents even if one fails
          }
        }

        console.log(`Successfully processed ${documentContents.length} documents from folder`);

        if (documentContents.length === 0) {
          return NextResponse.json(
            { error: "Could not process any documents in the folder" },
            { status: 400 }
          );
        }
      } else {
        // Handle single document chat
        // 1. Fetch Firestore document to get storagePath
        const docRef = adminDb
          .collection("users")
          .doc(userId)
          .collection("documents")
          .doc(documentId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          console.error(
            `Document not found for ID: ${documentId} and user: ${userId}`
          );
          return NextResponse.json(
            { error: "Document not found" },
            { status: 404 }
          );
        }

        const docData = docSnap.data();
        const storagePath = docData?.storagePath;
        const contentType = docData?.contentType;
        const docName = docData?.name || 'Unnamed document';

        console.log(
          `Found document: ID=${documentId}, Path=${storagePath}, Type=${contentType}`
        );

        if (!storagePath) {
          console.error(`Storage path missing for document ID: ${documentId}`);
          return NextResponse.json(
            { error: "Document metadata incomplete (missing storage path)" },
            { status: 500 }
          );
        }

        documentIds.push(documentId);
        documentNames.push(docName);
        documentTypes.push(contentType);

        // Fetch and process the document content
        const file = bucket.file(storagePath);
        const docContent = await processDocumentContent(file, contentType, activeSheet);
        documentContents.push(docContent);
      }

      // Check for Excel operations
      // Only attempt Excel operations for single document chats with Excel files
      if (message.toLowerCase().includes("excel") && !isMultiDocumentChat && 
          documentTypes[0] === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
        try {
          // processExcelOperation returns a NextResponse object
          const excelResponse = await processExcelOperation(message, documentId, [], userId);
          
          // Extract the response data from the NextResponse
          const excelResponseData = await excelResponse.json();
          
          if (excelResponseData && excelResponseData.success) {
            // If the Excel operation was successful, return the response
            return NextResponse.json({
              response: excelResponseData.message || "Excel operation completed successfully.",
              message: excelResponseData.message || "Excel operation completed successfully."
            });
          }
          // If not successful, continue with normal chat
        } catch (error) {
          console.error("Error handling Excel operation:", error);
          // Continue with normal chat if Excel operation fails
        }
      }

      // Prepare system message with document content
      let systemMessage;
      
      if (isMultiDocumentChat) {
        systemMessage = `You are a helpful assistant that can answer questions about multiple documents in a folder. ${folderName ? `The folder name is "${folderName}".` : ''} Here are the documents:\n\n${documentContents.join("\n\n" + "=".repeat(50) + "\n\n")}\n\nAnswer questions about these documents. If the answer is not in any of the documents, say so.`;
      } else {
        systemMessage = `You are a helpful assistant that can answer questions about the document content. Here is the document content:\n\n${documentContents[0]}\n\nAnswer questions about this document content. If the answer is not in the document, say so.`;
      }

      // Call the Anthropic API
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await anthropic.messages.create({
        model: "claude-3-opus-20240229",
        max_tokens: 4000,
        system: systemMessage,
        messages: [
          {
            role: "user",
            content: message
          }
        ]
      });

      // Return the AI response
      // Handle different response formats
      let responseText = "";
      if (response.content && response.content.length > 0) {
        // Check if the content has a text property
        if ('text' in response.content[0]) {
          responseText = response.content[0].text;
        } else {
          // Fallback for other content types
          responseText = JSON.stringify(response.content[0]);
        }
      }
      
      return NextResponse.json({
        response: responseText,
        message: responseText
      });
    } catch (error) {
      console.error("Error processing request:", error);
      return NextResponse.json(
        { error: "Error processing request" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Error parsing request:", error);
    return NextResponse.json(
      { error: "Error parsing request" },
      { status: 400 }
    );
  }
}

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

// Type guard to check if an error is a Firebase Storage error with a specific code
function isFirebaseStorageError(error: unknown, code: number): error is FirebaseError {
  return typeof error === 'object' && error !== null && (error as FirebaseError).code === `storage/object-not-found` && code === 404;
  // Adjust `storage/object-not-found` if the actual code string differs
}

export async function POST(req: NextRequest) {
  console.log('Received request at /api/chat');
  try {
    const body = await req.json();
    console.log('Request body:', body);
    const { message, documentId } = body;

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
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY, // Ensure this is set in .env.local
      });

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY environment variable is not set.");
      }

      console.log(`Calling Anthropic Claude 3.5 Sonnet with content length: ${documentContent.length}`);

      const aiMsg = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Based on the following document content, please answer the user's question.\n\nDocument Content:\n---\n${documentContent}\n---\n\nUser Question: ${message}`,
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
      console.error('Error calling Anthropic API:', aiError);
      // Keep the default error message for aiResponseContent
    }
    // --- End AI Call ---

    return NextResponse.json({ 
      response: {
        id: `ai-${Date.now()}`,
        role: 'ai',
        content: aiResponseContent,
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error in /api/chat:', error);
    // Generic error for unexpected issues
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

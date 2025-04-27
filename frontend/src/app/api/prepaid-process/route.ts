import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin'; // Import getters
import { FieldValue } from 'firebase-admin/firestore'; // Import FieldValue for serverTimestamp
// TODO: Import necessary AI SDK or chat API interaction logic

export async function POST(req: NextRequest) {
  console.log('[api/prepaid-process] POST request received');
  try {
    const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];

    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
    }

    let decodedToken;
    try {
      const auth = getAuth(); // Get the auth instance
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const userId = decodedToken.uid;

    // --- File Handling ---
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`[api/prepaid-process] Received file: ${file.name} for user: ${userId}`);

    // --- File Storage (Firebase Storage) ---
    const uniqueFileName = `${userId}-${Date.now()}-${file.name}`;
    // Use Admin SDK storage for backend operations with explicit bucket
    const adminStorage = getStorage();
    const configuredBucket = adminStorage.app.options.storageBucket as string | undefined;
    console.log('[api/prepaid-process] Admin SDK bucket name:', configuredBucket);
    if (!configuredBucket) {
      return NextResponse.json({ error: 'Storage bucket not configured on server.' }, { status: 500 });
    }
    const bucket = adminStorage.bucket(configuredBucket);
    const filePath = `prepaid-uploads/${uniqueFileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    // Determine correct content type, fallback based on file extension
    let uploadContentType = file.type;
    if (!uploadContentType) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (ext === 'xlsx') uploadContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === 'xls') uploadContentType = 'application/vnd.ms-excel';
      else if (ext === 'csv') uploadContentType = 'text/csv';
    }

    const fileUpload = bucket.file(filePath);
    await fileUpload.save(fileBuffer, {
      metadata: {
        contentType: uploadContentType,
      },
    });

    // Make the file publically readable (or adjust permissions as needed)
    // Consider if this is appropriate or if signed URLs are better
    await fileUpload.makePublic(); 
    const publicUrl = fileUpload.publicUrl();
    console.log(`[api/prepaid-process] File uploaded to: ${publicUrl}`);

    // --- Firestore Document Creation ---
    const db = getFirestore();
    const docData = {
      userId: userId,
      fileName: file.name,
      storagePath: filePath, // Store the path, not the public URL
      downloadURL: publicUrl, // Store public URL if needed for direct access
      contentType: uploadContentType, // Correct field for DocumentViewer
      uploadTime: FieldValue.serverTimestamp(), // Use FieldValue for timestamp
      status: 'uploaded', // Initial status
      analysisType: 'prepaid-expense', // Mark the purpose
      folderId: null, // Place in root folder so dashboard shows it
      createdAt: FieldValue.serverTimestamp(), // For ordering in dashboard
      updatedAt: FieldValue.serverTimestamp(), // Initial updated timestamp
    };

    // Use the user-specific subcollection path
    const docRef = await db.collection('users').doc(userId).collection('documents').add(docData);
    console.log(`[api/prepaid-process] Firestore document created with ID: ${docRef.id}`);

    // --- TODO: Trigger AI Analysis --- 
    // 1. Construct a prompt for the AI (e.g., analyze this file for prepaid expenses, identify start/end dates, amounts, descriptions)
    // 2. Call the existing /api/chat endpoint (or directly use the AI SDK if appropriate)
    //    - Pass the file reference (URL or content) and the prompt.
    //    - Ensure the chat endpoint knows how to handle this type of request (maybe a specific parameter?).
    // 3. Process the AI response.

    // --- Placeholder Response --- 
    console.log("[api/prepaid-process] Placeholder: File received, processing would start here.");
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate processing

    return NextResponse.json({ 
      message: 'File uploaded successfully. Analysis pending.', 
      // TODO: Return actual results or a job ID for polling
      fileName: file.name,
      documentId: docRef.id, // Return the new document ID
      // Example: analysisId: 'some-job-id'
    }, { status: 200 });

  } catch (error) {
    console.error('[api/prepaid-process] Error details:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

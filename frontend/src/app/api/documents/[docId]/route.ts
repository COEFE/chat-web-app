import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin'; // Import the base admin SDK
import { getAdminDb, getFirebaseAdmin } from '@/lib/firebaseAdminConfig'; // Import admin DB accessor and initializer
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { db as clientDb, storage as clientStorage } from '@/lib/firebaseConfig'; // Client SDK instances if needed, but prefer admin

// Initialize Firebase Admin SDK (ensures it's ready)
getFirebaseAdmin(); 

// GET request handler to fetch a single document's latest data
export async function GET(
  request: NextRequest,
  { params }: { params: { docId: string } } // Correct type for route params
) {
  const { docId } = params;
  if (!docId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  // 1. Verify Authentication
  const authorization = request.headers.get('Authorization');
  if (!authorization || !authorization.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Authorization header missing or invalid' }, { status: 401 });
  }
  const idToken = authorization.split('Bearer ')[1];

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
    if (!decodedToken || !decodedToken.uid) {
      throw new Error('Invalid token or missing UID');
    }
  } catch (error) {
    console.error('[API GET /documents] Token verification failed:', error);
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return NextResponse.json({ error: `Unauthorized: ${message}` }, { status: 401 });
  }

  const userId = decodedToken.uid;

  console.log(`[API GET /documents/${docId}] Request received for user: ${userId}`);

  try {
    // 2. Fetch Document Metadata from Firestore using Admin SDK
    const adminDb = getAdminDb(); // Get the initialized admin DB instance
    const docRef = adminDb.collection('users').doc(userId).collection('documents').doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.warn(`[API GET /documents/${docId}] Document not found for user ${userId}`);
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const documentData = docSnap.data();
    if (!documentData) {
        console.error(`[API GET /documents/${docId}] Document exists but data is empty for user ${userId}`);
      return NextResponse.json({ error: 'Document data is missing' }, { status: 500 });
    }

    // Add the ID to the data object
    const documentWithId = {
      ...documentData,
      id: docSnap.id,
      // Ensure timestamps are handled (convert if necessary, or assume client handles it)
      uploadedAt: documentData.uploadedAt?.toDate ? documentData.uploadedAt.toDate().toISOString() : documentData.uploadedAt,
      createdAt: documentData.createdAt?.toDate ? documentData.createdAt.toDate().toISOString() : documentData.createdAt,
      updatedAt: documentData.updatedAt?.toDate ? documentData.updatedAt.toDate().toISOString() : documentData.updatedAt,
    };

    console.log(`[API GET /documents/${docId}] Successfully fetched metadata for user ${userId}`);

    // 3. Optionally fetch content or provide a proxy URL (similar to file-proxy)
    // For simplicity in this refresh, we might just return the metadata,
    // and let the DocumentViewer use its existing file-proxy logic if the storagePath changes.
    // Or, we could fetch the content here directly if needed. Let's return metadata for now.

    return NextResponse.json({ document: documentWithId }, { status: 200 });

  } catch (error) {
    console.error(`[API GET /documents/${docId}] Error fetching document for user ${userId}:`, error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Failed to fetch document: ${message}` }, { status: 500 });
  }
}

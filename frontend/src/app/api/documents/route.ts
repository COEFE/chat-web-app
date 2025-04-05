import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb } from '@/lib/firebaseAdminConfig'; // Ensure admin app is initialized

// Initialize Firebase Admin SDK (handles checking if already initialized)
initializeFirebaseAdmin();

export async function GET(req: NextRequest) {
  console.log('GET /api/documents called');

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    console.error('GET /api/documents - Unauthorized: No Bearer token');
    return NextResponse.json({ error: 'Unauthorized: Missing Bearer token' }, { status: 401 });
  }

  const idToken = authorization.split('Bearer ')[1];
  let userId: string;

  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log(`GET /api/documents - Authenticated user ID from token: ${userId}`);
  } catch (error: any) {
    console.error('GET /api/documents - Unauthorized: Invalid token', error);
    return NextResponse.json({ error: 'Unauthorized: Invalid token', details: error.message }, { status: 401 });
  }

  // User is authenticated, proceed to fetch documents
  try {
    const db = getAdminDb();
    // Assuming documents are stored under users/{userId}/documents
    const documentsRef = db.collection('users').doc(userId).collection('documents');
    const snapshot = await documentsRef.get();

    if (snapshot.empty) {
      console.log(`GET /api/documents - No documents found for user: ${userId}`);
      return NextResponse.json({ documents: [] }, { status: 200 });
    }

    const documents = snapshot.docs.map((doc) => ({
      id: doc.id,
      filename: doc.data().filename || 'Untitled Document',
      contentType: doc.data().contentType || 'unknown',
      downloadURL: doc.data().downloadURL || null,
      createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : doc.data().createdAt, // Handle potential timestamp format
      // Add other fields like storagePath if stored and needed
    }));

    console.log(`GET /api/documents - Found ${documents.length} documents for user: ${userId}`);
    return NextResponse.json({ documents }, { status: 200 });

  } catch (error: any) {
    console.error(`GET /api/documents - Error fetching documents for user ${userId}:`, error);
    console.error('Error details:', { message: error.message, stack: error.stack });
    return NextResponse.json({ error: 'Failed to fetch documents', details: error.message }, { status: 500 });
  }
}

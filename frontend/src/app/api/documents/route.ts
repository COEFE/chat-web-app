import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig'; // Ensure admin app is initialized

// Initialize Firebase Admin SDK (handles checking if already initialized)
initializeFirebaseAdmin();

// Helper function to authenticate user from token
async function authenticateUser(req: NextRequest) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    console.error('API /documents - Unauthorized: No Bearer token');
    return { error: 'Unauthorized: Missing Bearer token', status: 401 };
  }

  const idToken = authorization.split('Bearer ')[1];
  
  try {
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    return { userId: decodedToken.uid };
  } catch (error: any) {
    console.error('API /documents - Unauthorized: Invalid token', error);
    return { error: 'Unauthorized: Invalid token', details: error.message, status: 401 };
  }
}

export async function GET(req: NextRequest) {
  console.log('GET /api/documents called');

  const auth = await authenticateUser(req);
  
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, details: auth.details }, { status: auth.status });
  }
  
  const userId = auth.userId;
  console.log(`GET /api/documents - Authenticated user ID from token: ${userId}`);

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

    const documents = snapshot.docs.map((doc) => {
      const data = doc.data();
      console.log(`Document data for ${doc.id}:`, data);
      return {
        id: doc.id,
        filename: data.name || data.filename || data.originalName || doc.id,
        contentType: data.contentType || 'unknown',
        downloadURL: data.downloadURL || null,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt, // Handle potential timestamp format
        // Add other fields like storagePath if stored and needed
      };
    });

    console.log(`GET /api/documents - Found ${documents.length} documents for user: ${userId}`);
    return NextResponse.json({ documents }, { status: 200 });

  } catch (error: any) {
    console.error(`GET /api/documents - Error fetching documents for user ${userId}:`, error);
    console.error('Error details:', { message: error.message, stack: error.stack });
    return NextResponse.json({ error: 'Failed to fetch documents', details: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  console.log('DELETE /api/documents called');
  
  const auth = await authenticateUser(req);
  
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, details: auth.details }, { status: auth.status });
  }
  
  const userId = auth.userId;
  console.log(`DELETE /api/documents - Authenticated user ID from token: ${userId}`);
  
  // Get document ID from URL or request body
  const url = new URL(req.url);
  const documentId = url.searchParams.get('id');
  
  if (!documentId) {
    console.error('DELETE /api/documents - Bad request: Missing document ID');
    return NextResponse.json({ error: 'Bad request: Missing document ID' }, { status: 400 });
  }
  
  try {
    const db = getAdminDb();
    const storage = getAdminStorage();
    
    // Get the document reference
    const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
    
    // Get the document data to find storage path
    const docSnapshot = await docRef.get();
    
    if (!docSnapshot.exists) {
      console.error(`DELETE /api/documents - Document not found: ${documentId}`);
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    
    const docData = docSnapshot.data();
    
    // Delete from storage if storagePath exists
    if (docData?.storagePath) {
      try {
        // Explicitly specify the bucket name
        const bucketName = 'web-chat-app-fa7f0.firebasestorage.app';
        const bucket = storage.bucket(bucketName);
        console.log(`DELETE /api/documents - Using bucket: ${bucketName}`);
        
        await bucket.file(docData.storagePath).delete();
        console.log(`DELETE /api/documents - Deleted file from storage: ${docData.storagePath}`);
      } catch (storageError: any) {
        // Log but continue - we still want to delete the document record
        console.error(`DELETE /api/documents - Error deleting file from storage: ${docData.storagePath}`, storageError);
        console.error('Storage error details:', { 
          message: storageError.message, 
          stack: storageError.stack,
          code: storageError.code,
          errorInfo: storageError.errorInfo
        });
      }
    }
    
    // Delete the document from Firestore
    await docRef.delete();
    console.log(`DELETE /api/documents - Deleted document: ${documentId}`);
    
    return NextResponse.json({ success: true, message: 'Document deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`DELETE /api/documents - Error deleting document ${documentId}:`, error);
    console.error('Error details:', { message: error.message, stack: error.stack });
    return NextResponse.json({ error: 'Failed to delete document', details: error.message }, { status: 500 });
  }
}

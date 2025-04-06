import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig'; // Ensure admin app is initialized

// Initialize Firebase Admin SDK at the module level
try {
  console.log('Initializing Firebase Admin SDK in documents API route');
  const app = initializeFirebaseAdmin();
  console.log(`Firebase Admin SDK initialized successfully with app name: ${app.name}`);
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK in documents API route:', error);
}

// Helper function to authenticate user from token
async function authenticateUser(req: NextRequest) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    console.error('API /documents - Unauthorized: No Bearer token');
    return { error: 'Unauthorized: Missing Bearer token', status: 401 };
  }

  const idToken = authorization.split('Bearer ')[1];
  
  try {
    // Ensure Firebase Admin is initialized before getting auth
    try {
      initializeFirebaseAdmin();
    } catch (initError: any) {
      console.error('Failed to initialize Firebase Admin in authenticateUser:', initError);
      throw new Error(`Firebase initialization error: ${initError.message}`);
    }
    
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
    // Ensure Firebase Admin is initialized before getting the database
    try {
      initializeFirebaseAdmin();
    } catch (initError: any) {
      console.error('Failed to initialize Firebase Admin in GET handler:', initError);
      throw new Error(`Firebase initialization error: ${initError.message}`);
    }
    
    const db = getAdminDb();
    console.log('Successfully got Firestore DB instance');
    
    // Assuming documents are stored under users/{userId}/documents
    const documentsRef = db.collection('users').doc(userId).collection('documents');
    console.log(`Querying documents for user: ${userId}`);
    const snapshot = await documentsRef.get();

    if (snapshot.empty) {
      console.log(`GET /api/documents - No documents found for user: ${userId}`);
      return NextResponse.json({ documents: [] }, { status: 200 });
    }

    const documents = snapshot.docs.map((doc) => {
      const data = doc.data();
      console.log(`Document data for ${doc.id}:`, data);
      
      // Normalize content type for Excel files
      let contentType = data.contentType || 'unknown';
      
      // Log the content type for debugging
      console.log(`Original content type for ${doc.id}: ${contentType}`);
      
      // Normalize Excel content types to ensure consistent handling
      if (contentType.includes('excel') || 
          contentType.includes('spreadsheet') || 
          contentType.includes('xlsx') || 
          contentType.includes('xls') || 
          contentType.includes('csv')) {
        console.log(`Normalizing Excel content type for ${doc.id}`);
        if (data.name?.toLowerCase().endsWith('.xlsx')) {
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (data.name?.toLowerCase().endsWith('.xls')) {
          contentType = 'application/vnd.ms-excel';
        } else if (data.name?.toLowerCase().endsWith('.csv')) {
          contentType = 'text/csv';
        }
      }
      
      // Handle timestamps properly
      let uploadedAt = data.uploadedAt;
      if (uploadedAt?.toDate) {
        uploadedAt = uploadedAt.toDate();
      } else if (uploadedAt && typeof uploadedAt === 'string') {
        try {
          uploadedAt = new Date(uploadedAt);
        } catch (e) {
          console.warn(`Could not parse uploadedAt string: ${uploadedAt}`);
          uploadedAt = null;
        }
      } else if (!uploadedAt && data.createdAt) {
        // Fall back to createdAt if uploadedAt is missing
        uploadedAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt;
      }
      
      return {
        id: doc.id,
        name: data.name || data.filename || data.originalName || doc.id,
        contentType: contentType,
        downloadURL: data.downloadURL || null,
        uploadedAt: uploadedAt,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
        storagePath: data.storagePath || null,
        status: data.status || 'unknown', 
        userId: data.userId || userId, // Fallback to the authenticated userId if needed
        size: data.size || 0
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
    // Ensure Firebase Admin is initialized before getting services
    try {
      initializeFirebaseAdmin();
    } catch (initError: any) {
      console.error('Failed to initialize Firebase Admin in DELETE handler:', initError);
      throw new Error(`Firebase initialization error: ${initError.message}`);
    }
    
    const db = getAdminDb();
    const storage = getAdminStorage();
    console.log('Successfully got Firestore DB and Storage instances');
    
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
        // Get the bucket name from environment variables or use default
        const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
        console.log(`DELETE /api/documents - Using bucket: ${bucketName}`);
        
        // Get the bucket with the specific name
        const bucket = storage.bucket(bucketName);
        
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

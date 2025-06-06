import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig'; // Ensure admin app is initialized
import { randomUUID } from 'crypto';

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
        // Use fileName if name missing
        name: data.name || data.fileName || data.filename || data.originalName || doc.id,
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
  
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  let documentIds: string[] = [];
  if (idsParam) {
    documentIds = idsParam.split(',').filter(Boolean);
  } else {
    const documentId = url.searchParams.get('id');
    if (documentId) documentIds = [documentId];
    else {
      // Attempt to read JSON body for ids array
      try {
        const body = await req.json();
        if (Array.isArray(body?.ids)) {
          documentIds = body.ids;
        }
      } catch (_) {
        // ignore JSON parse errors
      }
    }
  }

  if (documentIds.length === 0) {
    console.error('DELETE /api/documents - Bad request: Missing document ID(s)');
    return NextResponse.json({ error: 'Bad request: Missing document ID(s)' }, { status: 400 });
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
    
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
    const bucket = storage.bucket(bucketName);

    for (const docId of documentIds) {
      try {
        const docRef = db.collection('users').doc(userId).collection('documents').doc(docId);
        const snap = await docRef.get();
        if (!snap.exists) {
          console.warn(`DELETE /api/documents - Document not found: ${docId}`);
          continue;
        }
        const data = snap.data();
        if (data?.storagePath) {
          try {
            await bucket.file(data.storagePath).delete();
            console.log(`Deleted storage file ${data.storagePath}`);
          } catch (err: any) {
            console.error(`Error deleting storage file ${data.storagePath}`, err);
          }
        }
        await docRef.delete();
        console.log(`Deleted Firestore document ${docId}`);
      } catch (err: any) {
        console.error(`DELETE error for ${docId}:`, err);
      }
    }

    return NextResponse.json({ success: true, message: 'Document(s) deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error(`DELETE /api/documents - Error deleting document(s):`, error);
    console.error('Error details:', { message: error.message, stack: error.stack });
    return NextResponse.json({ error: 'Failed to delete document(s)', details: error.message }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Handles document upload (multipart/form-data with a single `file` field)
 */
export async function POST(req: NextRequest) {
  console.log('POST /api/documents called');

  // Authenticate user
  const auth = await authenticateUser(req);

  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, details: auth.details }, { status: auth.status });
  }

  const userId = auth.userId;
  console.log(`POST /api/documents - Authenticated user ID: ${userId}`);

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Initialize Firebase services
    initializeFirebaseAdmin();
    const db = getAdminDb();
    const storage = getAdminStorage();

    // Determine bucket and storage path
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
    const bucket = storage.bucket(bucketName);

    const timestamp = Date.now();
    const originalName = file.name;
    const extension = originalName.split('.').pop() || '';
    const uniqueName = `${randomUUID()}.${extension}`;
    const storagePath = `uploads/${userId}/${timestamp}-${uniqueName}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine contentType fallbacks
    let uploadContentType = file.type;
    if (!uploadContentType) {
      if (extension === 'xlsx') uploadContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (extension === 'xls') uploadContentType = 'application/vnd.ms-excel';
      else if (extension === 'csv') uploadContentType = 'text/csv';
      else uploadContentType = 'application/octet-stream';
    }

    // Save to storage
    const fileRef = bucket.file(storagePath);
    await fileRef.save(buffer, { metadata: { contentType: uploadContentType } });

    // Make the file publicly accessible via download URL (optional)
    const [signedUrl] = await fileRef.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 7 });

    // Store metadata in Firestore
    const docRef = db.collection('users').doc(userId).collection('documents').doc();
    const docData = {
      name: originalName,
      contentType: uploadContentType,
      size: file.size,
      uploadedAt: new Date(),
      storagePath,
      downloadURL: signedUrl,
      status: 'uploaded',
      userId,
    };

    await docRef.set(docData);

    console.log(`POST /api/documents - File uploaded and metadata saved (docId: ${docRef.id})`);

    return NextResponse.json({ success: true, document: { id: docRef.id, ...docData } }, { status: 200 });
  } catch (error: any) {
    console.error('POST /api/documents - Error uploading document:', error);
    return NextResponse.json({ error: 'Failed to upload document', details: error.message }, { status: 500 });
  }
}

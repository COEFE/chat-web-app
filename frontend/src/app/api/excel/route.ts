import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebaseAdminConfig';
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';

// Initialize Firebase Admin SDK
try {
  console.log('Initializing Firebase Admin SDK in excel API route');
  const app = initializeFirebaseAdmin();
  console.log(`Firebase Admin SDK initialized successfully with app name: ${app.name}`);
} catch (error) {
  console.error('Failed to initialize Firebase Admin SDK in excel API route:', error);
}

// Helper function to authenticate user from token
async function authenticateUser(req: NextRequest) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    console.error('API /excel - Unauthorized: No Bearer token');
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
    console.error('API /excel - Unauthorized: Invalid token', error);
    return { error: 'Unauthorized: Invalid token', details: error.message, status: 401 };
  }
}

// POST endpoint for creating or editing Excel files
export async function POST(req: NextRequest) {
  console.log('POST /api/excel called');

  // Authenticate the user
  const auth = await authenticateUser(req);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, details: auth.details }, { status: auth.status });
  }
  
  const userId = auth.userId;
  console.log(`POST /api/excel - Authenticated user ID from token: ${userId}`);

  try {
    // Parse the request body
    const body = await req.json();
    const { operation, documentId, data, fileName } = body;

    if (!operation) {
      return NextResponse.json({ error: 'Missing operation parameter' }, { status: 400 });
    }

    // Get Firebase Admin instances
    const adminDb = getAdminDb();
    const adminStorage = getAdminStorage();
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    
    if (!bucketName) {
      throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET environment variable not set!');
    }
    
    const bucket = adminStorage.bucket(`gs://${bucketName}`);

    // Handle different operations
    if (operation === 'create') {
      // Validate required parameters for create operation
      if (!data || !fileName) {
        return NextResponse.json({ 
          error: 'Missing required parameters for create operation', 
          details: 'Both data and fileName are required' 
        }, { status: 400 });
      }

      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Process the data for each sheet
      for (const sheet of data) {
        const { sheetName, sheetData } = sheet;
        
        // Convert the data to a worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        
        // Add the worksheet to the workbook
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');
      }

      // Generate a unique file name to avoid conflicts
      const timestamp = Date.now();
      const uniqueFileName = `${fileName}-${timestamp}.xlsx`;
      const storagePath = `users/${userId}/${uniqueFileName}`;
      
      // Write the workbook to a buffer
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // Upload the file to Firebase Storage
      const file = bucket.file(storagePath);
      await file.save(excelBuffer, {
        metadata: {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          metadata: {
            userId,
            originalName: fileName,
            timestamp: timestamp.toString()
          }
        }
      });

      // Get the download URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2500', // Far future expiration
      });

      // Create a document in Firestore
      const docId = uuidv4();
      const docRef = adminDb.collection('users').doc(userId).collection('documents').doc(docId);
      
      await docRef.set({
        name: fileName,
        storagePath,
        url,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        createdAt: new Date(),
        updatedAt: new Date(),
        size: excelBuffer.length,
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Excel file created successfully',
        documentId: docId,
        fileName: uniqueFileName,
        url
      });
    } 
    else if (operation === 'edit') {
      // Validate required parameters for edit operation
      if (!documentId || !data) {
        return NextResponse.json({ 
          error: 'Missing required parameters for edit operation', 
          details: 'Both documentId and data are required' 
        }, { status: 400 });
      }

      // Try to get the document from Firestore using the provided ID
      let docRef = adminDb.collection('users').doc(userId).collection('documents').doc(documentId);
      let docSnap = await docRef.get();
      
      // If document not found by ID, try to find it by name
      if (!docSnap.exists) {
        console.log(`Document with ID ${documentId} not found, trying to find by name`);
        
        // Query documents by name
        const documentsRef = adminDb.collection('users').doc(userId).collection('documents');
        const nameQuery = await documentsRef.where('name', '==', documentId).get();
        
        if (nameQuery.empty) {
          // Get a list of available documents to provide helpful guidance
          const allDocsQuery = await documentsRef.limit(5).get();
          const availableDocs = allDocsQuery.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name
          }));
          
          return NextResponse.json({ 
            error: 'Document not found', 
            details: `No document found with the provided ID or name: "${documentId}". Please use a valid document ID, not the document name.`,
            availableDocuments: availableDocs.length > 0 ? availableDocs : undefined
          }, { status: 404 });
        }
        
        // Use the first document that matches the name
        docSnap = nameQuery.docs[0];
        docRef = docSnap.ref;
        console.log(`Found document by name: ${docSnap.id}`);
      }
      
      const docData = docSnap.data();
      if (!docData) {
        return NextResponse.json({ error: 'Document data is empty' }, { status: 500 });
      }
      
      const storagePath = docData.storagePath;
      const originalName = docData.name;
      
      // Get the file from Firebase Storage
      const file = bucket.file(storagePath);
      const [fileBuffer] = await file.download();
      
      // Read the existing workbook
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      
      // Process the edits for each sheet
      for (const edit of data) {
        const { sheetName, cellUpdates } = edit;
        
        // Get the worksheet
        let worksheet = workbook.Sheets[sheetName];
        
        // If the sheet doesn't exist, create it
        if (!worksheet) {
          worksheet = XLSX.utils.aoa_to_sheet([[]]);
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        }
        
        // Apply the cell updates
        for (const update of cellUpdates) {
          const { cell, value } = update;
          XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cell });
        }
      }
      
      // Write the updated workbook to a buffer
      const updatedBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // Upload the updated file to Firebase Storage
      await file.save(updatedBuffer, {
        metadata: {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          metadata: {
            userId,
            originalName,
            timestamp: Date.now().toString()
          }
        }
      });
      
      // Get the download URL
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: '03-01-2500', // Far future expiration
      });
      
      // Update the document in Firestore
      await docRef.update({
        updatedAt: new Date(),
        size: updatedBuffer.length,
        url, // Update the URL in case it changed
      });
      
      return NextResponse.json({ 
        success: true, 
        message: 'Excel file updated successfully',
        documentId,
        fileName: originalName,
        url
      });
    }
    else {
      return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Error in /api/excel:', error);
    return NextResponse.json({ 
      error: 'Failed to process Excel operation', 
      details: error.message 
    }, { status: 500 });
  }
}

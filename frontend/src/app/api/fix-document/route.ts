import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebaseAdminConfig';

export async function GET(request: NextRequest) {
  try {
    console.log('Starting document fix operation');
    
    // Get the document ID from the URL
    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get('documentId');
    const userId = searchParams.get('userId');
    
    if (!documentId || !userId) {
      return NextResponse.json({ 
        success: false, 
        message: 'Missing required parameters: documentId and userId' 
      }, { status: 400 });
    }
    
    console.log(`Fixing document ${documentId} for user ${userId}`);
    
    // Get Firestore instance
    const db = getAdminDb();
    if (!db) {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to initialize Firestore' 
      }, { status: 500 });
    }
    
    // Get reference to the document
    const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
    
    // Update the document to add the folderId field
    await docRef.update({
      folderId: null // Set to null for root folder
    });
    
    console.log(`Successfully updated document ${documentId}`);
    
    return NextResponse.json({ 
      success: true, 
      message: `Document ${documentId} updated successfully` 
    });
  } catch (error: any) {
    console.error('Error updating document:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Error updating document: ${error.message}` 
    }, { status: 500 });
  }
}

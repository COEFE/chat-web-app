import { NextRequest, NextResponse } from 'next/server';
import { getVercelFirestore, initVercelFirebaseAdmin } from '../../../lib/firebase/vercelAdmin';
import { MyDocumentData } from '@/types'; // Import MyDocumentData type
import { Timestamp } from 'firebase/firestore'; // Import Timestamp

// Set up CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Firebase Admin using Vercel-specific implementation
let db: FirebaseFirestore.Firestore | null = null;
try {
  console.log('[share-details-simple] Initializing Firebase Admin for Vercel...');
  initVercelFirebaseAdmin();
  db = getVercelFirestore();
  console.log('[share-details-simple] Firebase Admin initialized successfully for Vercel');
} catch (error) {
  console.error('[share-details-simple] Error initializing Firebase Admin for Vercel:', error);
  // We'll handle this in the route handler
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  // Check if Firebase Admin was initialized successfully
  if (!db) {
    console.error('[share-details-simple] Firebase Admin not initialized');
    // We'll continue with mock data instead of returning an error
    console.log('[share-details-simple] Will use mock data due to Firebase Admin initialization failure');
  }
  
  try {
    console.log('[share-details-simple] Processing request...');
    
    // Get the request body
    const body = await request.json();
    const { shareId, passwordToken } = body;
    
    console.log(`[share-details-simple] Received request for shareId: ${shareId}`);
    
    if (!shareId) {
      console.log('[share-details-simple] Missing shareId in request');
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }
    
    // Mock response for testing
    const mockResponse: any = {
      documentId: 'mock-document-id',
      documentName: 'Mock Document',
      documentPath: 'documents/mock-document.pdf',
      expiresAt: null,
      includeChat: true,
      accessType: 'view',
      password: null,
      ownerUserId: 'mock-owner-id', // Add mock ownerUserId
      documentData: { // Add mock documentData (adjust structure as needed)
        id: 'mock-document-id',
        userId: 'mock-owner-id',
        name: 'Mock Document',
        storagePath: 'documents/mock-document.pdf',
        createdAt: Timestamp.now(),
        fileType: 'application/pdf',
        fileSize: 12345,
        folderId: null, // Added mock value
        uploadedAt: Timestamp.now(), // Added mock value
        updatedAt: Timestamp.now(), // Added mock value
        status: 'processed', // Added mock value
      } as MyDocumentData
    };
    
    // Try to get the real share document if Firebase is initialized
    let responseData = { ...mockResponse }; // Start with mock data
    
    if (db) {
      try {
        console.log(`[share-details-simple] Fetching share document with ID: ${shareId}`);
        const shareRef = db.collection('shares').doc(shareId);
        const shareDoc = await shareRef.get();
        
        let shareData: any; // Declare shareData here
        
        if (!shareDoc.exists) {
          console.log(`[share-details-simple] Share not found: ${shareId}`);
          return NextResponse.json(
            { error: 'Share not found' },
            { status: 404, headers: corsHeaders }
          );
        }
        
        console.log(`[share-details-simple] Share document found: ${shareId}`);
        
        shareData = shareDoc.data(); // Get share data
        
        if (!shareData || !shareData.documentId || !shareData.ownerUserId) {
          console.error('[share-details-simple] Share data missing required fields (documentId or ownerUserId)');
          return NextResponse.json(
            { error: 'Invalid share data configuration' },
            { status: 500, headers: corsHeaders }
          );
        }
        
        // Fetch the actual document details using ownerUserId and documentId
        const documentRef = db.collection('users').doc(shareData.ownerUserId)
                              .collection('documents').doc(shareData.documentId);
        const documentDoc = await documentRef.get();
        
        if (!documentDoc.exists) {
          console.error(`[share-details-simple] Document not found: users/${shareData.ownerUserId}/documents/${shareData.documentId}`);
          return NextResponse.json(
            { error: 'Associated document not found' },
            { status: 404, headers: corsHeaders }
          );
        }
        
        const documentData = documentDoc.data() as MyDocumentData;
        
        // If password protected, check for token
        if (shareData.password && !passwordToken) {
          console.log(`[share-details-simple] Password protected share, no token provided`);
          return NextResponse.json(
            { 
              password: true,
              documentName: shareData.documentName || 'Protected Document',
              ownerUserId: shareData.ownerUserId // Still return ownerUserId if known
            },
            { status: 200, headers: corsHeaders }
          );
        }
        
        // Verification should happen in verify-share-password route
        
        // Check if share has expired
        if (shareData.expiresAt && shareData.expiresAt < Date.now()) {
          console.log(`[share-details-simple] Share expired: ${shareId}`);
          return NextResponse.json(
            { error: 'Share has expired' },
            { status: 410, headers: corsHeaders }
          );
        }
        
        // Update response data with actual share data and document data
        responseData = {
          ...shareData,
          documentData,
        };
      } catch (dbError) {
        console.error(`[share-details-simple] Error fetching from database: ${dbError}`);
        console.log('[share-details-simple] Using mock data due to database error');
        // Continue with mock data
        responseData = mockResponse;
      }
    } else {
      console.log('[share-details-simple] Firebase not initialized, using mock data');
      responseData = mockResponse; // Ensure we use mock if DB fails init
    }
    
    // Return the share details
    return NextResponse.json(
      responseData, // Return the combined/mock data
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[share-details-simple] Error getting share details:', error);
    return NextResponse.json(
      { error: 'Failed to get share details' },
      { status: 500, headers: corsHeaders }
    );
  }
}

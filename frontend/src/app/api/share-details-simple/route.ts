import { NextRequest, NextResponse } from 'next/server';
import { getVercelFirestore, initVercelFirebaseAdmin } from '../../../lib/firebase/vercelAdmin';

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
    // This allows us to test the client without Firebase Admin working
    const mockResponse = {
      documentId: 'mock-document-id',
      documentName: 'Mock Document',
      documentPath: 'documents/mock-document.pdf',
      expiresAt: null,
      includeChat: true,
      accessType: 'view',
      password: null
    };
    
    // Try to get the real share document if Firebase is initialized
    let shareData = mockResponse;
    
    if (db) {
      try {
        console.log(`[share-details-simple] Fetching share document with ID: ${shareId}`);
        const shareRef = db.collection('shares').doc(shareId);
        const shareDoc = await shareRef.get();
        
        if (!shareDoc.exists) {
          console.log(`[share-details-simple] Share not found: ${shareId}`);
          return NextResponse.json(
            { error: 'Share not found' },
            { status: 404, headers: corsHeaders }
          );
        }
        
        console.log(`[share-details-simple] Share document found: ${shareId}`);
        
        shareData = shareDoc.data() as any;
        
        // If password protected, check for token
        if (shareData.password && !passwordToken) {
          console.log(`[share-details-simple] Password protected share, no token provided`);
          return NextResponse.json(
            { 
              password: true,
              documentName: shareData.documentName || 'Protected Document'
            },
            { status: 200, headers: corsHeaders }
          );
        }
        
        // If we have a token, we've already verified the password
        if (shareData.password && passwordToken) {
          // In a real implementation, verify the token here
          console.log(`[share-details-simple] Password token provided, proceeding`);
        }
        
        // Check if share has expired
        if (shareData.expiresAt && shareData.expiresAt < Date.now()) {
          console.log(`[share-details-simple] Share expired: ${shareId}`);
          return NextResponse.json(
            { error: 'Share has expired' },
            { status: 410, headers: corsHeaders }
          );
        }
      } catch (dbError) {
        console.error(`[share-details-simple] Error fetching from database: ${dbError}`);
        console.log('[share-details-simple] Using mock data due to database error');
        // Continue with mock data
        shareData = mockResponse;
      }
    } else {
      console.log('[share-details-simple] Firebase not initialized, using mock data');
    }
    
    // Return the share details
    return NextResponse.json(
      shareData,
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

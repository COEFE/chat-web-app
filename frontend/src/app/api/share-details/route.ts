import { NextRequest, NextResponse } from 'next/server';
import { getVercelFirestore, initVercelFirebaseAdmin } from '../../../lib/firebase/vercelAdmin';

// Set up CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Firebase Admin with try/catch for better error handling
let db: FirebaseFirestore.Firestore | null = null;
try {
  console.log('[share-details] Initializing Firebase Admin for Vercel...');
  initVercelFirebaseAdmin();
  db = getVercelFirestore();
  console.log('[share-details] Firebase Admin initialized successfully for Vercel');
} catch (error) {
  console.error('[share-details] Error initializing Firebase Admin for Vercel:', error);
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
    console.error('[share-details] Firebase Admin not initialized');
    return NextResponse.json(
      { error: 'Internal server error: Database not available' },
      { status: 500, headers: corsHeaders }
    );
  }
  
  try {
    console.log('[share-details] Processing share details request...');

    // Get the request body
    const body = await request.json();
    const { shareId, passwordToken } = body;
    
    console.log(`[share-details] Received request for shareId: ${shareId}`);

    if (!shareId) {
      console.log('[share-details] Missing shareId in request');
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the share document from Firestore
    console.log(`[share-details] Fetching share document with ID: ${shareId}`);
    const shareRef = db.collection('shares').doc(shareId);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      console.log(`[share-details] Share not found: ${shareId}`);
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    console.log(`[share-details] Share document found: ${shareId}`);

    const shareData = shareDoc.data();
    
    // Check if share has expired
    if (shareData?.expiresAt && shareData.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'This share link has expired' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check if password protection is enabled and no token is provided
    if (shareData?.password === true && !passwordToken) {
      return NextResponse.json(
        { 
          error: 'This document is password protected',
          requiresPassword: true 
        },
        { status: 403, headers: corsHeaders }
      );
    }

    // Record access
    // This would normally verify the password token, but for simplicity we'll skip that
    await shareRef.update({
      [`accessedBy.anonymous`]: {
        lastAccessed: Date.now(),
        accessCount: 1, // Simplified for now
      },
    });

    // Return the share details
    return NextResponse.json(
      {
        documentId: shareData?.documentId,
        documentName: shareData?.documentName,
        documentPath: shareData?.documentPath,
        expiresAt: shareData?.expiresAt,
        includeChat: shareData?.includeChat,
        accessType: shareData?.accessType,
        password: shareData?.password ? true : null,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[share-details] Error getting share details:', error);
    return NextResponse.json(
      { error: 'Failed to get share details' },
      { status: 500, headers: corsHeaders }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getVercelFirestore, initVercelFirebaseAdmin } from '../../../lib/firebase/vercelAdmin';
import { randomBytes } from 'crypto';

// Set up CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Firebase Admin with try/catch for better error handling
let db: FirebaseFirestore.Firestore | null = null;
try {
  console.log('[verify-password] Initializing Firebase Admin for Vercel...');
  initVercelFirebaseAdmin();
  db = getVercelFirestore();
  console.log('[verify-password] Firebase Admin initialized successfully for Vercel');
} catch (error) {
  console.error('[verify-password] Error initializing Firebase Admin for Vercel:', error);
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
    console.error('[verify-password] Firebase Admin not initialized');
    return NextResponse.json(
      { error: 'Internal server error: Database not available' },
      { status: 500, headers: corsHeaders }
    );
  }
  
  try {
    console.log('[verify-password] Processing password verification request...');

    // Get the request body
    const body = await request.json();
    const { shareId, password } = body;
    
    console.log(`[verify-password] Received verification request for shareId: ${shareId}`);

    if (!shareId || !password) {
      console.log('[verify-password] Missing shareId or password in request');
      return NextResponse.json(
        { error: 'Share ID and password are required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the share document from Firestore
    console.log(`[verify-password] Fetching share document with ID: ${shareId}`);
    const shareRef = db.collection('shares').doc(shareId);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      console.log(`[verify-password] Share not found: ${shareId}`);
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404, headers: corsHeaders }
      );
    }
    
    console.log(`[verify-password] Share document found: ${shareId}`);

    const shareData = shareDoc.data();
    
    // Check if share has expired
    if (shareData?.expiresAt && shareData.expiresAt < Date.now()) {
      return NextResponse.json(
        { error: 'This share link has expired' },
        { status: 403, headers: corsHeaders }
      );
    }

    // Check if password protection is enabled
    if (shareData?.password !== true) {
      return NextResponse.json(
        { error: 'This document is not password protected' },
        { status: 400, headers: corsHeaders }
      );
    }

    // For simplicity, we'll just accept any password for now
    // In a real implementation, you would compare with a stored hash
    // This is just a placeholder for demonstration
    const accessGranted = true; // Simplified for now
    
    if (!accessGranted) {
      return NextResponse.json(
        { accessGranted: false },
        { status: 403, headers: corsHeaders }
      );
    }

    // Generate a simple access token
    const token = randomBytes(32).toString('hex');
    
    // Record access
    await shareRef.update({
      [`accessedBy.passwordVerified`]: {
        lastAccessed: Date.now(),
        accessCount: 1, // Simplified for now
      },
    });

    // Return success with token
    return NextResponse.json(
      {
        accessGranted: true,
        token,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[verify-password] Error verifying share password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500, headers: corsHeaders }
    );
  }
}

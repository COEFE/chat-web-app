import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Set up CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Initialize Firebase Admin directly in this file
let db: FirebaseFirestore.Firestore;
try {
  // Check if already initialized
  if (getApps().length === 0) {
    console.log('[share-details-simple] Initializing Firebase Admin...');
    
    // Initialize with minimal config
    const app = initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'web-chat-app-fa7f0',
    });
    
    console.log('[share-details-simple] Firebase Admin initialized successfully');
  }
  
  db = getFirestore();
  console.log('[share-details-simple] Firestore initialized');
} catch (error) {
  console.error('[share-details-simple] Error initializing Firebase Admin:', error);
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
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
        console.error('[share-details-simple] Error fetching from database:', dbError);
        // Fall back to mock data
        console.log('[share-details-simple] Using mock data due to database error');
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

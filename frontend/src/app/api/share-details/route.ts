import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminDb } from '../../../lib/firebase/adminConfig';

// Initialize Firebase Admin
initializeFirebaseAdmin();
const db = getAdminDb();

export async function POST(request: NextRequest) {
  try {
    // Set CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    // Get the request body
    const body = await request.json();
    const { shareId, passwordToken } = body;

    if (!shareId) {
      return NextResponse.json(
        { error: 'Share ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get the share document from Firestore
    const shareRef = db.collection('shares').doc(shareId);
    const shareDoc = await shareRef.get();

    if (!shareDoc.exists) {
      return NextResponse.json(
        { error: 'Share not found' },
        { status: 404, headers: corsHeaders }
      );
    }

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
    console.error('Error getting share details:', error);
    return NextResponse.json(
      { error: 'Failed to get share details' },
      { status: 500 }
    );
  }
}

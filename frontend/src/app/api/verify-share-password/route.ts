import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin, getAdminDb } from '../../../lib/firebase/adminConfig';
import { randomBytes } from 'crypto';

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
    const { shareId, password } = body;

    if (!shareId || !password) {
      return NextResponse.json(
        { error: 'Share ID and password are required' },
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
    console.error('Error verifying share password:', error);
    return NextResponse.json(
      { error: 'Failed to verify password' },
      { status: 500 }
    );
  }
}

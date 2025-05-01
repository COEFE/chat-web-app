import { NextResponse, NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig'; 

/**
 * Debug endpoint to generate a test token for API testing
 * IMPORTANT: This should be removed in production
 */
export async function POST(request: NextRequest) {
  try {
    // Use test user or create a token for testing
    const auth = getAdminAuth();
    const testUid = 'test-user-123';
    
    // Create a custom token for testing
    const customToken = await auth.createCustomToken(testUid);
    
    return NextResponse.json({ 
      token: customToken,
      message: 'WARNING: Test token created. This endpoint should be disabled in production.'
    });
  } catch (error) {
    console.error('Error creating test token:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}

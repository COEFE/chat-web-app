import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';

/**
 * Helper function to authenticate a request using Firebase Auth
 * Follows the same pattern as the chat API route
 * @param req The Next.js request object
 * @returns Object with userId if authenticated, or null with error response if not
 */
export async function authenticateRequest(req: NextRequest | Request) {
  const authorizationHeader = req.headers.get("Authorization");
  
  // If no auth header, return error
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.error('[Auth] Missing or invalid Authorization header');
    return { 
      userId: null,
      error: NextResponse.json(
        { error: "Unauthorized: Missing or invalid Authorization header" }, 
        { status: 401 }
      )
    };
  }
  
  try {
    // Get Firebase auth service
    const auth = getAdminAuth();
    
    // Verify token
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    
    console.log("[Auth] User authenticated:", userId);
    return { userId, error: null };
  } catch (error) {
    console.error("[Auth] Authentication error:", error);
    
    // Detailed error logging
    if (error instanceof Error) {
      const authErrorMessage = error.message;
      if (error.stack) {
        console.error(`[Auth] Error Stack: ${error.stack}`);
      }
      console.error(`[Auth] Error Message: ${authErrorMessage}`);
    } else {
      console.error('[Auth] Non-standard error object received during authentication');
    }
    
    return { 
      userId: null,
      error: NextResponse.json(
        { error: "Unauthorized: Invalid token" }, 
        { status: 401 }
      )
    };
  }
}

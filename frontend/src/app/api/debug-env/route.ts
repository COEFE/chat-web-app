import { NextRequest, NextResponse } from 'next/server';

// Set up CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function GET(request: NextRequest) {
  try {
    // Get environment information
    const environment = process.env.VERCEL === '1' ? 'Vercel' : 'Local';
    
    // Check for Firebase environment variables
    const envVars = {
      environment,
      hasFirebaseProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasFirebaseStorageBucket: !!process.env.FIREBASE_STORAGE_BUCKET,
      hasFirebaseServiceAccountKey: !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
      hasNextPublicFirebaseProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      hasNextPublicFirebaseStorageBucket: !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      // Include the actual values of public variables (never include private keys!)
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };

    return NextResponse.json(
      { 
        status: 'success',
        message: 'Environment diagnostic information',
        data: envVars
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('[debug-env] Error getting environment information:', error);
    return NextResponse.json(
      { error: 'Failed to get environment information' },
      { status: 500, headers: corsHeaders }
    );
  }
}

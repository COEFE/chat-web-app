import { NextRequest, NextResponse } from 'next/server';

// Handle Firebase Auth's iframe requests
export async function GET(request: NextRequest) {
  // Capture any Firebase Auth iframe requests
  if (request.nextUrl.pathname.includes('/__/auth/iframe')) {
    // Firebase needs this endpoint for authentication to work
    // Create an empty response with the appropriate headers
    return new NextResponse('', {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // For other authentication paths, return a proper explanation
  return NextResponse.json(
    {
      message: 'Firebase authentication API route',
    },
    { status: 200 }
  );
}

// Handle POST requests to auth endpoints
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      message: 'Firebase authentication API route',
    },
    { status: 200 }
  );
}

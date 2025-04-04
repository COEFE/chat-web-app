import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Capture Firebase Auth iframe requests
  if (request.nextUrl.pathname.includes('/__/auth/iframe')) {
    // Create a response with appropriate headers
    return new NextResponse('', {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  // For all other requests, continue normally
  return NextResponse.next();
}

// Configure middleware to run on specific paths
export const config = {
  matcher: [
    // Match all Firebase authentication paths
    '/__/auth/:path*',
  ],
};

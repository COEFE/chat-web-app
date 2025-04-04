'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This is a catch-all route handler for Firebase Authentication paths
export default function FirebaseAuthPage() {
  const router = useRouter();

  useEffect(() => {
    // If this page is loaded directly, redirect to login
    if (window.opener === null) {
      router.push('/login');
    }
  }, [router]);

  // Return an empty page that Firebase auth can use
  return (
    <html>
      <head>
        <title>Authentication</title>
      </head>
      <body>
        <div id="firebase-auth-container">
          {/* This div is used by Firebase Auth */}
        </div>
      </body>
    </html>
  );
}

'use client'; // This component needs to interact with the browser for Firebase Auth

import React, { useEffect, useState } from 'react'; // Import useEffect
import { useRouter } from 'next/navigation'; // Import useRouter for navigation
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebaseConfig'; // Import the initialized auth instance
import { Button } from '@/components/ui/button'; // Using Shadcn Button
import { useAuth } from '@/context/AuthContext'; // Import the useAuth hook

export default function LoginPage() {
  const router = useRouter(); // Initialize the router hook
  const { user, loading } = useAuth(); // Get user and loading state
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If loading is finished and user *is* logged in, redirect to dashboard
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]); // Dependencies for the effect

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      // This gives you a Google Access Token. You can use it to access the Google API.
      // const credential = GoogleAuthProvider.credentialFromResult(result);
      // const token = credential?.accessToken;
      // The signed-in user info.
      const user = result.user;
      console.log('Signed in user:', user);

      // Redirect user to dashboard after successful login
      router.push('/dashboard');

    } catch (error: unknown) {
      // Handle Errors here.
      let errorCode = 'unknown';
      let errorMessage = 'An unknown error occurred during sign-in.';
      let email = undefined;
      let credential = undefined;

      if (typeof error === 'object' && error !== null) {
        errorCode = (error as any).code || errorCode; // Attempt to get Firebase error code
        errorMessage = (error as any).message || errorMessage; // Attempt to get error message
        email = (error as any).customData?.email; // Attempt to get email
        try {
          credential = GoogleAuthProvider.credentialFromError(error as any);
        } catch (e) {
          // Ignore if it's not a Google Auth error
        }
      }
      console.error('Google Sign-In Error:', errorCode, errorMessage, email, credential);
      setError(errorMessage); // Display error message to the user
    }
  };

  // Don't render the login form if we are loading or already logged in (and about to redirect)
  if (loading || user) {
    // Optional: Add a better loading indicator
    return <div>Loading...</div>;
  }

  // Render login form only if not loading and not logged in
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-8 bg-white rounded shadow-md w-full max-w-xs text-center">
        <h1 className="text-2xl font-bold mb-6">Login</h1>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <Button onClick={handleGoogleSignIn} className="w-full">
          Sign in with Google
        </Button>
        {/* TODO: Add other login methods if needed (e.g., Email/Password) */}
      </div>
    </div>
  );
}

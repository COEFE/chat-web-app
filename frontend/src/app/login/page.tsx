'use client'; // This component needs to interact with the browser for Firebase Auth

import React, { useEffect } from 'react'; // Import useEffect
import { useRouter } from 'next/navigation'; // Import useRouter for navigation
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '@/lib/firebaseConfig'; // Import the initialized auth instance
import { Button } from '@/components/ui/button'; // Using Shadcn Button
import { useAuth } from '@/context/AuthContext'; // Import the useAuth hook

export default function LoginPage() {
  const router = useRouter(); // Initialize the router hook
  const { user, loading } = useAuth(); // Get user and loading state

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

    } catch (error: any) {
      // Handle Errors here.
      const errorCode = error.code;
      const errorMessage = error.message;
      // The email of the user's account used.
      const email = error.customData?.email;
      // The AuthCredential type that was used.
      const credential = GoogleAuthProvider.credentialFromError(error);
      console.error('Google Sign-In Error:', errorCode, errorMessage, email, credential);
      // TODO: Display error message to the user
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
        <Button onClick={handleGoogleSignIn} className="w-full">
          Sign in with Google
        </Button>
        {/* TODO: Add other login methods if needed (e.g., Email/Password) */}
      </div>
    </div>
  );
}

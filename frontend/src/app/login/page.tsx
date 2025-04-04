'use client'; // This component needs to interact with the browser for Firebase Auth

import React, { useEffect, useState } from 'react'; // Import useEffect
import { useRouter } from 'next/navigation'; // Import useRouter for navigation
import { signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { createEnhancedGoogleProvider } from '@/lib/firebaseAuthProvider';
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

  // Check for redirect results on page load
  useEffect(() => {
    const checkRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result) {
          // User successfully authenticated
          console.log('Signed in user from redirect:', result.user);
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Redirect sign-in error:', error);
        setError(`${(error as any)?.code || 'unknown'}: ${(error as any)?.message || 'Unknown error'}`);
      }
    };
    
    checkRedirectResult();
  }, [router]);

  const handleGoogleSignIn = () => {
    const provider = createEnhancedGoogleProvider();
    // Using redirect method instead of popup to avoid domain issues
    signInWithRedirect(auth, provider).catch(error => {
      console.error('Error starting redirect:', error);
      
      // Enhanced error logging
      if (error?.code === 'auth/unauthorized-domain') {
        console.error('Unauthorized Domain Error Details:', {
          currentDomain: window.location.hostname,
          fullUrl: window.location.href,
          errorDetail: error
        });
      }
      
      setError(`${error?.code || 'unknown'}: ${error?.message || 'Unknown error'}`);
    });
  };

  // Don't render the login form if we are loading or already logged in (and about to redirect)
  if (loading || user) {
    // Optional: Add a better loading indicator
    return <div>Loading...</div>;
  }

  // Render login form only if not loading and not logged in
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <div className="w-full max-w-md p-8 space-y-8 rounded-xl shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome</h1>
          <p className="mt-2 text-gray-600">Sign in to your account</p>
        </div>
        
        {error && (
          <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg">
            {error}
          </div>
        )}
        
        <Button 
          onClick={handleGoogleSignIn}
          className="w-full flex items-center justify-center"
        >
          Sign in with Google
        </Button>
        {/* TODO: Add other login methods if needed (e.g., Email/Password) */}
      </div>
    </div>
  );
}

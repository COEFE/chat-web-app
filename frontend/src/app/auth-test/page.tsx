'use client';

import React, { useState, useEffect } from 'react';
import { auth } from '@/lib/firebaseConfig';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';
import { Button } from '@/components/ui/button';

export default function AuthTestPage() {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [authDomain, setAuthDomain] = useState<string>('');
  const [currentDomain, setCurrentDomain] = useState<string>('');
  
  useEffect(() => {
    // Check environment info
    if (typeof window !== 'undefined') {
      setCurrentDomain(window.location.hostname);
      setAuthDomain(auth.config.authDomain || 'unknown');
      
      // Check for redirect results
      const checkRedirectResult = async () => {
        try {
          const result = await getRedirectResult(auth);
          if (result) {
            setTestResults(prev => [...prev, { 
              type: 'redirect_result', 
              success: true, 
              user: result.user.email, 
              timestamp: new Date().toISOString() 
            }]);
          }
        } catch (err) {
          setError(`Redirect result error: ${(err as any)?.code || 'unknown'}`);
          console.error('Redirect error:', err);
          setTestResults(prev => [...prev, { 
            type: 'redirect_result', 
            success: false, 
            error: (err as any)?.code || 'unknown', 
            timestamp: new Date().toISOString() 
          }]);
        }
      };
      
      checkRedirectResult();
    }
  }, []);
  
  const testPopupSignIn = async () => {
    try {
      setTestResults(prev => [...prev, { 
        type: 'popup_attempt',
        timestamp: new Date().toISOString() 
      }]);
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      const result = await signInWithPopup(auth, provider);
      setTestResults(prev => [...prev, { 
        type: 'popup_success', 
        user: result.user.email,
        timestamp: new Date().toISOString() 
      }]);
      setError(null);
    } catch (err) {
      console.error('Popup sign-in error:', err);
      setError(`Popup error: ${(err as any)?.code || 'unknown'}`);
      setTestResults(prev => [...prev, { 
        type: 'popup_error', 
        error: (err as any)?.code || 'unknown',
        fullError: JSON.stringify(err, null, 2),
        timestamp: new Date().toISOString() 
      }]);
    }
  };
  
  const testRedirectSignIn = async () => {
    try {
      setTestResults(prev => [...prev, { 
        type: 'redirect_attempt',
        timestamp: new Date().toISOString() 
      }]);
      
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      
      await signInWithRedirect(auth, provider);
      // Note: Result will be handled in the useEffect when the page reloads
    } catch (err) {
      console.error('Redirect sign-in error:', err);
      setError(`Redirect error: ${(err as any)?.code || 'unknown'}`);
      setTestResults(prev => [...prev, { 
        type: 'redirect_error', 
        error: (err as any)?.code || 'unknown',
        fullError: JSON.stringify(err, null, 2),
        timestamp: new Date().toISOString() 
      }]);
    }
  };
  
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Firebase Authentication Test</h1>
      
      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="font-semibold mb-2">Environment Information</h2>
        <p><strong>Current Domain:</strong> {currentDomain}</p>
        <p><strong>Auth Domain:</strong> {authDomain}</p>
        <p><strong>Firebase API Key:</strong> {process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.substring(0, 8)}...</p>
      </div>
      
      <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2 mb-6">
        <Button onClick={testPopupSignIn} variant="default">
          Test Popup Sign-In
        </Button>
        
        <Button onClick={testRedirectSignIn} variant="outline">
          Test Redirect Sign-In
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{error}</p>
        </div>
      )}
      
      <div className="mt-4">
        <h2 className="font-semibold mb-2">Test Results (newest first)</h2>
        <div className="bg-gray-50 p-4 rounded-lg overflow-auto max-h-96">
          {testResults.length === 0 ? (
            <p className="text-gray-500">No tests run yet</p>
          ) : (
            <pre className="text-xs whitespace-pre-wrap">
              {testResults.slice().reverse().map((result, i) => (
                <div key={i} className="mb-2 pb-2 border-b">
                  {JSON.stringify(result, null, 2)}
                </div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { auth } from '@/lib/firebaseConfig';
import { createEnhancedGoogleProvider } from '@/lib/firebaseAuthProvider';
import { signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';

/**
 * Debug component for testing Firebase Authentication
 * Shows detailed information about the current domain and authentication state
 */
export function LoginDebugger() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testLogin = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      // Log environment info
      const domainInfo = {
        hostname: window.location.hostname,
        protocol: window.location.protocol,
        fullUrl: window.location.href,
        configuredAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      };
      
      console.log('Domain information:', domainInfo);
      
      // Try authentication
      const provider = createEnhancedGoogleProvider();
      const authResult = await signInWithPopup(auth, provider);
      
      setResult({
        success: true,
        user: {
          uid: authResult.user.uid,
          email: authResult.user.email,
          displayName: authResult.user.displayName,
        },
        domain: domainInfo
      });
    } catch (err: any) {
      console.error('Login test error:', err);
      
      setError({
        code: err.code || 'unknown',
        message: err.message || 'Unknown error',
        fullError: err
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-lg shadow-sm">
      <h2 className="text-xl font-bold mb-4">Firebase Login Debugger</h2>
      
      <div className="mb-4">
        <div className="text-sm text-gray-600 mb-2">Current Environment:</div>
        <div className="bg-gray-100 p-2 rounded">
          <div><strong>Domain:</strong> {typeof window !== 'undefined' ? window.location.hostname : 'Server-side'}</div>
          <div><strong>Full URL:</strong> {typeof window !== 'undefined' ? window.location.href : 'Server-side'}</div>
          <div><strong>Configured Auth Domain:</strong> {process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'Not set'}</div>
        </div>
      </div>
      
      <Button 
        onClick={testLogin} 
        disabled={loading}
        className="mb-4"
      >
        {loading ? 'Testing...' : 'Test Firebase Login'}
      </Button>
      
      {result && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
          <h3 className="font-bold text-green-700">Login Success!</h3>
          <pre className="text-xs mt-2 overflow-auto max-h-40">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
          <h3 className="font-bold text-red-700">Login Error</h3>
          <div className="font-medium">Error Code: {error.code}</div>
          <div className="text-sm mb-2">{error.message}</div>
          <details>
            <summary className="text-xs cursor-pointer">View full error details</summary>
            <pre className="text-xs mt-2 overflow-auto max-h-40">
              {JSON.stringify(error, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

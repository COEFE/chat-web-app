'use client';

import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';

/**
 * Simple page to fix the user_id in bill_credits table
 * This calls the API endpoint to update bill credits with user_id = '0'
 */
// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
let app;
if (typeof window !== 'undefined' && !getApps().length) {
  app = initializeApp(firebaseConfig);
}

export default function FixBillCreditUserIdPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFixing, setIsFixing] = useState(false);
  
  // Initialize auth
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);

  const fixBillCreditUserId = async () => {
    if (!user) {
      setError('You must be logged in to fix bill credit user IDs');
      return;
    }

    setIsFixing(true);
    setError(null);
    
    try {
      const auth = getAuth();
      const token = await user.getIdToken();
      
      const response = await fetch('/api/fix-bill-credit-user-id', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      setResult(data);
      
      if (!data.success) {
        setError(data.error || 'An unknown error occurred');
      }
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred');
    } finally {
      setIsFixing(false);
    }
  };

  // Auto-fix when the page loads and user is authenticated
  useEffect(() => {
    if (user && !loading && !result && !isFixing) {
      fixBillCreditUserId();
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Fix Bill Credit User IDs</h1>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Fix Bill Credit User IDs</h1>
        <p className="text-red-500">You must be logged in to fix bill credit user IDs</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Fix Bill Credit User IDs</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
        </div>
      )}
      
      {result && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          <p>{result.message}</p>
          {result.updatedIds && result.updatedIds.length > 0 && (
            <div className="mt-2">
              <p>Updated bill credit IDs:</p>
              <ul className="list-disc list-inside">
                {result.updatedIds.map((id: number) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      
      <button
        onClick={fixBillCreditUserId}
        disabled={isFixing}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
      >
        {isFixing ? 'Fixing...' : 'Fix Bill Credit User IDs'}
      </button>
    </div>
  );
}

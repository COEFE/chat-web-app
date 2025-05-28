"use client";

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';

export default function AuthDebugPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string>('');
  const [apiTest, setApiTest] = useState<string>('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
      
      if (user) {
        try {
          const idToken = await user.getIdToken();
          setToken(idToken.substring(0, 50) + '...');
        } catch (error) {
          console.error('Error getting token:', error);
          setToken('Error getting token');
        }
      } else {
        setToken('');
      }
    });

    return () => unsubscribe();
  }, []);

  const testDbSetup = async () => {
    if (!user) {
      setApiTest('No user logged in');
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/accounts/db-setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setApiTest(`Status: ${response.status}, Response: ${JSON.stringify(data, null, 2)}`);
    } catch (error) {
      setApiTest(`Error: ${error}`);
    }
  };

  const testAccountsAPI = async () => {
    if (!user) {
      setApiTest('No user logged in');
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/accounts', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      setApiTest(`Status: ${response.status}, Accounts: ${data.accounts?.length || 0}`);
    } catch (error) {
      setApiTest(`Error: ${error}`);
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Authentication Debug</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded">
          <h2 className="text-lg font-semibold mb-2">User Status</h2>
          {user ? (
            <div>
              <p><strong>Logged in as:</strong> {user.email || 'Anonymous'}</p>
              <p><strong>UID:</strong> {user.uid}</p>
              <p><strong>Token (first 50 chars):</strong> {token}</p>
            </div>
          ) : (
            <p>Not logged in</p>
          )}
        </div>

        <div className="p-4 border rounded">
          <h2 className="text-lg font-semibold mb-2">Actions</h2>
          <div className="space-x-2">
            {!user ? (
              <button 
                onClick={() => signInAnonymously(auth)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Sign In Anonymously
              </button>
            ) : (
              <button 
                onClick={() => signOut(auth)}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        <div className="p-4 border rounded">
          <h2 className="text-lg font-semibold mb-2">API Tests</h2>
          <div className="space-x-2 mb-4">
            <button 
              onClick={testDbSetup}
              disabled={!user}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
            >
              Test DB Setup
            </button>
            <button 
              onClick={testAccountsAPI}
              disabled={!user}
              className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:bg-gray-400"
            >
              Test Accounts API
            </button>
          </div>
          {apiTest && (
            <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
              {apiTest}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

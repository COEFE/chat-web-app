'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';

export default function CreateBillRefundsButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const runMigration = async () => {
    setIsRunning(true);
    setResult(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();

      const response = await fetch('/api/db-migrations/create-bill-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        setResult(`✅ Success: ${data.message}`);
      } else {
        setResult(`❌ Error: ${data.error}`);
      }
    } catch (error: any) {
      setResult(`❌ Error: ${error.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        onClick={runMigration}
        disabled={isRunning}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {isRunning ? 'Creating bill_refunds table...' : 'Create bill_refunds Table'}
      </button>
      
      {result && (
        <div className="p-4 rounded border bg-gray-50">
          <pre className="text-sm whitespace-pre-wrap">{result}</pre>
        </div>
      )}
    </div>
  );
}

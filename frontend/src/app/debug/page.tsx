'use client';

import React from 'react';
import { LoginDebugger } from '@/components/debug/LoginDebugger';

export default function DebugPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Authentication Debug Tools</h1>
      <p className="mb-6">Use these tools to diagnose authentication issues in development and production.</p>
      
      <div className="mt-6">
        <LoginDebugger />
      </div>

      <div className="mt-8 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
        <h2 className="font-semibold text-yellow-800">Troubleshooting Checklist</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-yellow-700">
          <li>Verify Firebase authorized domains include your Vercel domain (<code>chat-web-app-mu.vercel.app</code>)</li>
          <li>Check Google Cloud OAuth credentials for properly configured JavaScript origins</li>
          <li>Ensure API keys have proper HTTP referrer restrictions</li>
          <li>Confirm environment variables are correctly set in Vercel deployment</li>
        </ul>
      </div>
    </div>
  );
}

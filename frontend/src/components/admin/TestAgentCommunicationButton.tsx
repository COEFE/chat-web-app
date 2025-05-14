"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Button component to test AP and GL agent communication
 * This component provides a simple UI to test the agent communication system
 */
export default function TestAgentCommunicationButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Run the agent communication test
   */
  const runTest = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      // Get the current user and ID token from Firebase
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setError('No authenticated user found. Please log in again.');
        setIsLoading(false);
        return;
      }
      
      // Get the ID token
      const idToken = await user.getIdToken(true);

      // Make the API request with the authorization header
      const response = await fetch('/api/tests/agent-communication', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const data = await response.json();

      if (data.success) {
        setResult(data.message);
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run the test');
      console.error('Error running agent communication test:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Test Agent Communication</CardTitle>
        <CardDescription>
          Test the communication between the AP agent and GL agent for account creation requests.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button 
            onClick={runTest} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Test...
              </>
            ) : (
              'Run AP-GL Communication Test'
            )}
          </Button>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <AlertTitle>Test Result</AlertTitle>
              <AlertDescription className="mt-2">
                {result}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="mt-2">
                {error}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

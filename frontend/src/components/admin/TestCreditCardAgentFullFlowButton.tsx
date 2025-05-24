"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

/**
 * Button component to test Credit Card Agent full flow functionality.
 */
export default function TestCreditCardAgentFullFlowButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string[]>([]);

  const addToLog = (message: string) => {
    setTestLog((prevLog) => [...prevLog, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runCreditCardAgentFullFlowTest = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    setTestLog([]); // Clear previous logs
    addToLog('Starting Credit Card Agent full flow test...');

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        setError('No authenticated user found. Please log in again.');
        addToLog('Error: No authenticated user found.');
        setIsLoading(false);
        return;
      }

      const idToken = await user.getIdToken(true);
      addToLog('User authenticated, proceeding with test.');

      const response = await fetch('/api/tests/credit-card-agent-full-flow-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        // No body needed as test data will be predefined on the backend
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data.message || 'Test completed successfully.');
        addToLog(`Success: ${data.message || 'Test completed successfully.'}`);
        if (data.details) {
          addToLog(`Details: ${JSON.stringify(data.details, null, 2)}`);
        }
        // Add verification log to the test log if available
        if (data.verificationLog && Array.isArray(data.verificationLog)) {
          addToLog('--- Detailed Verification Log ---');
          data.verificationLog.forEach((logEntry: string) => {
            addToLog(logEntry);
          });
        }
      } else {
        setError(data.error || 'Test failed.');
        addToLog(`Error: ${data.error || 'Test failed.'}`);
        if (data.details) {
          addToLog(`Details: ${JSON.stringify(data.details, null, 2)}`);
        }
        // Add verification log to the test log if available even on error
        if (data.verificationLog && Array.isArray(data.verificationLog)) {
          addToLog('--- Detailed Verification Log ---');
          data.verificationLog.forEach((logEntry: string) => {
            addToLog(logEntry);
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(errorMessage);
      addToLog(`Critical Error: ${errorMessage}`);
      console.error('Error running Credit Card Agent full flow test:', err);
    } finally {
      setIsLoading(false);
      addToLog('Test finished.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Credit Card Agent Full Flow</CardTitle>
        <CardDescription>
          This test verifies the entire Credit Card Agent flow from PDF extraction to bill and journal entry creation,
          ensuring that transactions are properly processed, bills are created, and journal entries are recorded.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runCreditCardAgentFullFlowTest} disabled={isLoading}>
          {isLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Full Flow Test...</>
          ) : (
            'Run Full Flow Test'
          )}
        </Button>

        {result && (
          <Alert variant="default">
            <AlertTitle>Test Successful</AlertTitle>
            <AlertDescription>{result}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Test Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testLog.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Test Log:</h4>
            <Textarea
              readOnly
              value={testLog.join('\n')}
              className="h-48 w-full rounded-md border bg-muted p-2 text-sm"
              aria-label="Test execution log"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

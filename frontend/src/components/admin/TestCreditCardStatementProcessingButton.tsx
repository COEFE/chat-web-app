"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Button component to test Credit Card Statement Processing with detailed diagnostics.
 */
export default function TestCreditCardStatementProcessingButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [creditCardName, setCreditCardName] = useState<string>("American Express 2009");
  const [expenseAccountName, setExpenseAccountName] = useState<string>("Miscellaneous Expense");

  const addToLog = (message: string) => {
    setTestLog((prevLog) => [...prevLog, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runCreditCardStatementProcessingTest = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    setTestLog([]); // Clear previous logs
    addToLog('Starting Credit Card Statement Processing diagnostic test...');

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

      // Step 1: Check if the accounts exist
      addToLog('Step 1: Checking if specified accounts exist...');
      const checkAccountsResponse = await fetch('/api/tests/check-accounts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creditCardAccountName: creditCardName,
          expenseAccountName: expenseAccountName
        })
      });

      const accountsData = await checkAccountsResponse.json();
      
      if (checkAccountsResponse.ok) {
        addToLog(`Credit Card Account "${creditCardName}" exists: ${accountsData.creditCardAccount.exists}`);
        if (accountsData.creditCardAccount.exists) {
          addToLog(`Credit Card Account ID: ${accountsData.creditCardAccount.id}`);
        }
        
        addToLog(`Expense Account "${expenseAccountName}" exists: ${accountsData.expenseAccount.exists}`);
        if (accountsData.expenseAccount.exists) {
          addToLog(`Expense Account ID: ${accountsData.expenseAccount.id}`);
        }
      } else {
        addToLog(`Error checking accounts: ${accountsData.message || 'Unknown error'}`);
      }

      // Step 2: Run the full flow test
      addToLog('Step 2: Running Credit Card Agent full flow test...');
      const response = await fetch('/api/tests/credit-card-agent-full-flow-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creditCardAccountName: creditCardName,
          expenseAccountName: expenseAccountName,
          debug: true // Request detailed debug information
        })
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
      console.error('Error running Credit Card Statement Processing test:', err);
    } finally {
      setIsLoading(false);
      addToLog('Test finished.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Credit Card Statement Processing</CardTitle>
        <CardDescription>
          This diagnostic test helps identify issues with credit card statement processing by checking account existence
          and running the full flow test with detailed logging.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="creditCardName">Credit Card Account Name</Label>
              <Input 
                id="creditCardName" 
                value={creditCardName} 
                onChange={(e) => setCreditCardName(e.target.value)}
                placeholder="e.g., American Express 2009" 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseAccountName">Expense Account Name</Label>
              <Input 
                id="expenseAccountName" 
                value={expenseAccountName} 
                onChange={(e) => setExpenseAccountName(e.target.value)}
                placeholder="e.g., Miscellaneous Expense" 
              />
            </div>
          </div>
        </div>

        <Button onClick={runCreditCardStatementProcessingTest} disabled={isLoading}>
          {isLoading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running Diagnostic Test...</>
          ) : (
            'Run Diagnostic Test'
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
            <h4 className="font-medium">Diagnostic Log:</h4>
            <Textarea
              readOnly
              value={testLog.join('\n')}
              className="h-64 w-full rounded-md border bg-muted p-2 text-sm font-mono"
              aria-label="Test execution log"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

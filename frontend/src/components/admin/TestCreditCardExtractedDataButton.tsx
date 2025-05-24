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
 * Button component to test Credit Card Agent extracted data transfer functionality.
 */
export default function TestCreditCardExtractedDataButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testLog, setTestLog] = useState<string[]>([]);
  const [creditCardAccountName, setCreditCardAccountName] = useState('American Express 2009');

  const addToLog = (message: string) => {
    setTestLog((prevLog) => [...prevLog, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runCreditCardExtractedDataTest = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    setTestLog([]); // Clear previous logs
    addToLog('Starting Credit Card Agent extracted data transfer test...');

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

      // Create test data with sample transactions and statement info
      const testData = {
        creditCardAccountName,
        debug: true,
        testExtractedData: {
          statementInfo: {
            creditCardIssuer: 'American Express',
            lastFourDigits: '2009',
            statementNumber: 'XXXX-XXXXX1-92009',
            statementDate: '2025-05-21',
            balance: 540.82,
            dueDate: '2025-06-10',
            minimumPayment: 25.00,
            transactions: [
              {
                date: '2025-05-15',
                description: 'PAYMENT RECEIVED - THANK YOU',
                amount: -2076.94
              },
              {
                date: '2025-05-02',
                description: 'AMAZON MKTPLACE PMTS AMZN.COM/BILL WA',
                amount: 148.88,
                category: 'Office Supplies'
              },
              {
                date: '2025-05-10',
                description: 'STARBUCKS COFFEE #12345',
                amount: 15.75,
                category: 'Business Meals'
              }
            ]
          }
        }
      };

      addToLog(`Using test data: ${JSON.stringify(testData, null, 2)}`);

      const response = await fetch('/api/tests/credit-card-extracted-data-test', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(testData)
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
      console.error('Error running Credit Card Agent extracted data test:', err);
    } finally {
      setIsLoading(false);
      addToLog('Test finished.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test Credit Card Extracted Data Transfer</CardTitle>
        <CardDescription>
          This test verifies that extracted statement data is properly transferred to the Credit Card Agent
          and used for transaction processing. It simulates the flow of data from PDF extraction to transaction processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="creditCardAccountName">Credit Card Account Name</Label>
          <Input
            id="creditCardAccountName"
            value={creditCardAccountName}
            onChange={(e) => setCreditCardAccountName(e.target.value)}
            placeholder="Enter credit card account name"
          />
          <p className="text-sm text-muted-foreground">
            This is the name of the credit card account to use for the test. If the account doesn't exist,
            it will be created automatically.
          </p>
        </div>

        <Button 
          onClick={runCreditCardExtractedDataTest} 
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running Test...
            </>
          ) : (
            'Run Extracted Data Transfer Test'
          )}
        </Button>

        {result && (
          <Alert className="mt-4" variant="default">
            <AlertTitle>Test Result</AlertTitle>
            <AlertDescription>{result}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="mt-4" variant="destructive">
            <AlertTitle>Test Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testLog.length > 0 && (
          <div className="mt-4">
            <h3 className="text-lg font-medium mb-2">Test Log</h3>
            <Textarea
              className="font-mono text-xs h-64"
              readOnly
              value={testLog.join('\n')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

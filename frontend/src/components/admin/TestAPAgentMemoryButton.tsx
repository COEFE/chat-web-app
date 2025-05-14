"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Button component to test AP Agent Memory System
 * This component provides a UI to test the statement processing and account memory functionality
 */
export default function TestAPAgentMemoryButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statementNumber, setStatementNumber] = useState<string>('');
  const [accountName, setAccountName] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [balance, setBalance] = useState<string>('');
  const [testLog, setTestLog] = useState<string[]>([]);

  /**
   * Run the statement processing test
   */
  const processStatement = async () => {
    if (!statementNumber || !accountName) {
      setError('Statement number and account name are required');
      return;
    }

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

      // Add to test log
      addToLog(`Processing statement ${statementNumber} for account ${accountName}`);

      // Make the API request with the authorization header
      const response = await fetch('/api/statements/process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statementNumber,
          accountName,
          statementDate,
          balance: balance ? parseFloat(balance) : undefined,
          isStartingBalance: false
        })
      });
      
      const data = await response.json();

      if (response.ok) {
        setResult(data.message || 'Statement processed successfully');
        addToLog(`Success: ${data.message || 'Statement processed successfully'}`);
      } else if (response.status === 404 && data.needsAccountCreation) {
        // Account needs to be created
        addToLog(`Account not found. Creating account: ${accountName}`);
        
        // Create the account
        const createAccountResponse = await fetch('/api/accounts', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: accountName,
            code: `A${Math.floor(1000 + Math.random() * 9000)}`, // Generate a random account code
            account_type: 'ASSET',
            is_bank_account: true
          })
        });
        
        const accountData = await createAccountResponse.json();
        console.log('Account creation response:', accountData);
        
        if (createAccountResponse.ok && accountData.account) {
          // Extract the account ID from the response
          const accountId = accountData.account.id;
          addToLog(`Account created successfully with ID: ${accountId}`);
          
          // Now try processing the statement again with the new account ID
          const retryRequestBody = {
            accountId: accountId,
            statementNumber,
            statementDate,
            balance: balance ? parseFloat(balance) : undefined,
            isStartingBalance: true // Set as starting balance since it's a new account
          };
          
          console.log('Retry request body:', retryRequestBody);
          addToLog(`Retrying with account ID: ${accountId}`);
          
          const retryResponse = await fetch('/api/statements/process', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(retryRequestBody)
          });
          
          const retryData = await retryResponse.json();
          
          if (retryResponse.ok) {
            setResult(`Account created and ${retryData.message || 'statement processed successfully'}`);
            addToLog(`Success: ${retryData.message || 'Statement processed successfully'}`);
          } else {
            setError(retryData.error || 'Failed to process statement after creating account');
            addToLog(`Error: ${retryData.error || 'Failed to process statement after creating account'}`);
          }
        } else {
          setError(accountData.error || 'Failed to create account');
          addToLog(`Error: ${accountData.error || 'Failed to create account'}`);
        }
      } else {
        setError(data.error || 'Failed to process statement');
        addToLog(`Error: ${data.error || 'Failed to process statement'}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to process statement';
      setError(errorMessage);
      addToLog(`Error: ${errorMessage}`);
      console.error('Error processing statement:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Test the AP Agent's ability to recognize a previously processed statement
   */
  const testMemory = async () => {
    if (!statementNumber) {
      setError('Statement number is required');
      return;
    }

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

      // Add to test log
      addToLog(`Testing memory for statement ${statementNumber}`);

      // Make the API request to check statement status
      const response = await fetch('/api/tests/ap-agent-memory', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          statementNumber,
          query: `Can you check if statement ${statementNumber} has been processed before?`
        })
      });
      
      const data = await response.json();

      if (response.ok) {
        setResult(data.message || 'Memory test completed');
        addToLog(`Result: ${data.message || 'Memory test completed'}`);
      } else {
        setError(data.error || 'Failed to test memory');
        addToLog(`Error: ${data.error || 'Failed to test memory'}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to test memory';
      setError(errorMessage);
      addToLog(`Error: ${errorMessage}`);
      console.error('Error testing AP agent memory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Add an entry to the test log
   */
  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setTestLog(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  /**
   * Clear the test log
   */
  const clearLog = () => {
    setTestLog([]);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Test AP Agent Memory System</CardTitle>
        <CardDescription>
          Test the AP Agent's ability to remember and recognize bank and credit card statements.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statementNumber">Statement Number</Label>
              <Input 
                id="statementNumber" 
                value={statementNumber} 
                onChange={(e) => setStatementNumber(e.target.value)}
                placeholder="e.g., STMT-123456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input 
                id="accountName" 
                value={accountName} 
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., Business Checking"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="statementDate">Statement Date</Label>
              <Input 
                id="statementDate" 
                type="date"
                value={statementDate} 
                onChange={(e) => setStatementDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="balance">Balance</Label>
              <Input 
                id="balance" 
                type="number"
                value={balance} 
                onChange={(e) => setBalance(e.target.value)}
                placeholder="e.g., 1000.50"
              />
            </div>
          </div>
          
          <div className="flex gap-4">
            <Button 
              onClick={processStatement} 
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Statement'
              )}
            </Button>
            
            <Button 
              onClick={testMemory} 
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Memory'
              )}
            </Button>
          </div>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <AlertTitle>Result</AlertTitle>
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
          
          <div className="mt-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium">Test Log</h3>
              <Button 
                onClick={clearLog} 
                variant="ghost" 
                size="sm"
                className="h-7 px-2 text-xs"
              >
                Clear Log
              </Button>
            </div>
            <Textarea 
              readOnly 
              value={testLog.join('\n')} 
              className="h-40 font-mono text-xs"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

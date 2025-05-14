"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Button component to create the statement trackers table
 */
export default function CreateStatementTrackersButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create the statement trackers table
   */
  const createTable = async () => {
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
      const response = await fetch('/api/db-migrations/create-statement-trackers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const data = await response.json();

      if (data.success) {
        setResult(data.alreadyExists 
          ? 'Statement trackers table already exists.' 
          : 'Statement trackers table created successfully.');
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create statement trackers table');
      console.error('Error creating statement trackers table:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create Statement Trackers Table</CardTitle>
        <CardDescription>
          Create a database table to track processed bank and credit card statements
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            This will create a new database table to track processed bank and credit card statements.
            The AP Agent will use this table to avoid processing the same statement twice and to track
            which accounts have had starting balances set.
          </p>
          
          <Button 
            onClick={createTable} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Table...
              </>
            ) : (
              'Create Statement Trackers Table'
            )}
          </Button>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <AlertTitle>Success</AlertTitle>
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

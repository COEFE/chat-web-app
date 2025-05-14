"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Button component to run database migrations
 * This component provides a UI to run migrations, particularly useful for the statement_trackers table
 */
export default function RunMigrationsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Run the database migrations
   */
  const runMigrations = async () => {
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
      const response = await fetch('/api/admin/run-migrations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();

      if (response.ok) {
        setResult(data.message || 'Migrations completed successfully');
      } else {
        setError(data.error || 'Failed to run migrations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run migrations');
      console.error('Error running migrations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Run Database Migrations</CardTitle>
        <CardDescription>
          Run database migrations to create or update required tables, including the statement_trackers table.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            This will run the necessary migrations to set up the AP Agent Memory System, including:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-500 ml-4 space-y-1">
            <li>Creating the statement_trackers table if it doesn't exist</li>
            <li>Adding required indexes for better performance</li>
            <li>Ensuring the accounts table has the user_id column</li>
          </ul>
          
          <Button 
            onClick={runMigrations} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Migrations...
              </>
            ) : (
              'Run Migrations'
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

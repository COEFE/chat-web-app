'use client';

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function BillCreditsSetupPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const { toast } = useToast();

  const runSetup = async () => {
    setIsLoading(true);
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/accounts-payable/bill-credits-setup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to set up bill credits');
      }
      
      const data = await response.json();
      setSetupComplete(true);
      
      toast({
        title: 'Success',
        description: data.message || 'Bill credits setup completed successfully',
      });
    } catch (error: any) {
      console.error('Error setting up bill credits:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to set up bill credits',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Bill Credits Setup</CardTitle>
          <CardDescription>
            Set up the database tables required for bill credits functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            This will create the necessary database tables for managing vendor credits:
          </p>
          <ul className="list-disc pl-6 mb-6 space-y-1">
            <li>bill_credits - for storing credit header information</li>
            <li>bill_credit_lines - for storing credit line items</li>
          </ul>
          
          {setupComplete ? (
            <div className="bg-green-50 p-4 rounded-md border border-green-200 text-green-800">
              <p className="font-medium">Setup completed successfully!</p>
              <p className="mt-2">You can now use the bill credits functionality.</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.href = '/dashboard/accounts-payable/bill-credits'}
              >
                Go to Bill Credits
              </Button>
            </div>
          ) : (
            <Button 
              onClick={runSetup} 
              disabled={isLoading}
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                'Run Setup'
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

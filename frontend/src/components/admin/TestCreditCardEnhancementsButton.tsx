'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

/**
 * Button component to test the credit card agent enhancements:
 * 1. AI-powered journal type selection
 * 2. Ensuring payment journal entries are posted
 */
export default function TestCreditCardEnhancementsButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/tests/credit-card-enhancements');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to test credit card enhancements');
      }
      
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      console.error('Error testing credit card enhancements:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button 
        onClick={handleTest} 
        disabled={isLoading}
        className="w-full"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing Credit Card Enhancements...
          </>
        ) : (
          'Test Credit Card Enhancements'
        )}
      </Button>
      
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-600">
          {error}
        </div>
      )}
      
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Credit Card Enhancements Test Results</CardTitle>
            <CardDescription>
              Results of testing AI journal type selection and payment journal posting
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Database Update Results */}
              <div>
                <h3 className="text-lg font-medium">Database Update Results</h3>
                <div className="mt-2 space-y-2">
                  <p>
                    <span className="font-medium">Status:</span>{' '}
                    <Badge variant={results.updateResult.success ? 'default' : 'destructive'} 
                           className={results.updateResult.success ? 'bg-green-500' : ''}>
                      {results.updateResult.success ? 'Success' : 'Failed'}
                    </Badge>
                  </p>
                  <p><span className="font-medium">Message:</span> {results.updateResult.message}</p>
                  {results.updateResult.journalsUpdated !== undefined && (
                    <p><span className="font-medium">Journals Updated:</span> {results.updateResult.journalsUpdated}</p>
                  )}
                  {results.updateResult.journalEntriesUpdated !== undefined && (
                    <p><span className="font-medium">Journal Entries Updated:</span> {results.updateResult.journalEntriesUpdated}</p>
                  )}
                </div>
              </div>
              
              {/* AI Journal Type Test Results */}
              <div>
                <h3 className="text-lg font-medium">AI Journal Type Test Results</h3>
                <div className="mt-2 space-y-4">
                  {results.testResults.map((result: any, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-md">
                      <p><span className="font-medium">Transaction:</span> {result.transaction.description}</p>
                      <p><span className="font-medium">Amount:</span> ${result.transaction.amount.toFixed(2)}</p>
                      <p><span className="font-medium">Category:</span> {result.transaction.category}</p>
                      <p>
                        <span className="font-medium">Detected as:</span>{' '}
                        {result.isPayment ? 'Payment' : ''}{result.isPayment && result.isRefund ? ' + ' : ''}{result.isRefund ? 'Refund' : ''}
                        {!result.isPayment && !result.isRefund ? 'Purchase' : ''}
                      </p>
                      <p>
                        <span className="font-medium">Journal Type:</span>{' '}
                        <Badge variant="outline" className="ml-1">
                          {result.journalType}
                        </Badge>
                      </p>
                      <p>
                        <span className="font-medium">Posting Status:</span>{' '}
                        <Badge variant="outline" className="ml-1">
                          {result.would_be_posted ? 'Posted' : 'Draft'}
                        </Badge>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

/**
 * Simple button component to test Credit Card Agent extracted data transfer functionality.
 */
export default function SimpleTestCreditCardExtractedDataButton() {
  const [isLoading, setIsLoading] = useState(false);

  const runCreditCardExtractedDataTest = async () => {
    setIsLoading(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        alert('No authenticated user found. Please log in again.');
        setIsLoading(false);
        return;
      }

      const idToken = await user.getIdToken(true);
      console.log('User authenticated, proceeding with test.');

      // Create test data with sample transactions and statement info
      const testData = {
        creditCardAccountName: 'American Express 2009',
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
        alert(`Test completed successfully: ${data.message || 'Test passed'}`);
      } else {
        alert(`Test failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred.';
      alert(`Critical Error: ${errorMessage}`);
      console.error('Error running Credit Card Agent extracted data test:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
        'Run Credit Card Extracted Data Test'
      )}
    </Button>
  );
}

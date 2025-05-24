/**
 * Test script to verify credit card transactions are properly recorded in the AP module
 * This script directly uses the CreditCardAgent to process a transaction
 */
import { CreditCardAgent } from '../lib/agents/creditCardAgent';
import { CreditCardTransaction } from '../types/creditCard';

async function testCreditCardTransaction() {
  try {
    console.log('Starting credit card transaction test...');
    
    // Create a test transaction
    const testTransaction: CreditCardTransaction = {
      id: 'test-tx-' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      description: 'Test Transaction ' + Date.now(),
      amount: 100.00
    };
    
    console.log(`Created test transaction: ${JSON.stringify(testTransaction, null, 2)}`);
    
    // Create a CreditCardAgent instance
    const creditCardAgent = new CreditCardAgent();
    
    // Create a context with the internal-api user ID
    const context = {
      userId: 'internal-api',
      query: 'Process this credit card transaction',
      conversationId: 'test-script',
      additionalContext: {
        forceTransactionProcessing: true,
        transactions: [testTransaction]
      }
    };
    
    console.log('Calling CreditCardAgent.processRequest...');
    
    // Process the transaction
    const result = await creditCardAgent.processRequest(context);
    
    console.log('Result:', JSON.stringify(result, null, 2));
    
    console.log('Test completed.');
  } catch (error) {
    console.error('Error in test script:', error);
  }
}

// Run the test
testCreditCardTransaction();

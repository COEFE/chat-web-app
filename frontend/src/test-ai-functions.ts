// Simple test script for AI-powered functions
import { identifyExpenseAccountWithAI } from './lib/excelDataProcessor';

async function testAIFunctions() {
  console.log('Testing AI-powered expense account identification...');
  
  try {
    // Test the AI-powered expense account identification
    const accountId = await identifyExpenseAccountWithAI({
      vendorId: 1, // Use a valid vendor ID from your database
      memo: 'Monthly office supplies purchase - paper, pens, and printer ink',
      amount: 245.67
    });
    
    console.log('AI-identified expense account ID:', accountId);
  } catch (error) {
    console.error('Error testing AI functions:', error);
  }
}

// Run the test
testAIFunctions();

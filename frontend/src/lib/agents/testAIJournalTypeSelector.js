// This is a simple test script to verify the AI journal type selection works correctly
// Run with: node testAIJournalTypeSelector.js

require('dotenv').config();
const { determineJournalType } = require('./aiJournalTypeSelector');

// Sample transactions to test
const testTransactions = [
  {
    description: "PAYMENT THANK YOU",
    amount: 500.00,
    date: "2025-05-01",
    category: "Payment"
  },
  {
    description: "Amazon.com Purchase",
    amount: -45.99,
    date: "2025-05-05",
    category: "Shopping"
  },
  {
    description: "REFUND: Best Buy",
    amount: -129.99,
    date: "2025-05-10",
    category: "Refund"
  },
  {
    description: "Target Return Credit",
    amount: 25.49,
    date: "2025-05-15",
    category: "Shopping"
  }
];

// Test each transaction
async function runTests() {
  console.log("Testing AI Journal Type Selector...");
  
  for (const transaction of testTransactions) {
    const isPayment = transaction.amount > 0;
    const isRefund = 
      transaction.description.toLowerCase().includes('refund') || 
      transaction.description.toLowerCase().includes('return') ||
      transaction.description.toLowerCase().includes('credit') ||
      (transaction.category && transaction.category.toLowerCase().includes('refund'));
    
    console.log(`\nTransaction: ${transaction.description}`);
    console.log(`Amount: ${transaction.amount}`);
    console.log(`Category: ${transaction.category}`);
    console.log(`Is Payment: ${isPayment}`);
    console.log(`Is Refund: ${isRefund}`);
    
    try {
      const journalType = await determineJournalType(transaction, isRefund, isPayment);
      console.log(`AI-determined Journal Type: ${journalType}`);
    } catch (error) {
      console.error(`Error determining journal type: ${error.message}`);
    }
  }
}

runTests().catch(console.error);

/**
 * This script integrates both the AI journal type selector and the payment journal posting
 * functionality into the credit card agent.
 * 
 * It performs two main tasks:
 * 1. Updates existing draft payment journal entries to posted status
 * 2. Demonstrates how to use the AI journal type selector with sample transactions
 * 
 * Run with: node integrateCreditCardEnhancements.js
 */

require('dotenv').config();
const { sql } = require('@vercel/postgres');

// Import the updateDraftPaymentJournalsToPosted function
// Note: In a real implementation, you would need to compile the TypeScript files first
// For this demo, we'll implement the function directly
async function updateDraftPaymentJournalsToPosted(userId) {
  try {
    console.log(`Updating draft payment journals to posted for user: ${userId || 'all users'}`);
    
    // First check if the journals table exists and has the is_posted column
    const schemaCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journals') as has_journals_table,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type
    `;
    
    const { has_journals_table, has_is_posted, has_journal_type } = schemaCheck.rows[0];
    
    if (!has_journals_table) {
      console.log("Journals table does not exist");
      return {
        success: false,
        message: "Journals table does not exist"
      };
    }
    
    if (!has_is_posted) {
      console.log("Journals table does not have is_posted column");
      return {
        success: false,
        message: "Journals table does not have is_posted column"
      };
    }
    
    // Update all draft payment journals to posted
    let updateQuery;
    let result;
    
    if (has_journal_type) {
      // If journal_type column exists, update only credit card payment entries
      updateQuery = `
        UPDATE journals 
        SET is_posted = true 
        WHERE ${userId ? 'user_id = $1 AND' : ''} 
        is_posted = false
        AND journal_type = 'CCY'
        AND source = 'cc_agent'
      `;
      result = userId ? await sql.query(updateQuery, [userId]) : await sql.query(updateQuery);
    } else {
      // Otherwise, update all draft entries from the credit card agent
      // that appear to be payment entries (based on description)
      updateQuery = `
        UPDATE journals 
        SET is_posted = true 
        WHERE ${userId ? 'user_id = $1 AND' : ''} 
        is_posted = false
        AND source = 'cc_agent'
        AND (
          memo LIKE '%payment%' 
          OR description LIKE '%payment%'
          OR memo LIKE '%Payment%'
          OR description LIKE '%Payment%'
        )
      `;
      result = userId ? await sql.query(updateQuery, [userId]) : await sql.query(updateQuery);
    }
    
    console.log(`Updated ${result.rowCount} draft payment journals to posted status`);
    
    // Also check journal_entries table if it exists
    const journalEntriesCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_entries'
      ) as has_journal_entries_table
    `;
    
    if (journalEntriesCheck.rows[0].has_journal_entries_table) {
      console.log('Checking journal_entries table...');
      
      const journalEntriesUpdate = `
        UPDATE journal_entries 
        SET status = 'posted' 
        WHERE ${userId ? 'user_id = $1 AND' : ''} 
        status = 'draft'
        AND source = 'credit_card_statement'
        AND (
          description LIKE '%payment%' 
          OR description LIKE '%Payment%'
        )
      `;
      
      const journalEntriesResult = userId 
        ? await sql.query(journalEntriesUpdate, [userId])
        : await sql.query(journalEntriesUpdate);
        
      console.log(`Updated ${journalEntriesResult.rowCount} draft entries in journal_entries table`);
    }
    
    return {
      success: true,
      message: `Updated draft payment journals to posted status`,
      updatedCount: result.rowCount
    };
  } catch (error) {
    console.error("Error updating draft payment journals:", error);
    return {
      success: false,
      message: `Error updating draft payment journals: ${error.message || "Unknown error"}`
    };
  }
}

// Simulate the AI journal type selector for demo purposes
async function determineJournalType(transaction, isRefund, isPayment) {
  console.log(`Analyzing transaction: ${transaction.description}`);
  console.log(`Amount: ${transaction.amount}, Is Refund: ${isRefund}, Is Payment: ${isPayment}`);
  
  // Simple logic to determine journal type (in production, this would call Claude 3.5)
  if (isPayment) {
    return 'CCY'; // Credit Card Payment
  } else if (isRefund) {
    return 'CCR'; // Credit Card Refund
  } else {
    return 'CCP'; // Credit Card Purchase
  }
}

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

// Main function to run the integration
async function runIntegration() {
  console.log("=== CREDIT CARD AGENT ENHANCEMENTS INTEGRATION ===");
  console.log("\n1. Updating draft payment journal entries to posted status...");
  
  try {
    // Update all draft payment journals (for all users)
    const updateResult = await updateDraftPaymentJournalsToPosted();
    console.log(`Result: ${updateResult.message}`);
    
    console.log("\n2. Testing AI journal type selector with sample transactions...");
    
    // Test each transaction
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
        
        // Demonstrate how this would be used in journal entry creation
        console.log(`This would create a journal entry with:`);
        console.log(`- journal_type: ${journalType}`);
        console.log(`- is_posted: true`);
      } catch (error) {
        console.error(`Error determining journal type: ${error.message}`);
      }
    }
    
    console.log("\n=== INTEGRATION COMPLETE ===");
    console.log("\nNext steps:");
    console.log("1. Add your Anthropic API key to .env.local");
    console.log("2. Integrate these enhancements into your credit card agent");
    console.log("3. Test with real transactions");
    
  } catch (error) {
    console.error("Error running integration:", error);
  } finally {
    // Close the database connection
    process.exit(0);
  }
}

// Run the integration
runIntegration().catch(console.error);

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getServerSession } from 'next-auth';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client if API key is available
const anthropic = process.env.ANTHROPIC_API_KEY ? 
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : 
  null;

/**
 * API route to test and integrate credit card agent enhancements:
 * 1. Update draft payment journal entries to posted status
 * 2. Test AI-powered journal type selection
 */
export async function GET(request: Request) {
  try {
    // Get user session for authentication
    // Note: In a real implementation, you would use your auth system
    // For this demo, we'll use a placeholder userId
    const userId = 'test-user-id';
    
    // 1. Update draft payment journal entries to posted status
    const updateResult = await updateDraftPaymentJournalsToPosted(userId);
    
    // 2. Test AI journal type selection with sample transactions
    const testResults = await testAIJournalTypeSelection();
    
    return NextResponse.json({
      success: true,
      updateResult,
      testResults
    });
  } catch (error) {
    console.error('Error in credit card enhancements API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Updates all draft credit card payment journal entries to posted status
 */
async function updateDraftPaymentJournalsToPosted(userId: string) {
  console.log(`Updating draft payment journals to posted for user: ${userId}`);
  
  // First check if the journals table exists and has the is_posted column
  const schemaCheck = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journals') as has_journals_table,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type
  `;
  
  const { has_journals_table, has_is_posted, has_journal_type } = schemaCheck.rows[0];
  
  if (!has_journals_table) {
    return {
      success: false,
      message: "Journals table does not exist"
    };
  }
  
  if (!has_is_posted) {
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
      WHERE user_id = $1 
      AND is_posted = false
      AND journal_type = 'CCY'
      AND source = 'cc_agent'
    `;
    result = await sql.query(updateQuery, [userId]);
  } else {
    // Otherwise, update all draft entries from the credit card agent
    updateQuery = `
      UPDATE journals 
      SET is_posted = true 
      WHERE user_id = $1 
      AND is_posted = false
      AND source = 'cc_agent'
      AND (
        memo LIKE '%payment%' 
        OR description LIKE '%payment%'
        OR memo LIKE '%Payment%'
        OR description LIKE '%Payment%'
      )
    `;
    result = await sql.query(updateQuery, [userId]);
  }
  
  console.log(`Updated ${result.rowCount} draft payment journals to posted status`);
  
  // Also check journal_entries table if it exists
  const journalEntriesCheck = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'journal_entries'
    ) as has_journal_entries_table
  `;
  
  let journalEntriesUpdated = 0;
  
  if (journalEntriesCheck.rows[0].has_journal_entries_table) {
    console.log('Checking journal_entries table...');
    
    const journalEntriesUpdate = `
      UPDATE journal_entries 
      SET status = 'posted' 
      WHERE user_id = $1 
      AND status = 'draft'
      AND source = 'credit_card_statement'
      AND (
        description LIKE '%payment%' 
        OR description LIKE '%Payment%'
      )
    `;
    
    const journalEntriesResult = await sql.query(journalEntriesUpdate, [userId]);
    journalEntriesUpdated = journalEntriesResult.rowCount || 0;
    console.log(`Updated ${journalEntriesUpdated} draft entries in journal_entries table`);
  }
  
  return {
    success: true,
    message: `Updated ${result.rowCount} draft payment journals and ${journalEntriesUpdated} journal entries to posted status`,
    journalsUpdated: result.rowCount,
    journalEntriesUpdated
  };
}

/**
 * Tests the AI journal type selection with sample transactions
 */
async function testAIJournalTypeSelection() {
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
  
  const results = [];
  
  // Test each transaction
  for (const transaction of testTransactions) {
    const isPayment = transaction.amount > 0;
    const isRefund = !!(
      transaction.description.toLowerCase().includes('refund') || 
      transaction.description.toLowerCase().includes('return') ||
      transaction.description.toLowerCase().includes('credit') ||
      (transaction.category && 
       (transaction.category.toLowerCase().includes('refund') || 
        transaction.category.toLowerCase().includes('return')))
    );
    
    try {
      const journalType = await determineJournalType(transaction, isRefund, isPayment);
      
      results.push({
        transaction,
        isPayment,
        isRefund,
        journalType,
        would_be_posted: true
      });
    } catch (error) {
      results.push({
        transaction,
        isPayment,
        isRefund,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  return results;
}

/**
 * Uses Claude 3.5 to intelligently determine the appropriate journal type
 */
async function determineJournalType(
  transaction: any,
  isRefund: boolean = false,
  isPayment: boolean = false
): Promise<string> {
  // Default journal types
  const DEFAULT_PURCHASE_TYPE = 'CCP'; // Credit Card Purchase
  const DEFAULT_PAYMENT_TYPE = 'CCY';  // Credit Card Payment
  const DEFAULT_REFUND_TYPE = 'CCR';   // Credit Card Refund

  // If we don't have an API key or client, return the default types
  if (!anthropic) {
    console.log('No Anthropic API key found, using default journal types');
    if (isPayment) return DEFAULT_PAYMENT_TYPE;
    if (isRefund) return DEFAULT_REFUND_TYPE;
    return DEFAULT_PURCHASE_TYPE;
  }

  try {
    // Prepare transaction data for Claude
    const transactionData = {
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category || 'Unknown',
      isRefund,
      isPayment,
    };

    // Create the prompt for Claude
    const prompt = `
You are an expert accounting AI assistant. Your task is to determine the appropriate journal entry type code for a credit card transaction.

Available journal types:
- CCP: Credit Card Purchase - For recording credit card purchases and expenses
- CCY: Credit Card Payment - For recording payments made to credit card accounts
- CCR: Credit Card Refund - For recording credit card refunds, returns, and chargebacks

Transaction details:
${JSON.stringify(transactionData, null, 2)}

Based on the transaction details, determine the most appropriate journal type code.
Respond with ONLY the journal type code (CCP, CCY, or CCR) and nothing else.
`;

    // Call Claude 3.5 Sonnet
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 10,
      temperature: 0,
      system: "You are an expert accounting AI that determines the appropriate journal entry type for financial transactions. Respond with ONLY the journal type code (CCP, CCY, or CCR) and nothing else.",
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // Extract the journal type from Claude's response
    let journalType = '';
    
    // Handle different response content formats
    if (response.content[0] && 'text' in response.content[0]) {
      journalType = response.content[0].text.trim();
    } else if (response.content[0] && typeof response.content[0] === 'object') {
      // Fallback handling
      const content = response.content[0] as any;
      journalType = content.text || '';
    }
    
    // Validate the response
    if (['CCP', 'CCY', 'CCR'].includes(journalType)) {
      console.log(`Claude determined journal type: ${journalType}`);
      return journalType;
    } else {
      console.log(`Invalid journal type from Claude: ${journalType}, using default`);
      if (isPayment) return DEFAULT_PAYMENT_TYPE;
      if (isRefund) return DEFAULT_REFUND_TYPE;
      return DEFAULT_PURCHASE_TYPE;
    }
  } catch (error) {
    console.error('Error calling Claude:', error);
    // Fallback to default types
    if (isPayment) return DEFAULT_PAYMENT_TYPE;
    if (isRefund) return DEFAULT_REFUND_TYPE;
    return DEFAULT_PURCHASE_TYPE;
  }
}

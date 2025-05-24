/**
 * Credit Card Agent Enhancements
 * 
 * This file combines two key enhancements for the credit card agent:
 * 1. AI-powered journal type selection using Claude 3.5
 * 2. Ensuring payment journal entries are always posted
 * 
 * These enhancements improve the accuracy and reliability of the credit card
 * transaction processing system.
 */

import Anthropic from '@anthropic-ai/sdk';
import { CreditCardTransaction } from '../../types/creditCard';
import { AgentContext } from '../../types/agents';
import { sql } from '@vercel/postgres';

// Initialize Anthropic client if API key is available
const anthropic = process.env.ANTHROPIC_API_KEY ? 
  new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : 
  null;

/**
 * Uses Claude 3.5 to intelligently determine the appropriate journal type
 * based on transaction details and context
 * 
 * @param transaction The credit card transaction to analyze
 * @param isRefund Whether the transaction appears to be a refund
 * @param isPayment Whether the transaction is a payment to the credit card
 * @returns The appropriate journal type code
 */
export async function determineJournalType(
  transaction: CreditCardTransaction,
  isRefund: boolean = false,
  isPayment: boolean = false
): Promise<string> {
  // Default journal types
  const DEFAULT_PURCHASE_TYPE = 'CCP'; // Credit Card Purchase
  const DEFAULT_PAYMENT_TYPE = 'CCY';  // Credit Card Payment
  const DEFAULT_REFUND_TYPE = 'CCR';   // Credit Card Refund

  // If we don't have an API key or client, return the default types
  if (!anthropic) {
    console.log('[creditCardAgentEnhancements] No Anthropic API key found, using default journal types');
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
      console.log(`[creditCardAgentEnhancements] Claude determined journal type: ${journalType}`);
      return journalType;
    } else {
      console.log(`[creditCardAgentEnhancements] Invalid journal type from Claude: ${journalType}, using default`);
      if (isPayment) return DEFAULT_PAYMENT_TYPE;
      if (isRefund) return DEFAULT_REFUND_TYPE;
      return DEFAULT_PURCHASE_TYPE;
    }
  } catch (error) {
    console.error('[creditCardAgentEnhancements] Error calling Claude:', error);
    // Fallback to default types
    if (isPayment) return DEFAULT_PAYMENT_TYPE;
    if (isRefund) return DEFAULT_REFUND_TYPE;
    return DEFAULT_PURCHASE_TYPE;
  }
}

/**
 * Helper function to determine the journal type for a transaction
 * This is a simplified wrapper around determineJournalType
 * 
 * @param transaction The credit card transaction to analyze
 * @param context The agent context
 * @returns The AI-determined journal type code
 */
export async function getAIJournalType(
  transaction: CreditCardTransaction,
  context: AgentContext
): Promise<string> {
  try {
    // Log the integration
    console.log(`[creditCardAgentEnhancements] Analyzing transaction: ${transaction.description}`);
    
    // Determine if this is a payment or refund based on transaction details
    const isPayment = transaction.amount > 0; // Credit to the account (payment)
    
    // Check for refund indicators in description or category
    const isRefund: boolean = !!(  // Convert to boolean with double negation
      transaction.description.toLowerCase().includes('refund') || 
      transaction.description.toLowerCase().includes('return') ||
      transaction.description.toLowerCase().includes('credit') ||
      (transaction.category && 
       (transaction.category.toLowerCase().includes('refund') || 
        transaction.category.toLowerCase().includes('return')))
    );
    
    // Use Claude to determine the journal type
    const journalType = await determineJournalType(transaction, isRefund, isPayment);
    
    console.log(`[creditCardAgentEnhancements] AI determined journal type: ${journalType} for transaction: ${transaction.description}`);
    
    return journalType;
  } catch (error) {
    console.error('[creditCardAgentEnhancements] Error determining journal type:', error);
    
    // Fallback to default types if AI fails
    if (transaction.amount > 0) return 'CCY'; // Credit Card Payment
    
    // Check for refund indicators as fallback
    if (transaction.description.toLowerCase().includes('refund') || 
        transaction.description.toLowerCase().includes('return')) {
      return 'CCR'; // Credit Card Refund
    }
    
    return 'CCP'; // Default to Credit Card Purchase
  }
}

/**
 * Updates all draft credit card payment journal entries to posted status
 * @param userId Optional user ID to filter journal entries by
 * @returns A summary of the update operation
 */
export async function updateDraftPaymentJournalsToPosted(userId?: string): Promise<{
  success: boolean;
  message: string;
  updatedCount?: number;
}> {
  try {
    console.log(`[creditCardAgentEnhancements] Updating draft payment journals to posted for user: ${userId || 'all users'}`);
    
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
      if (userId) {
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
        updateQuery = `
          UPDATE journals 
          SET is_posted = true 
          WHERE is_posted = false
          AND journal_type = 'CCY'
          AND source = 'cc_agent'
        `;
        result = await sql.query(updateQuery);
      }
    } else {
      // Otherwise, update all draft entries from the credit card agent
      // that appear to be payment entries (based on description)
      if (userId) {
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
      } else {
        updateQuery = `
          UPDATE journals 
          SET is_posted = true 
          WHERE is_posted = false
          AND source = 'cc_agent'
          AND (
            memo LIKE '%payment%' 
            OR description LIKE '%payment%'
            OR memo LIKE '%Payment%'
            OR description LIKE '%Payment%'
          )
        `;
        result = await sql.query(updateQuery);
      }
    }
    
    console.log(`[creditCardAgentEnhancements] Updated ${result.rowCount} draft payment journals to posted status`);
    
    // Also check journal_entries table if it exists
    const journalEntriesCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_entries'
      ) as has_journal_entries_table
    `;
    
    if (journalEntriesCheck.rows[0].has_journal_entries_table) {
      console.log('[creditCardAgentEnhancements] Checking journal_entries table...');
      
      let journalEntriesUpdate;
      let journalEntriesResult;
      
      if (userId) {
        journalEntriesUpdate = `
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
        journalEntriesResult = await sql.query(journalEntriesUpdate, [userId]);
      } else {
        journalEntriesUpdate = `
          UPDATE journal_entries 
          SET status = 'posted' 
          WHERE status = 'draft'
          AND source = 'credit_card_statement'
          AND (
            description LIKE '%payment%' 
            OR description LIKE '%Payment%'
          )
        `;
        journalEntriesResult = await sql.query(journalEntriesUpdate);
      }
      
      console.log(`[creditCardAgentEnhancements] Updated ${journalEntriesResult.rowCount} draft entries in journal_entries table`);
    }
    
    return {
      success: true,
      message: `Updated draft payment journals to posted status`,
      updatedCount: result.rowCount ?? 0
    };
  } catch (error) {
    console.error("[creditCardAgentEnhancements] Error updating draft payment journals:", error);
    return {
      success: false,
      message: `Error updating draft payment journals: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

/**
 * Ensures that the is_posted column is included in the dynamic SQL for journal creation
 * This function should be called when building the dynamic SQL for journal creation
 * 
 * @param columns Array of column names to include in the SQL
 * @param values Array of values to include in the SQL
 * @param placeholders Array of placeholders to include in the SQL
 * @param paramIndex Current parameter index
 * @param isPayment Whether this is a payment transaction
 * @returns Updated paramIndex
 */
export function ensureIsPostedColumn(
  columns: string[],
  values: any[],
  placeholders: string[],
  paramIndex: number,
  isPayment: boolean = false
): number {
  // Check if is_posted is already in the columns
  if (!columns.includes('is_posted')) {
    columns.push('is_posted');
    // Always set is_posted to true for payment transactions
    values.push(true);
    placeholders.push(`$${paramIndex++}`);
  }
  
  return paramIndex;
}

/**
 * Ensures that the journal_type column is included in the dynamic SQL for journal creation
 * and sets it to the AI-determined type or appropriate default
 * 
 * @param columns Array of column names to include in the SQL
 * @param values Array of values to include in the SQL
 * @param placeholders Array of placeholders to include in the SQL
 * @param paramIndex Current parameter index
 * @param journalType The journal type to use
 * @returns Updated paramIndex
 */
export function ensureJournalTypeColumn(
  columns: string[],
  values: any[],
  placeholders: string[],
  paramIndex: number,
  journalType: string = 'CCP'
): number {
  // Check if journal_type is already in the columns
  if (!columns.includes('journal_type')) {
    columns.push('journal_type');
    values.push(journalType);
    placeholders.push(`$${paramIndex++}`);
  }
  
  return paramIndex;
}

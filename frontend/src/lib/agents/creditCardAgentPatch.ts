/**
 * Patch for Credit Card Agent to ensure payment journal entries are always posted
 * 
 * This file contains the fixes needed to ensure that credit card payment journal entries
 * are created with is_posted = true instead of being left in draft status.
 * 
 * The main issue is in the createTransactionJournalEntry method where the dynamic SQL
 * generation doesn't include the is_posted column for the journals table.
 */

import { sql } from "@vercel/postgres";

/**
 * Enhanced schema check that includes is_posted column
 * This should replace the existing columnsCheck query in createTransactionJournalEntry
 */
export const getEnhancedColumnsCheck = async () => {
  return await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'description') as has_description,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'memo') as has_memo,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'notes') as has_notes,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'debit_amount') as has_debit_amount,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'credit_amount') as has_credit_amount,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'amount') as has_amount,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'created_by') as has_created_by,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type
  `;
};

/**
 * Enhanced column building logic that includes is_posted and journal_type
 * This should be used in the createTransactionJournalEntry method
 */
export const buildEnhancedJournalColumns = (
  context: any,
  transaction: any,
  accountName: string,
  isPayment: boolean,
  columnsCheck: any,
  requiredColumns: Map<string, boolean>
) => {
  const columns: string[] = [];
  const values: any[] = [];
  const placeholders: string[] = [];
  
  // Always include user_id and source
  columns.push('user_id', 'source');
  values.push(context.userId || null, 'credit_card_statement');
  placeholders.push('$1', '$2');
  
  let paramIndex = 3;
  
  // Extract column availability from check
  const hasDate = columnsCheck.rows[0].has_date;
  const hasTransactionDate = columnsCheck.rows[0].has_transaction_date;
  const hasDescription = columnsCheck.rows[0].has_description;
  const hasMemo = columnsCheck.rows[0].has_memo;
  const hasNotes = columnsCheck.rows[0].has_notes;
  const hasDebitAmount = columnsCheck.rows[0].has_debit_amount;
  const hasCreditAmount = columnsCheck.rows[0].has_credit_amount;
  const hasAmount = columnsCheck.rows[0].has_amount;
  const hasCreatedBy = columnsCheck.rows[0].has_created_by;
  const hasIsPosted = columnsCheck.rows[0].has_is_posted;
  const hasJournalType = columnsCheck.rows[0].has_journal_type;
  
  // Add date or transaction_date if available
  if (hasDate) {
    columns.push('date');
    values.push(transaction.date);
    placeholders.push(`$${paramIndex++}`);
  } else if (hasTransactionDate) {
    columns.push('transaction_date');
    values.push(transaction.date);
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add description if available
  if (hasDescription) {
    columns.push('description');
    values.push(transaction.description);
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add memo if available or required
  if (hasMemo || requiredColumns.has('memo')) {
    columns.push('memo');
    values.push(`Payment for ${accountName}: ${transaction.description}`);
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add notes if available
  if (hasNotes) {
    columns.push('notes');
    values.push(`Credit card payment transaction: ${transaction.description}`);
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add amount if available
  if (hasAmount) {
    columns.push('amount');
    values.push(Math.abs(transaction.amount));
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add debit_amount if available
  if (hasDebitAmount) {
    columns.push('debit_amount');
    values.push(Math.abs(transaction.amount));
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add credit_amount if available
  if (hasCreditAmount) {
    columns.push('credit_amount');
    values.push(Math.abs(transaction.amount));
    placeholders.push(`$${paramIndex++}`);
  }
  
  // Add created_by if available or required
  if (hasCreatedBy || requiredColumns.has('created_by')) {
    columns.push('created_by');
    values.push(context.userId || 'system');
    placeholders.push(`$${paramIndex++}`);
  }
  
  // CRITICAL FIX: Add is_posted column for payment transactions
  if (hasIsPosted) {
    columns.push('is_posted');
    values.push(true); // Always set to true for payment transactions
    placeholders.push(`$${paramIndex++}`);
  }
  
  // CRITICAL FIX: Add journal_type column for payment transactions
  if (hasJournalType && isPayment) {
    columns.push('journal_type');
    values.push('CCY'); // Credit Card Payment type
    placeholders.push(`$${paramIndex++}`);
  }
  
  return {
    columns,
    values,
    placeholders,
    paramIndex
  };
};

/**
 * Instructions for applying this patch:
 * 
 * 1. In creditCardAgent.ts, find the createTransactionJournalEntry method around line 2545
 * 2. Replace the existing columnsCheck query with getEnhancedColumnsCheck()
 * 3. Replace the dynamic column building logic (lines ~2597-2667) with buildEnhancedJournalColumns()
 * 4. Import this patch file at the top of creditCardAgent.ts
 * 
 * The key changes are:
 * - Adding has_is_posted and has_journal_type to the schema check
 * - Always including is_posted = true when the column exists
 * - Including journal_type = 'CCY' for payment transactions when the column exists
 */

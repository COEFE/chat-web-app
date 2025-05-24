/**
 * This file contains a utility function to ensure that credit card payment journal entries
 * are always posted immediately rather than left in draft status.
 * 
 * It modifies the dynamic SQL generation in the createTransactionJournalEntry method
 * to always include the is_posted column with a value of true for payment transactions.
 */

import { sql } from "@vercel/postgres";

/**
 * Updates all draft credit card payment journal entries to posted status
 * @param userId The user ID to filter journal entries by
 * @returns A summary of the update operation
 */
export async function updateDraftPaymentJournalsToPosted(userId: string): Promise<{
  success: boolean;
  message: string;
  updatedCount?: number;
}> {
  try {
    console.log(`[ensurePaymentJournalPosted] Updating draft payment journals to posted for user: ${userId}`);
    
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
      `;
      result = await sql.query(updateQuery, [userId]);
    }
    
    return {
      success: true,
      message: `Updated ${result.rowCount ?? 0} draft payment journals to posted status`,
      updatedCount: result.rowCount ?? 0
    };
  } catch (error) {
    console.error("[ensurePaymentJournalPosted] Error updating draft payment journals:", error);
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
 * and sets it to 'CCY' for payment transactions
 * 
 * @param columns Array of column names to include in the SQL
 * @param values Array of values to include in the SQL
 * @param placeholders Array of placeholders to include in the SQL
 * @param paramIndex Current parameter index
 * @param isPayment Whether this is a payment transaction
 * @returns Updated paramIndex
 */
export function ensureJournalTypeColumn(
  columns: string[],
  values: any[],
  placeholders: string[],
  paramIndex: number,
  isPayment: boolean = false
): number {
  // Check if journal_type is already in the columns
  if (!columns.includes('journal_type')) {
    columns.push('journal_type');
    // Set journal_type to 'CCY' for payment transactions
    values.push(isPayment ? 'CCY' : 'CCP');
    placeholders.push(`$${paramIndex++}`);
  }
  
  return paramIndex;
}

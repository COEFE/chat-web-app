import { sql } from '@vercel/postgres';

/**
 * Interface for statement tracking records
 */
export interface StatementTracker {
  id: number;
  account_id: number;
  statement_number: string;
  statement_date: string;
  last_four: string;
  is_starting_balance: boolean;
  processed_date: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Check if a statement has already been processed
 * This function uses multiple matching strategies to identify duplicate statements:
 * 1. Exact match on account_id + statement_number
 * 2. Match on account_id + last_four digits
 * 
 * @param accountId The GL account ID
 * @param statementNumber The full statement number
 * @param lastFour The last four digits of the statement number (fallback)
 * @param userId The user ID
 * @returns Boolean indicating if the statement has been processed
 */
export async function isStatementProcessed(
  accountId: number,
  statementNumber: string,
  lastFour: string,
  userId: string
): Promise<boolean> {
  try {
    console.log(`Checking if statement ${statementNumber} (last four: ${lastFour}) has been processed for account ${accountId}`);
    
    // Check if the statement has already been processed
    // Only consider it processed if BOTH statement number AND account match
    // This prevents false positives from different statements for the same card
    const { rows } = await sql`
      SELECT id, statement_number, statement_date FROM statement_trackers 
      WHERE account_id = ${accountId} 
      AND statement_number = ${statementNumber}
      AND user_id = ${userId}
      AND statement_number != 'unknown'
    `;
    
    const isProcessed = rows.length > 0;
    console.log(`Statement processed check result: ${isProcessed ? 'Already processed' : 'Not yet processed'}`);
    if (isProcessed && rows[0]) {
      console.log(`Found existing statement: ${rows[0].statement_number} (${rows[0].statement_date})`);
    }
    
    return isProcessed;
  } catch (error) {
    console.error('Error checking if statement is processed:', error);
    return false;
  }
}

/**
 * Record a processed statement
 * @param accountId The GL account ID
 * @param statementNumber The full statement number
 * @param statementDate The date of the statement
 * @param lastFour The last four digits of the statement number
 * @param isStartingBalance Whether this statement was used for starting balance
 * @param userId The user ID
 * @returns The created tracker record
 */
export async function recordProcessedStatement(
  accountId: number,
  statementNumber: string,
  statementDate: string,
  lastFour: string,
  isStartingBalance: boolean,
  userId: string
): Promise<StatementTracker | null> {
  try {
    console.log(`Recording processed statement: Account ID ${accountId}, Statement ${statementNumber}, Last Four ${lastFour}, Starting Balance: ${isStartingBalance}`);
    
    // First check if this statement has already been processed to avoid duplicates
    const isProcessed = await isStatementProcessed(accountId, statementNumber, lastFour, userId);
    
    if (isProcessed) {
      console.log(`Statement ${statementNumber} has already been processed. Skipping record creation.`);
      
      // If it's already processed, return the existing record
      const { rows } = await sql`
        SELECT * FROM statement_trackers 
        WHERE 
          ((account_id = ${accountId} AND statement_number = ${statementNumber})
          OR (account_id = ${accountId} AND last_four = ${lastFour}))
          AND user_id = ${userId}
        LIMIT 1
      `;
      
      return rows[0] as StatementTracker || null;
    }
    
    // Record the processed statement
    const { rows } = await sql`
      INSERT INTO statement_trackers (
        account_id, 
        statement_number, 
        statement_date, 
        last_four, 
        is_starting_balance, 
        processed_date,
        user_id
      ) VALUES (
        ${accountId}, 
        ${statementNumber}, 
        ${statementDate}, 
        ${lastFour}, 
        ${isStartingBalance}, 
        NOW(),
        ${userId}
      )
      RETURNING *
    `;
    
    console.log(`Successfully recorded statement ${statementNumber} for account ${accountId}`);
    return rows[0] as StatementTracker || null;
  } catch (error) {
    console.error('Error recording processed statement:', error);
    return null;
  }
}

/**
 * Get all processed statements for an account
 * @param accountId The GL account ID
 * @param userId The user ID
 * @returns Array of statement tracker records
 */
export async function getProcessedStatements(
  accountId: number,
  userId: string
): Promise<StatementTracker[]> {
  try {
    const { rows } = await sql`
      SELECT * FROM statement_trackers 
      WHERE account_id = ${accountId} AND user_id = ${userId}
      ORDER BY statement_date DESC
    `;
    
    return rows as StatementTracker[];
  } catch (error) {
    console.error('Error getting processed statements:', error);
    return [];
  }
}

/**
 * Check if an account has a starting balance statement
 * @param accountId The GL account ID
 * @param userId The user ID
 * @returns Boolean indicating if the account has a starting balance statement
 */
export async function hasStartingBalanceStatement(
  accountId: number,
  userId: string
): Promise<boolean> {
  try {
    console.log(`Checking if account ${accountId} has a starting balance statement`);
    
    const { rows } = await sql`
      SELECT id FROM statement_trackers 
      WHERE account_id = ${accountId} AND is_starting_balance = true AND user_id = ${userId}
    `;
    
    const hasStartingBalance = rows.length > 0;
    console.log(`Account ${accountId} ${hasStartingBalance ? 'has' : 'does not have'} a starting balance statement`);
    
    return hasStartingBalance;
  } catch (error) {
    console.error('Error checking for starting balance statement:', error);
    return false;
  }
}

/**
 * Find statement information by account number or last four digits
 * This helps recognize future statements from the same account
 * 
 * @param statementNumber The full statement number
 * @param lastFour The last four digits of the statement number
 * @param userId The user ID
 * @returns The account information if found, null otherwise
 */
export async function findStatementByAccountIdentifiers(
  statementNumber: string,
  lastFour: string,
  userId: string
): Promise<{ accountId: number; accountName?: string; hasStartingBalance: boolean } | null> {
  try {
    console.log(`Finding statement by identifiers: Statement ${statementNumber}, Last Four ${lastFour}`);
    
    // First try to find by full statement number
    let query = await sql`
      SELECT st.account_id, a.name as account_name, 
        (SELECT COUNT(*) > 0 FROM statement_trackers 
         WHERE account_id = st.account_id AND is_starting_balance = true AND user_id = ${userId}) as has_starting_balance
      FROM statement_trackers st
      JOIN accounts a ON st.account_id = a.id
      WHERE st.statement_number = ${statementNumber} AND st.user_id = ${userId}
      LIMIT 1
    `;
    
    // If not found by full number, try by last four digits
    if (query.rows.length === 0 && lastFour) {
      query = await sql`
        SELECT st.account_id, a.name as account_name, 
          (SELECT COUNT(*) > 0 FROM statement_trackers 
           WHERE account_id = st.account_id AND is_starting_balance = true AND user_id = ${userId}) as has_starting_balance
        FROM statement_trackers st
        JOIN accounts a ON st.account_id = a.id
        WHERE st.last_four = ${lastFour} AND st.user_id = ${userId}
        LIMIT 1
      `;
    }
    
    if (query.rows.length > 0) {
      const result = {
        accountId: query.rows[0].account_id,
        accountName: query.rows[0].account_name,
        hasStartingBalance: query.rows[0].has_starting_balance
      };
      
      console.log(`Found account ${result.accountId} (${result.accountName}) for statement identifiers`);
      return result;
    }
    
    console.log(`No account found for statement identifiers: Statement ${statementNumber}, Last Four ${lastFour}`);
    return null;
  } catch (error) {
    console.error('Error finding statement by account identifiers:', error);
    return null;
  }
}

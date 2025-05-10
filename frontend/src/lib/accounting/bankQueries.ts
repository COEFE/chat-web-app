import * as db from '@/lib/db';

export interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  institution_name: string;
  gl_account_id: number;
  gl_account_name?: string;
  current_balance?: number;
  last_reconciled_date?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BankStatement {
  id: number;
  bank_account_id: number;
  start_date: string;
  end_date: string;
  starting_balance: number;
  ending_balance: number;
  is_reconciled: boolean;
  reconciled_date?: string;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationSession {
  id: number;
  bank_account_id: number;
  statement_date: string;
  statement_balance: number;
  status: string;
  created_by: string;
  created_at: string;
  completed_at?: string;
  notes?: string;
}

/**
 * Get all bank accounts with optional filtering
 */
export async function getBankAccounts(options?: {
  isActive?: boolean;
  includeBalance?: boolean;
}): Promise<BankAccount[]> {
  try {
    const { isActive = true, includeBalance = true } = options || {};
    
    let query = `
      SELECT 
        ba.*, 
        a.name as gl_account_name
      FROM bank_accounts ba
      LEFT JOIN accounts a ON ba.gl_account_id = a.id
      WHERE ba.is_active = $1
      ORDER BY ba.name
    `;
    
    const result = await db.query(query, [isActive]);
    return result.rows as BankAccount[];
  } catch (error) {
    console.error("[BankQueries] Error fetching bank accounts:", error);
    return [];
  }
}

/**
 * Get a single bank account by ID
 */
export async function getBankAccountById(id: number): Promise<BankAccount | null> {
  try {
    const query = `
      SELECT 
        ba.*, 
        a.name as gl_account_name
      FROM bank_accounts ba
      LEFT JOIN accounts a ON ba.gl_account_id = a.id
      WHERE ba.id = $1
    `;
    
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as BankAccount;
  } catch (error) {
    console.error("[BankQueries] Error fetching bank account:", error);
    return null;
  }
}

/**
 * Get bank statements for a specific account or all accounts
 */
export async function getBankStatements(accountId?: number, includeReconciled = true): Promise<BankStatement[]> {
  try {
    let query = `
      SELECT *
      FROM bank_statements
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (accountId) {
      query += ` AND bank_account_id = $${params.length + 1}`;
      params.push(accountId);
    }
    
    if (!includeReconciled) {
      query += ` AND is_reconciled = false`;
    }
    
    query += ` ORDER BY end_date DESC`;
    
    const result = await db.query(query, params);
    return result.rows as BankStatement[];
  } catch (error) {
    console.error("[BankQueries] Error fetching bank statements:", error);
    return [];
  }
}

/**
 * Get recent reconciliation sessions
 */
export async function getRecentReconciliations(accountId?: number, limit: number = 5): Promise<ReconciliationSession[]> {
  try {
    let query = `
      SELECT rs.*
      FROM reconciliation_sessions rs
    `;
    
    const params: any[] = [];
    
    if (accountId) {
      query += ` WHERE rs.bank_account_id = $${params.length + 1}`;
      params.push(accountId);
    }
    
    query += ` ORDER BY rs.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    return result.rows as ReconciliationSession[];
  } catch (error) {
    console.error("[BankQueries] Error fetching recent reconciliations:", error);
    return [];
  }
}

/**
 * Get unreconciled transactions for a bank account
 */
export async function getUnreconciledTransactions(accountId: number, limit: number = 30): Promise<any[]> {
  try {
    const query = `
      SELECT t.*
      FROM transactions t
      JOIN accounts a ON t.account_id = a.id
      JOIN bank_accounts ba ON ba.gl_account_id = a.id
      WHERE ba.id = $1
      AND t.is_reconciled = false
      ORDER BY t.transaction_date DESC
      LIMIT $2
    `;
    
    const result = await db.query(query, [accountId, limit]);
    return result.rows;
  } catch (error) {
    console.error("[BankQueries] Error fetching unreconciled transactions:", error);
    return [];
  }
}

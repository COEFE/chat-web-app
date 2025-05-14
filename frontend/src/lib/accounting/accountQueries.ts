import * as db from '@/lib/db';

export interface Account {
  id: number;
  name: string;
  code: string; // This is the actual column name in the database
  account_type: string; // Changed from type to account_type to match database schema
  subtype?: string;
  description?: string;
  balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

/**
 * Get accounts from the database with optional filtering
 */
export async function getAccounts(options?: {
  types?: string[];
  isActive?: boolean;
  isDeleted?: boolean;
  limit?: number;
}): Promise<Account[]> {
  try {
    const { types, isActive = true, isDeleted = false, limit = 100 } = options || {};
    
    let query = `
      SELECT * FROM accounts
      WHERE is_active = $1 AND is_deleted = $2
    `;
    
    const params: any[] = [isActive, isDeleted];
    
    if (types && types.length > 0) {
      query += ` AND account_type = ANY($3)`;
      params.push(types);
    }
    
    query += ` ORDER BY code, name LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    return result.rows as Account[];
  } catch (error) {
    console.error("[AccountQueries] Error fetching accounts:", error);
    return [];
  }
}

/**
 * Get a single account by ID
 */
export async function getAccountById(id: number): Promise<Account | null> {
  try {
    const query = `
      SELECT * FROM accounts
      WHERE id = $1 AND is_deleted = false
    `;
    
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0] as Account;
  } catch (error) {
    console.error("[AccountQueries] Error fetching account by ID:", error);
    return null;
  }
}

/**
 * Get accounts by type
 */
export async function getAccountsByType(type: string, isActive: boolean = true): Promise<Account[]> {
  try {
    const query = `
      SELECT * FROM accounts
      WHERE type = $1 AND is_active = $2 AND is_deleted = false
      ORDER BY number, name
    `;
    
    const result = await db.query(query, [type, isActive]);
    return result.rows as Account[];
  } catch (error) {
    console.error(`[AccountQueries] Error fetching accounts by type (${type}):`, error);
    return [];
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    console.log('[Expense API] Attempting to find valid expense accounts');
    
    // Series of attempts to find valid expense account IDs
    const accounts: {id: string, source: string}[] = [];
    
    // First check existing bill_lines for valid expense_account_ids
    try {
      const billLinesResult = await sql`
        SELECT DISTINCT expense_account_id 
        FROM bill_lines 
        WHERE expense_account_id IS NOT NULL
        LIMIT 10
      `;
      
      if (billLinesResult.rows && billLinesResult.rows.length > 0) {
        const billLineAccounts = billLinesResult.rows.map(row => ({
          id: row.expense_account_id,
          source: 'bill_lines'
        }));
        accounts.push(...billLineAccounts);
        console.log(`[Expense API] Found ${billLineAccounts.length} expense account IDs from bill_lines`);
      }
    } catch (billLinesError) {
      console.log('[Expense API] Error checking bill_lines table:', billLinesError);
    }
    
    // Try the general ledger expense accounts
    try {
      const expenseResult = await sql`
        SELECT id FROM gl_accounts
        WHERE account_type = 'expense'
        OR account_type LIKE '%expense%'
        LIMIT 10
      `;
      
      if (expenseResult.rows && expenseResult.rows.length > 0) {
        const glAccounts = expenseResult.rows.map(row => ({
          id: row.id,
          source: 'gl_accounts'
        }));
        accounts.push(...glAccounts);
        console.log(`[Expense API] Found ${glAccounts.length} expense account IDs from gl_accounts`);
      }
    } catch (glError) {
      console.log('[Expense API] Error checking gl_accounts table:', glError);
    }
    
    // Get table structure to help diagnostic
    const tableStructure: Record<string, string[]> = {};
    try {
      // Get list of all tables
      const tablesResult = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      
      // For each relevant table, get its columns
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        if (tableName.includes('bill') || 
            tableName.includes('account') || 
            tableName.includes('expense')) {
          
          try {
            const columnsResult = await sql`
              SELECT column_name
              FROM information_schema.columns
              WHERE table_name = ${tableName}
              ORDER BY ordinal_position
            `;
            
            tableStructure[tableName] = columnsResult.rows.map(r => r.column_name);
          } catch (columnError) {
            console.log(`[Expense API] Error getting columns for ${tableName}:`, columnError);
          }
        }
      }
    } catch (structureError) {
      console.log('[Expense API] Error getting table structure:', structureError);
    }
    
    // If no accounts found, try to get any ID from accounts table
    if (accounts.length === 0) {
      try {
        // Find account-related tables
        const tablesResult = await sql`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND
          (table_name LIKE '%account%' OR table_name LIKE '%expense%')
          ORDER BY table_name
        `;
        
        // Try looking for accounts in discovered tables
        for (const row of tablesResult.rows) {
          const tableName = row.table_name;
          try {
            // Need to use raw query for dynamic table name
            const result = await sql.query(
              `SELECT id FROM "${tableName}" LIMIT 5`
            );
            
            if (result.rows && result.rows.length > 0) {
              const tableAccounts = result.rows.map(r => ({
                id: r.id,
                source: tableName
              }));
              accounts.push(...tableAccounts);
              console.log(`[Expense API] Found ${tableAccounts.length} IDs from table ${tableName}`);
            }
          } catch (tableError) {
            // Skip this table and try the next one
          }
        }
      } catch (tablesError) {
        console.log('[Expense API] Error checking account tables:', tablesError);
      }
    }
    
    // If still no accounts found, return the AP account ID we found earlier (13)
    if (accounts.length === 0) {
      accounts.push({
        id: '13',
        source: 'default'
      });
      console.log('[Expense API] No accounts found, using default ID 13');
    }
    
    return NextResponse.json({ 
      success: true,
      accounts,
      tableStructure,
      message: `Found ${accounts.length} possible expense account IDs`
    });
  } catch (error) {
    console.error('[Expense API] Error getting expense accounts:', error);
    return NextResponse.json(
      { 
        success: false, 
        accounts: [{ id: '13', source: 'default_fallback' }],
        error: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    );
  }
}

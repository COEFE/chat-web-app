import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

// Use a simpler approach compatible with Next.js 15
export async function GET(request: NextRequest) {
  // Extract the parameters from the URL path
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 3]; // Extract ID from path
  const sessionId = pathParts[pathParts.length - 1]; // Extract sessionId from path
  console.log('[RECONCILIATION_SESSION_GET] Starting handler with params:', { id, sessionId });
  
  const bankAccountId = parseInt(id, 10);
  const reconciliationSessionId = parseInt(sessionId, 10);

  if (isNaN(bankAccountId) || isNaN(reconciliationSessionId)) {
    console.log('[RECONCILIATION_SESSION_GET] Invalid params:', { bankAccountId, reconciliationSessionId });
    return NextResponse.json({ error: 'Invalid bank account ID or session ID' }, { status: 400 });
  }

  try {
    console.log('[RECONCILIATION_SESSION_GET] Fetching session data for:', { bankAccountId, reconciliationSessionId });
    
    // Fetch reconciliation session with bank account details
    const sessionQuery = `
      SELECT rs.*, ba.name as bank_account_name, ba.account_number  
      FROM reconciliation_sessions rs
      JOIN bank_accounts ba ON rs.bank_account_id = ba.id
      WHERE rs.id = $1 AND rs.bank_account_id = $2
    `;
    
    const sessionResult = await query(sessionQuery, [reconciliationSessionId, bankAccountId]);
    console.log('[RECONCILIATION_SESSION_GET] Session query result:', 
      sessionResult.rows.length ? 'Found session' : 'No session found'
    );

    if (sessionResult.rows.length === 0) {
      return NextResponse.json({ 
        error: 'Reconciliation session not found',
        params: { bankAccountId, reconciliationSessionId } 
      }, { status: 404 });
    }
    
    const session = sessionResult.rows[0];
    
    // Check if transactions table exists and get its structure
    const checkTransactionsTableQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'transactions'
      ) as table_exists;
    `;
    
    const txTableResult = await query(checkTransactionsTableQuery, []);
    console.log('[RECONCILIATION_SESSION_GET] Transactions table exists:', txTableResult.rows[0]);
    
    // If transactions table doesn't exist, try bank_transactions
    const tableName = txTableResult.rows[0].table_exists ? 'transactions' : 'bank_transactions';
    
    // Check the columns in the table
    const columnsQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${tableName}';
    `;
    
    const columnsResult = await query(columnsQuery, []);
    console.log(`[RECONCILIATION_SESSION_GET] Columns in ${tableName}:`, 
      columnsResult.rows.map(row => row.column_name));

    // Now fetch the transactions for this bank account within the reconciliation date range
    // Based on the actual columns we found in the database
    const transactionsQuery = `
      SELECT 
        id,
        transaction_date,
        description,
        amount,
        transaction_type,
        status,
        reference_number,
        bank_account_id,
        false as is_cleared, -- Default value since this column doesn't exist
        false as is_gl_entry -- Default value since this column doesn't exist
      FROM ${tableName} 
      WHERE bank_account_id = $1
        AND transaction_date >= $2
        AND transaction_date <= $3
      ORDER BY transaction_date DESC
    `;
    
    // Get the transactions
    let transactions = [];
    try {
      const transactionsResult = await query(transactionsQuery, [
        bankAccountId, 
        session.start_date,
        session.end_date
      ]);
      
      console.log('[RECONCILIATION_SESSION_GET] Found transactions:', transactionsResult.rows.length);
      transactions = transactionsResult.rows;
      
    } catch (txError) {
      console.error('[RECONCILIATION_SESSION_GET] Error fetching transactions:', txError);
      // Continue without transactions in worst case
      transactions = [];
    }
    
    // Return both the session and transactions
    return NextResponse.json({ 
      session,
      transactions
    });

  } catch (error) {
    // Provide more detailed error information
    console.error('[RECONCILIATION_SESSION_GET_ERROR]', error);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: error instanceof Error ? error.message : 'Unknown error',
      params: { bankAccountId, reconciliationSessionId }
    }, { status: 500 });
  }
}

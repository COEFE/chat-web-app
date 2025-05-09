import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query, transaction } from '@/lib/db';

// POST /api/bank-accounts/[id]/reconciliation - Start a new reconciliation session
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Extract bank account ID from URL
    const pathParts = req.nextUrl.pathname.split('/');
    const bankAccountId = parseInt(pathParts[pathParts.indexOf('bank-accounts') + 1], 10);
    
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const { start_date, end_date, bank_statement_balance } = body;
    
    // Validate required fields
    if (!start_date || !end_date || bank_statement_balance === undefined) {
      return NextResponse.json({
        error: 'Missing required fields: start_date, end_date, and bank_statement_balance are required',
      }, { status: 400 });
    }
    
    // Check if bank account exists and compute book balance (GL balance)
    const bankAccountCheck = await query(
      `SELECT 
        ba.id, 
        COALESCE(
          (SELECT SUM(
            CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE -bt.amount END
          ) FROM bank_transactions bt 
            WHERE bt.bank_account_id = ba.id AND bt.is_deleted = false),
        0) AS book_balance
      FROM bank_accounts ba
      WHERE ba.id = $1 AND ba.is_deleted = false`,
      [bankAccountId]
    );
    
    if (bankAccountCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    // Check if there's already an active reconciliation session
    const activeSessionCheck = await query(
      'SELECT id FROM reconciliation_sessions WHERE bank_account_id = $1 AND status = $2',
      [bankAccountId, 'in_progress']
    );
    
    if (activeSessionCheck.rows.length > 0) {
      return NextResponse.json({
        error: 'There is already an active reconciliation session for this account',
        sessionId: activeSessionCheck.rows[0].id
      }, { status: 409 });
    }
    
    // Get book balance (GL balance) from the computed field
    const bookBalance = bankAccountCheck.rows[0].book_balance || 0;
    
    try {
      // Create a new reconciliation session
      const sessionResult = await query(
        `INSERT INTO reconciliation_sessions (
          bank_account_id,
          start_date,
          end_date,
          starting_balance,
          ending_balance,
          bank_statement_balance,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          bankAccountId,
          start_date,
          end_date,
          bookBalance,      // starting_balance
          bookBalance,      // ending_balance initialised to same value; will update upon reconciliation completion
          bank_statement_balance,
          'in_progress'
        ]
      );
      
      const sessionId = sessionResult.rows[0].id;
      
      // Get transactions within the date range that are not reconciled
      const transactionsResult = await query(
        `SELECT 
          id, 
          transaction_date, 
          description, 
          amount, 
          transaction_type
        FROM bank_transactions
        WHERE 
          bank_account_id = $1 AND
          transaction_date BETWEEN $2 AND $3 AND
          status = 'unmatched' AND
          is_deleted = false
        ORDER BY transaction_date`,
        [bankAccountId, start_date, end_date]
      );
      
      // no explicit transaction needed; individual queries succeed or throw
      return NextResponse.json({
        message: 'Reconciliation session created successfully',
        sessionId,
        transactions: transactionsResult.rows,
        unreconciled_count: transactionsResult.rows.length,
        starting_balance: bookBalance,
        ending_balance: bookBalance,
        bank_statement_balance: bank_statement_balance,
        start_date,
        end_date
      });
    } catch (err) {
      throw err;
    }
  } catch (err) {
    console.error('Error creating reconciliation session:', err);
    return NextResponse.json({
      error: 'Failed to create reconciliation session',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}

// GET /api/bank-accounts/[id]/reconciliation - Get active reconciliation session
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Extract bank account ID from URL
    const pathParts = req.nextUrl.pathname.split('/');
    const bankAccountId = parseInt(pathParts[pathParts.indexOf('bank-accounts') + 1], 10);
    
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Get session ID from query params (optional)
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');
    
    let query_text;
    let params;
    
    if (sessionId) {
      // Get specific reconciliation session
      query_text = `
        SELECT 
          rs.*,
          ba.name as bank_account_name,
          ba.account_number
        FROM reconciliation_sessions rs
        JOIN bank_accounts ba ON rs.bank_account_id = ba.id
        WHERE rs.id = $1 AND rs.bank_account_id = $2 AND rs.is_deleted = false
      `;
      params = [sessionId, bankAccountId];
    } else {
      // Get latest active reconciliation session for the bank account
      query_text = `
        SELECT 
          rs.*,
          ba.name as bank_account_name,
          ba.account_number
        FROM reconciliation_sessions rs
        JOIN bank_accounts ba ON rs.bank_account_id = ba.id
        WHERE rs.bank_account_id = $1 AND rs.status = 'in_progress' AND rs.is_deleted = false
        ORDER BY rs.created_at DESC
        LIMIT 1
      `;
      params = [bankAccountId];
    }
    
    const sessionResult = await query(query_text, params);
    
    if (sessionResult.rows.length === 0) {
      return NextResponse.json({
        message: 'No active reconciliation session found',
        active_session: false
      });
    }
    
    const session = sessionResult.rows[0];
    
    // Get unreconciled transactions for this session
    const transactionsResult = await query(
      `SELECT 
        id, 
        transaction_date, 
        description, 
        amount, 
        transaction_type,
        status,
        reference_number
      FROM bank_transactions
      WHERE 
        bank_account_id = $1 AND
        transaction_date BETWEEN $2 AND $3 AND
        status = 'unmatched' AND
        is_deleted = false
      ORDER BY transaction_date`,
      [bankAccountId, session.start_date, session.end_date]
    );
    
    return NextResponse.json({
      active_session: true,
      session,
      unreconciled_transactions: transactionsResult.rows,
      unreconciled_count: transactionsResult.rows.length
    });
  } catch (err) {
    console.error('Error retrieving reconciliation session:', err);
    return NextResponse.json({
      error: 'Failed to retrieve reconciliation session',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}

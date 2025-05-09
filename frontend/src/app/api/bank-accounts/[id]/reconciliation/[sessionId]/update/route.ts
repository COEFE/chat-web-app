import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// PATCH /api/bank-accounts/[id]/reconciliation/[sessionId]/update 
// Update reconciliation session settings
export async function PATCH(
  req: NextRequest, 
  { params }: { params: Promise<{ id: string; sessionId: string; }> }
) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const resolvedParams = await params; // Await the params Promise
    const bankAccountId = parseInt(resolvedParams.id, 10);
    const sessionId = parseInt(resolvedParams.sessionId, 10);
    
    if (isNaN(bankAccountId) || isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid bank account ID or session ID' }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const { bank_statement_balance, start_date, end_date } = body;
    
    // Validate that at least one field to update is provided
    if (!bank_statement_balance && !start_date && !end_date) {
      return NextResponse.json({ 
        error: 'No update parameters provided' 
      }, { status: 400 });
    }
    
    // Check if session exists and is in progress
    const sessionCheck = await query(
      `SELECT id, status, bank_account_id 
       FROM reconciliation_sessions 
       WHERE id = $1 AND bank_account_id = $2 AND status = 'in_progress' AND is_deleted = false`,
      [sessionId, bankAccountId]
    );
    
    if (sessionCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: 'Reconciliation session not found or not in progress' 
      }, { status: 404 });
    }
    
    // Build the update query dynamically based on provided fields
    let updateFields = [];
    let queryParams = [];
    let paramIndex = 1;
    
    if (bank_statement_balance !== undefined) {
      updateFields.push(`bank_statement_balance = $${paramIndex}`);
      queryParams.push(bank_statement_balance);
      paramIndex++;
    }
    
    if (start_date) {
      updateFields.push(`start_date = $${paramIndex}`);
      queryParams.push(start_date);
      paramIndex++;
    }
    
    if (end_date) {
      updateFields.push(`end_date = $${paramIndex}`);
      queryParams.push(end_date);
      paramIndex++;
    }
    
    // Add updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add the session ID and bank account ID to the query params
    queryParams.push(sessionId);
    queryParams.push(bankAccountId);
    
    // Perform the update
    const updateQuery = `
      UPDATE reconciliation_sessions
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex} AND bank_account_id = $${paramIndex + 1}
      RETURNING id, bank_statement_balance, start_date, end_date
    `;
    
    const result = await query(updateQuery, queryParams);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ 
        error: 'Failed to update reconciliation session' 
      }, { status: 500 });
    }
    
    // If date range changed, we need to re-fetch transactions
    let updatedTransactions = null;
    if (start_date || end_date) {
      // Get the new date range from the updated session
      const updatedSession = result.rows[0];
      
      // Get unreconciled transactions for this session with the new date range
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
        [bankAccountId, updatedSession.start_date, updatedSession.end_date]
      );
      
      updatedTransactions = transactionsResult.rows;
    }
    
    return NextResponse.json({
      message: 'Reconciliation session updated successfully',
      session: result.rows[0],
      updated_transactions: updatedTransactions
    });
    
  } catch (err) {
    console.error('Error updating reconciliation session:', err);
    return NextResponse.json({
      error: 'Failed to update reconciliation session',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}

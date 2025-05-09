import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// POST /api/bank-accounts/[id]/reconciliation/[sessionId]/reopen - Reopen a completed reconciliation session
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; sessionId: string; }> }) {
  try {
    // Authenticate user
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    const resolvedParams = await params; // Await the params Promise
    console.log('Reopen reconciliation API called with params:', resolvedParams);

    const bankAccountId = parseInt(resolvedParams.id, 10);
    const sessionId = parseInt(resolvedParams.sessionId, 10);
    
    if (isNaN(bankAccountId) || isNaN(sessionId)) {
      console.error('Invalid parameters:', { bankAccountId, sessionId });
      return NextResponse.json({ error: 'Invalid bank account ID or session ID' }, { status: 400 });
    }

    // Check if session exists and is completed
    const sessionCheck = await query(
      `SELECT id, status, bank_account_id 
       FROM reconciliation_sessions 
       WHERE id = $1 AND bank_account_id = $2 AND status = 'completed' AND is_deleted = false`,
      [sessionId, bankAccountId]
    );
    
    if (sessionCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: 'Reconciliation session not found or not in completed status' 
      }, { status: 404 });
    }
    
    // Begin transaction
    await query('BEGIN');
    
    try {
      // Revert bank transactions status back to unmatched
      await query(
        `UPDATE bank_transactions 
         SET status = 'unmatched' 
         WHERE status = 'reconciled' AND 
         id IN (
           SELECT DISTINCT jsonb_array_elements_text(rm.bank_transaction_ids)::integer as transaction_id
           FROM reconciliation_matches rm
           WHERE rm.reconciliation_session_id = $1
         )`,
        [sessionId]
      );
      
      // Mark session as in progress again
      const updateSessionResult = await query(
        `UPDATE reconciliation_sessions
         SET status = 'in_progress'
         WHERE id = $1
         RETURNING id, status`,
        [sessionId]
      );
      
      console.log('Session reopen result:', {
        rowCount: updateSessionResult.rowCount,
        rows: updateSessionResult.rows
      });
      
      // Commit transaction
      await query('COMMIT');
      
      // Simple response with minimal information
      const response = {
        success: true,
        message: 'Reconciliation reopened successfully',
        sessionId,
        timestamp: new Date().toISOString()
      };
      
      console.log('Sending success response:', response);
      
      return NextResponse.json(response);
    } catch (err) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error reopening reconciliation:', err);
    let errorDetails = 'Unknown error';
    
    if (err instanceof Error) {
      errorDetails = err.message;
      console.error('Error stack:', err.stack);
    }
    
    // Ensure we always return a valid JSON response
    return NextResponse.json({
      error: 'Failed to reopen reconciliation',
      details: errorDetails,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

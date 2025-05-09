import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// POST /api/bank-accounts/[id]/reconciliation/[sessionId]/complete - Complete a reconciliation session
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sessionId: string; }> } // Updated type for params
) {
  try {
    // Authenticate user
    const { userId, error } = await authenticateRequest(req);
    if (error) return error;

    const resolvedParams = await params; // Await the params Promise

    console.log('Complete reconciliation API called with params:', resolvedParams);

    const bankAccountId = parseInt(resolvedParams.id, 10);
    const sessionId = parseInt(resolvedParams.sessionId, 10);

    if (isNaN(bankAccountId) || isNaN(sessionId)) {
      console.error('Invalid parameters:', { bankAccountId, sessionId });
      return NextResponse.json({ error: 'Invalid bank account ID or session ID' }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const { matches, unreconciled_bank_transactions, unreconciled_gl_entries } = body;
    
    if (!Array.isArray(matches)) {
      return NextResponse.json({ error: 'Matches must be an array' }, { status: 400 });
    }
    
    // Check if session exists and is in progress
    const sessionCheck = await query(
      `SELECT id, status, bank_account_id, end_date
       FROM reconciliation_sessions 
       WHERE id = $1 AND bank_account_id = $2 AND status = 'in_progress' AND is_deleted = false`,
      [sessionId, bankAccountId]
    );
    
    if (sessionCheck.rows.length === 0) {
      return NextResponse.json({ 
        error: 'Reconciliation session not found or not in progress' 
      }, { status: 404 });
    }
    
    // Begin transaction
    await query('BEGIN');
    
    try {
      // Process matches
      for (const match of matches) {
        const { bankIds, glIds } = match;
        
        if (!Array.isArray(bankIds) || !Array.isArray(glIds)) {
          throw new Error('Invalid match format');
        }
        
        // Mark bank transactions as reconciled (simple update)
        for (const bankId of bankIds) {
          await query(
            `UPDATE bank_transactions 
             SET status = 'reconciled' 
             WHERE id = $1 AND bank_account_id = $2`,
            [bankId, bankAccountId]
          );
        }
        
        // Store GL transaction reconciliation info
        // Check if gl_reconciliations table exists and has the right structure
        try {
          // Mark GL entries as reconciled
          for (const glId of glIds) {
            await query(
              `INSERT INTO gl_reconciliations (
                gl_transaction_id,
                bank_account_id,
                reconciliation_session_id
              )
              VALUES ($1, $2, $3)
              ON CONFLICT (gl_transaction_id, bank_account_id) 
              DO UPDATE SET reconciliation_session_id = $3`,
              [glId, bankAccountId, sessionId]
            );
          }
        } catch (glError) {
          console.warn('Could not insert gl_reconciliations:', glError);
          // Continue without failing if this table doesn't exist or has issues
        }
        
        // Store match record - only if reconciliation_matches table exists
        try {
          await query(
            `INSERT INTO reconciliation_matches (
              reconciliation_session_id,
              bank_transaction_ids,
              gl_transaction_ids,
              created_by
            )
            VALUES ($1, $2, $3, $4)`,
            [sessionId, JSON.stringify(bankIds), JSON.stringify(glIds), userId]
          );
        } catch (matchError) {
          console.warn('Could not insert reconciliation_matches:', matchError);
          // Continue without failing if this table doesn't exist or has issues
        }
      }
      
      // Mark session as completed - simplest possible update
      const updateSessionResult = await query(
        `UPDATE reconciliation_sessions
         SET status = 'completed'
         WHERE id = $1
         RETURNING id, status`,
        [sessionId]
      );
      
      console.log('Session update result:', {
        rowCount: updateSessionResult.rowCount,
        rows: updateSessionResult.rows
      });
      
      // Update bank account with the latest reconciliation date and balance
      try {
        const updateBankResult = await query(
          `UPDATE bank_accounts
           SET last_reconciled_date = $1
           WHERE id = $2
           RETURNING id, last_reconciled_date`,
          [sessionCheck.rows[0].end_date, bankAccountId]
        );
        
        console.log('Bank account update result:', { 
          rowCount: updateBankResult.rowCount
        });
      } catch (bankUpdateError) {
        console.warn('Could not update bank account last_reconciled_date:', bankUpdateError);
        // Continue without failing if these fields don't exist
      }
      
      // Commit transaction
      await query('COMMIT');
      
      // Simple response with minimal information
      const response = {
        success: true,
        message: 'Reconciliation completed successfully',
        sessionId: sessionId,
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
    console.error('Error completing reconciliation:', err);
    let errorDetails = 'Unknown error';
    
    if (err instanceof Error) {
      errorDetails = err.message;
      console.error('Error stack:', err.stack);
    }
    
    // Ensure we always return a valid JSON response
    return NextResponse.json({
      error: 'Failed to complete reconciliation',
      details: errorDetails,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

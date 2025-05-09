import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/bank-accounts/reconciliation/active - Get all active reconciliation sessions
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Fetch all active reconciliation sessions with bank account details
    const sessionsQuery = `
      SELECT 
        rs.id,
        rs.bank_account_id,
        rs.start_date,
        rs.end_date,
        rs.created_at,
        ba.name as bank_account_name
      FROM reconciliation_sessions rs
      JOIN bank_accounts ba ON rs.bank_account_id = ba.id
      WHERE rs.status = 'in_progress' AND rs.is_deleted = false
      ORDER BY rs.created_at DESC
    `;
    
    const result = await query(sessionsQuery, []);
    
    return NextResponse.json({
      activeSessions: result.rows,
      count: result.rows.length
    });
  } catch (err) {
    console.error('Error fetching active reconciliation sessions:', err);
    return NextResponse.json({
      error: 'Failed to fetch active reconciliation sessions',
      details: err instanceof Error ? err.message : 'Unknown error'
    }, { status: 500 });
  }
}

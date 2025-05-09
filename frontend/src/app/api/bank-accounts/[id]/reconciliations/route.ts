import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function GET(
  req: NextRequest,
) {
  try {
    const { userId, error: authError } = await authenticateRequest(req);
    if (authError) {
      return authError; // authenticateRequest returns a NextResponse on error
    }

    // Extract bank_account_id from the URL path, e.g., /api/bank-accounts/123/reconciliations -> 123
    const pathnameParts = req.nextUrl.pathname.split('/');
    const bankAccountId = pathnameParts[pathnameParts.length - 2];

    if (!bankAccountId || isNaN(parseInt(bankAccountId, 10))) {
      return NextResponse.json(
        { error: 'Valid Bank account ID is required from path' },
        { status: 400 }
      );
    }

    const sqlQuery = `
      SELECT 
        id, 
        bank_account_id, 
        start_date, 
        end_date, 
        bank_statement_balance, 
        status, 
        created_at, 
        updated_at
      FROM reconciliation_sessions
      WHERE bank_account_id = $1
      ORDER BY end_date DESC;
    `;

    const result = await query(sqlQuery, [bankAccountId]);

    // The query function from @vercel/postgres returns an object with a 'rows' array.
    return NextResponse.json({ sessions: result.rows }, { status: 200 });

  } catch (error) {
    console.error('Error fetching reconciliation sessions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

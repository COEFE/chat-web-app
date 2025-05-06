import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/summary - get summary statistics for journal entries
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');

    // Build query parameters for filtering
    const queryParams = [];
    let paramIndex = 1;
    let dateFilter = '';
    
    if (startDate) {
      dateFilter += ` AND j.date >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      dateFilter += ` AND j.date <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }

    // Get total journals and posted count
    const { rows: journalCounts } = await sql.query(`
      SELECT 
        COUNT(*) as total_journals,
        SUM(CASE WHEN is_posted = TRUE THEN 1 ELSE 0 END) as total_posted
      FROM 
        journals j
      WHERE 
        j.is_deleted = FALSE
        ${dateFilter}
    `, queryParams);
    
    // Get total debits and credits
    const { rows: totals } = await sql.query(`
      SELECT 
        SUM(jl.debit) as total_debits,
        SUM(jl.credit) as total_credits
      FROM 
        journals j
      JOIN
        journal_lines jl ON j.id = jl.journal_id
      WHERE 
        j.is_deleted = FALSE
        ${dateFilter}
    `, queryParams);
    
    // Get top accounts by transaction volume
    const { rows: topAccounts } = await sql.query(`
      SELECT 
        jl.account_id,
        a.code as account_code,
        a.name as account_name,
        SUM(jl.debit + jl.credit) as total_amount
      FROM 
        journals j
      JOIN
        journal_lines jl ON j.id = jl.journal_id
      JOIN
        accounts a ON jl.account_id = a.id
      WHERE 
        j.is_deleted = FALSE
        ${dateFilter}
      GROUP BY
        jl.account_id, a.code, a.name
      ORDER BY
        total_amount DESC
      LIMIT 5
    `, queryParams);
    
    // Compile summary data
    const summaryData = {
      totalJournals: parseInt(journalCounts[0]?.total_journals || '0'),
      totalPosted: parseInt(journalCounts[0]?.total_posted || '0'),
      totalDebits: parseFloat(totals[0]?.total_debits || '0'),
      totalCredits: parseFloat(totals[0]?.total_credits || '0'),
      topAccounts: topAccounts.map(account => ({
        account_id: account.account_id,
        account_code: account.account_code,
        account_name: account.account_name,
        total_amount: parseFloat(account.total_amount)
      }))
    };
    
    return NextResponse.json(summaryData);
  } catch (err: any) {
    console.error('[journals/summary] GET error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

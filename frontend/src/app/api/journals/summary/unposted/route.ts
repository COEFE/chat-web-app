import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/summary/unposted - get summary of unposted journal entries
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get summary statistics of unposted journals
    const result = await sql`
      SELECT 
        COUNT(*) as total_count,
        SUM(COALESCE(
          (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id), 
          0
        )) as total_debits,
        SUM(COALESCE(
          (SELECT SUM(credit) FROM journal_lines WHERE journal_id = j.id), 
          0
        )) as total_credits,
        MIN(j.transaction_date) as earliest_date,
        MAX(j.transaction_date) as latest_date,
        COUNT(DISTINCT journal_type) as journal_type_count,
        json_agg(DISTINCT journal_type) as journal_types,
        ARRAY_AGG(j.id) as journal_ids
      FROM journals j
      WHERE j.is_posted = false AND j.is_deleted = false
    `;

    // Get the latest 5 unposted journals for a preview
    const recentJournals = await sql`
      SELECT 
        j.id, 
        j.memo, 
        j.transaction_date, 
        j.journal_type,
        (SELECT COUNT(*) FROM journal_lines WHERE journal_id = j.id) as line_count,
        (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id) as total_debit
      FROM journals j
      WHERE j.is_posted = false AND j.is_deleted = false
      ORDER BY j.transaction_date DESC, j.id DESC
      LIMIT 5
    `;

    // Prepare response with summary data and recent journals
    const summary = result.rows[0];
    
    return NextResponse.json({
      summary: {
        totalCount: parseInt(summary.total_count) || 0,
        totalDebits: parseFloat(summary.total_debits) || 0,
        totalCredits: parseFloat(summary.total_credits) || 0,
        earliestDate: summary.earliest_date,
        latestDate: summary.latest_date,
        journalTypes: summary.journal_types || [],
        averageAmount: parseInt(summary.total_count) > 0 
          ? (parseFloat(summary.total_debits) / parseInt(summary.total_count)).toFixed(2) 
          : 0,
        journalIds: summary.journal_ids || []
      },
      recentUnpostedJournals: recentJournals.rows
    });
  } catch (error) {
    console.error('[api/journals/summary/unposted] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve unposted journals summary' },
      { status: 500 }
    );
  }
}

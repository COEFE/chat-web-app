import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/recurring - fetch recurring journal entries
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if recurring_journals table exists
    try {
      await sql`SELECT 1 FROM recurring_journals LIMIT 1`;
    } catch (err: any) {
      if (err.message.includes('relation "recurring_journals" does not exist')) {
        return NextResponse.json({
          error: 'Recurring journals table does not exist. Please set up first.',
          setupRequired: true
        }, { status: 404 });
      }
      throw err;
    }

    // Parse query parameters
    const url = new URL(req.url);
    const isActive = url.searchParams.get('isActive');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Build query with filters
    let query = `
      SELECT 
        rj.id, 
        rj.journal_id,
        rj.frequency,
        rj.start_date,
        rj.end_date,
        rj.day_of_month,
        rj.day_of_week,
        rj.last_generated,
        rj.is_active,
        rj.created_by,
        rj.created_at,
        j.memo,
        j.source,
        j.date as original_date,
        SUM(jl.debit) as total_amount
      FROM 
        recurring_journals rj
      JOIN 
        journals j ON rj.journal_id = j.id
      LEFT JOIN 
        journal_lines jl ON j.id = jl.journal_id
      WHERE 
        j.is_deleted = FALSE
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    if (isActive === 'true' || isActive === 'false') {
      query += ` AND rj.is_active = $${paramIndex}`;
      queryParams.push(isActive === 'true');
      paramIndex++;
    }
    
    query += ` GROUP BY rj.id, rj.journal_id, j.memo, j.source, j.date ORDER BY rj.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Execute query
    const { rows: recurringJournals } = await sql.query(query, queryParams);
    
    // Get total count for pagination
    const { rows: countResult } = await sql.query(
      'SELECT COUNT(*) AS total FROM recurring_journals',
      []
    );
    
    return NextResponse.json({ 
      recurringJournals, 
      total: parseInt(countResult[0].total, 10),
      limit,
      offset
    });
  } catch (err: any) {
    console.error('[journals/recurring] GET error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/journals/recurring - create a new recurring journal entry
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if recurring_journals table exists
    try {
      await sql`SELECT 1 FROM recurring_journals LIMIT 1`;
    } catch (err: any) {
      if (err.message.includes('relation "recurring_journals" does not exist')) {
        return NextResponse.json({
          error: 'Recurring journals table does not exist. Please set up first.',
          setupRequired: true
        }, { status: 404 });
      }
      throw err;
    }

    const body = await req.json();
    const { 
      journalId, 
      frequency, 
      startDate, 
      endDate, 
      dayOfMonth, 
      dayOfWeek 
    } = body;
    
    // Validate request
    if (!journalId || !frequency || !startDate) {
      return NextResponse.json({ 
        error: 'Invalid recurring journal. Required: journalId, frequency, startDate.' 
      }, { status: 400 });
    }
    
    // Check if journal exists and is not deleted
    const { rows: journalRows } = await sql`
      SELECT id FROM journals WHERE id = ${journalId} AND is_deleted = FALSE
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    // Convert dayOfMonth or dayOfWeek to integer if provided
    const dayOfMonthInt = dayOfMonth ? parseInt(dayOfMonth, 10) : null;
    const dayOfWeekInt = dayOfWeek ? parseInt(dayOfWeek, 10) : null;
    
    // Insert recurring journal
    const { rows: recurringJournalRows } = await sql`
      INSERT INTO recurring_journals (
        journal_id,
        frequency,
        start_date,
        end_date,
        day_of_month,
        day_of_week,
        created_by
      )
      VALUES (
        ${journalId},
        ${frequency},
        ${startDate},
        ${endDate || null},
        ${dayOfMonthInt},
        ${dayOfWeekInt},
        ${userId}
      )
      RETURNING id
    `;
    
    const recurringJournalId = recurringJournalRows[0].id;
    
    return NextResponse.json({ 
      success: true, 
      recurring_journal_id: recurringJournalId,
      message: 'Recurring journal entry created successfully' 
    });
  } catch (err: any) {
    console.error('[journals/recurring] POST error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

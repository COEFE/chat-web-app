import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/recurring/[id] - fetch a specific recurring journal entry
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

    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Fetch recurring journal with related journal details
    const { rows } = await sql`
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
        rj.id = ${id}
      GROUP BY 
        rj.id, rj.journal_id, j.memo, j.source, j.date
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Recurring journal entry not found' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (err: any) {
    console.error('[journals/recurring/[id]] GET error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// PATCH /api/journals/recurring/[id] - update a recurring journal entry
export async function PATCH(req: NextRequest) {
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

    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Check if recurring journal exists
    const { rows: existingRows } = await sql`
      SELECT id FROM recurring_journals WHERE id = ${id}
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'Recurring journal entry not found' }, { status: 404 });
    }

    const body = await req.json();
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    // Only allow specific fields to be updated
    const allowedFields = ['frequency', 'start_date', 'end_date', 'day_of_month', 'day_of_week', 'is_active'];
    
    for (const [key, value] of Object.entries(body)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        updateValues.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Build and execute the update query
    const updateQuery = `
      UPDATE recurring_journals 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING id
    `;
    updateValues.push(id);

    const { rows } = await sql.query(updateQuery, updateValues);

    return NextResponse.json({ 
      success: true, 
      id: rows[0].id,
      message: 'Recurring journal entry updated successfully' 
    });
  } catch (err: any) {
    console.error('[journals/recurring/[id]] PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE /api/journals/recurring/[id] - delete a recurring journal entry
export async function DELETE(req: NextRequest) {
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

    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Check if recurring journal exists
    const { rows: existingRows } = await sql`
      SELECT id FROM recurring_journals WHERE id = ${id}
    `;

    if (existingRows.length === 0) {
      return NextResponse.json({ error: 'Recurring journal entry not found' }, { status: 404 });
    }

    // Delete the recurring journal
    await sql`DELETE FROM recurring_journals WHERE id = ${id}`;

    return NextResponse.json({ 
      success: true, 
      message: 'Recurring journal entry deleted successfully' 
    });
  } catch (err: any) {
    console.error('[journals/recurring/[id]] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

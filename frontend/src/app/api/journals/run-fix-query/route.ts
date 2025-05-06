import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// API endpoint to run a SQL query directly to fix database issues
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;
  
  try {
    // Parse the request body
    const body = await req.json();
    const sqlQuery = body.sql;
    
    if (!sqlQuery) {
      return NextResponse.json({ error: 'SQL query is required' }, { status: 400 });
    }
    
    // Execute the fix query
    console.log('Executing fix query:', sqlQuery);
    await sql.query(sqlQuery);
    
    // Run a test query to check if journal_lines table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_lines'
      ) as exists;
    `;
    
    // Check if there are any triggers on the journal_lines table
    const triggerCheck = await sql`
      SELECT trigger_name 
      FROM information_schema.triggers 
      WHERE event_object_table = 'journal_lines';
    `;
    
    return NextResponse.json({ 
      success: true, 
      message: 'Fix query executed successfully',
      table_exists: tableCheck.rows[0]?.exists,
      triggers: triggerCheck.rows.map(row => row.trigger_name)
    });
  } catch (err: any) {
    console.error('[run-fix-query] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Failed to execute fix query' 
    }, { status: 500 });
  }
}

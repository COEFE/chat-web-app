import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // Ensure table exists first
  try {
    const { POST } = await import('./db-setup/route');
    await POST(req);
  } catch (e) {
    console.error('[gl-transactions] db-setup error', e);
    // Continue anyway, as the table might already exist
  }

  try {
    // Handle potential errors with the query more gracefully
    const { rows } = await sql`
      SELECT 
        id, 
        data, 
        inserted_at,
        content
      FROM gl_transactions 
      WHERE user_id = ${userId} 
      ORDER BY inserted_at DESC 
      LIMIT 100;
    `;
    
    // Transform the data to ensure it's in the expected format
    const items = rows.map(row => ({
      id: row.id,
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      inserted_at: row.inserted_at,
      content: row.content
    }));
    
    return NextResponse.json({ items });
  } catch (e) {
    console.error('[gl-transactions] fetch error', e);
    return NextResponse.json({ 
      error: 'Failed to fetch GL transactions', 
      details: e instanceof Error ? e.message : 'Unknown error'
    }, { status: 500 });
  }
}

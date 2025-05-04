import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

export async function GET(req: NextRequest) {
  // Authenticate user
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Fetch budget entries for this user
    const { rows } = await sql`
      SELECT id, period, memo, amount
      FROM budget_embeddings
      WHERE user_id = ${userId}
      ORDER BY period;
    `;
    return NextResponse.json({ items: rows }, { status: 200 });
  } catch (err: any) {
    console.error('[api/budget] List error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch budget items' },
      { status: 500 }
    );
  }
}

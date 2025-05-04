import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const { rows } = await sql`SELECT id, data, inserted_at FROM gl_transactions WHERE user_id = ${userId} ORDER BY inserted_at DESC LIMIT 100;`;
    return NextResponse.json({ items: rows });
  } catch (e) {
    console.error('[gl-transactions] fetch error', e);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

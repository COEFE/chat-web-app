import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/clear-budget – truncate budget_embeddings table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    await sql`TRUNCATE budget_embeddings RESTART IDENTITY;`;
    return NextResponse.json({ success: true, message: 'Budget entries cleared' });
  } catch (err: any) {
    console.error('[clear-budget] Error truncating table:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

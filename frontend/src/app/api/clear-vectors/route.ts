import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/clear-vectors – truncate vector tables for testing
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Remove all entries and reset IDs
    await sql`TRUNCATE gl_transactions, gl_embeddings RESTART IDENTITY;`;
    return NextResponse.json({ success: true, message: 'Vector tables cleared' });
  } catch (err: any) {
    console.error('[clear-vectors] Error truncating tables:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

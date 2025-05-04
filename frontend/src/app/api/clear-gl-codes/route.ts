import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/clear-gl-codes – truncate GL codes table for testing
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    await sql`TRUNCATE gl_embeddings RESTART IDENTITY;`;
    return NextResponse.json({ success: true, message: 'GL codes cleared' });
  } catch (err: any) {
    console.error('[clear-gl-codes] Error truncating table:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/clear-gl-transactions – truncate GL transactions table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    await sql`TRUNCATE gl_transactions RESTART IDENTITY;`;
    return NextResponse.json({ success: true, message: 'GL transactions cleared' });
  } catch (err: any) {
    console.error('[clear-gl-transactions] Error truncating table:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

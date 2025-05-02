import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { generateEmbedding } from '@/lib/glUtils';
import { sql } from '@vercel/postgres';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  // 1) authenticate user
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // 1b) ensure DB extension/table exist
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    await sql`
      CREATE TABLE IF NOT EXISTS budget_embeddings (
        id uuid PRIMARY KEY,
        user_id varchar(255) NOT NULL,
        period varchar(255) NOT NULL,
        memo text NOT NULL,
        amount numeric NOT NULL,
        embedding vector(1536)
      );
    `;
  } catch (setupErr: any) {
    console.error('[api/budget/ingest] DB setup error:', setupErr);
    return NextResponse.json(
      { error: 'Database table setup failed.' },
      { status: 500 }
    );
  }

  // 2) parse structured items
  const { items } = await req.json();
  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ error: 'Items array is required.' }, { status: 400 });
  }

  // 3) generate embeddings and insert
  const inserted = [] as any[];
  for (const it of items) {
    const text = `Period: ${it.period}; Memo: ${it.memo}; Amount: ${it.amount}`;
    const emb = await generateEmbedding(text);
    if (!emb) continue;
    const vector = '[' + emb.join(',') + ']';
    await sql`
      INSERT INTO budget_embeddings (id, user_id, period, memo, amount, embedding)
      VALUES (${uuidv4()}, ${userId}, ${it.period}, ${it.memo}, ${it.amount}, ${vector}::vector)
    `;
    inserted.push(it);
  }

  return NextResponse.json({ inserted }, { status: 200 });
}

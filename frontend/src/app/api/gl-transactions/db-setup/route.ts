import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { NextRequest, NextResponse } from 'next/server';

// Ensures pgvector, table, and indexes exist for GL transactions
export async function POST(request: NextRequest) {
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    // 1. Enable vector extension
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;

    // 2. Main table – flexible JSONB schema per row + embedding
    await sql`CREATE TABLE IF NOT EXISTS gl_transactions (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(128) NOT NULL,
      data JSONB NOT NULL,
      content TEXT NOT NULL,
      embedding VECTOR(1536),
      inserted_at TIMESTAMPTZ DEFAULT NOW()
    );`;

    // 3. Indexes for perf
    await sql`CREATE INDEX IF NOT EXISTS idx_gl_txn_user ON gl_transactions(user_id);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_gl_txn_content_gin ON gl_transactions USING gin(to_tsvector('english', content));`;

    // 4. Vector index (best-effort)
    try {
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_gl_txn_embedding_cosine') THEN
            CREATE INDEX idx_gl_txn_embedding_cosine ON gl_transactions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
          END IF;
        END$$;`;
    } catch (e) {
      console.warn('[gl-transactions/db-setup] vector index skipped', e);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[gl-transactions/db-setup] Error:', err);
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
  }
}

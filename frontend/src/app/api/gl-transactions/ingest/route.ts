import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import OpenAI from 'openai';
import { POST as dbSetup } from '../db-setup/route';

interface TxnRow {
  [key: string]: any;
}

export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // Ensure table exists
  const setupRes = await dbSetup(req);
  if (setupRes.status !== 200) return setupRes;

  const { rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows must be non-empty array' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OPENAI_API_KEY not set' }, { status: 500 });
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const inserted: number[] = [];
  const skipped: { idx: number; reason: string }[] = [];
  const dedupeThreshold = 0.15; // cosine distance threshold for duplicates

  for (let i = 0; i < rows.length; i++) {
    const row: TxnRow = rows[i];

    // Flatten row to content string "key: value" etc.
    const content = Object.entries(row)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('\n');

    // Generate embedding
    let embedding: number[] | null = null;
    try {
      const resp = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: content,
        encoding_format: 'float',
      });
      embedding = resp.data?.[0]?.embedding ?? null;
    } catch (e) {
      console.error('[gl-transactions/ingest] embedding error', e);
    }

    // Dedupe: if embedding exists, check nearest existing for user
    if (embedding) {
      const vectorLit = `[${embedding.join(',')}]`;
      try {
        const { rows: matches } = await sql`
          SELECT id, embedding <=> ${vectorLit}::vector AS dist
          FROM gl_transactions
          WHERE user_id = ${userId} AND embedding IS NOT NULL
          ORDER BY dist ASC
          LIMIT 1;`;
        if (matches.length > 0 && matches[0].dist <= dedupeThreshold) {
          skipped.push({ idx: i, reason: 'duplicate' });
          continue;
        }
      } catch (e) {
        console.warn('[gl-transactions/ingest] dedupe query failed', e);
      }
    }

    // Insert row
    try {
      await sql`
        INSERT INTO gl_transactions (user_id, data, content, embedding)
        VALUES (${userId}, ${row as any}, ${content}, ${embedding ? JSON.stringify(embedding) : null}::vector);
      `;
      inserted.push(i);
    } catch (e) {
      console.error('[gl-transactions/ingest] insert error', e);
      skipped.push({ idx: i, reason: 'db error' });
    }
  }

  return NextResponse.json({ success: true, insertedCount: inserted.length, skipped });
}

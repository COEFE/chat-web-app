import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/accounts – fetch chart of accounts
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const { rows } = await sql`
      SELECT
        a.id,
        a.code,
        a.name,
        a.parent_id,
        p.code AS parent_code,
        a.notes,
        a.is_custom,
        a.account_type
      FROM accounts a
      LEFT JOIN accounts p ON p.id = a.parent_id
      ORDER BY a.code
    `;
    return NextResponse.json({ accounts: rows });
  } catch (err: any) {
    console.error('[accounts] GET error:', err);
    if (err instanceof Error && err.message.includes('relation "accounts" does not exist')) {
      return NextResponse.json({
        error: 'Accounts table does not exist. Please set up first.',
        setupRequired: true
      }, { status: 404 });
    }
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// POST /api/accounts – create a custom account
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    // Bulk import GL codes
    if (body.glCodes && Array.isArray(body.glCodes)) {
      const results: any[] = [];
      for (const gl of body.glCodes) {
        const { code: acctCode, description, notes } = gl;
        if (!acctCode || !description) {
          results.push({ code: acctCode, status: 'error', message: 'Code and description required' });
          continue;
        }
        try {
          await sql`
            INSERT INTO accounts (code, name, parent_id, notes, is_custom)
            VALUES (
              ${acctCode},
              ${description},
              NULL,
              ${notes ?? null},
              TRUE
            ) ON CONFLICT (code) DO UPDATE
            SET name = EXCLUDED.name, notes = EXCLUDED.notes
          `;
          results.push({ code: acctCode, status: 'success' });
        } catch (e: any) {
          results.push({ code: acctCode, status: 'error', message: e.message });
        }
      }
      return NextResponse.json({ results });
    }
    // Single account creation
    const { code, name, notes, parent_id } = body;
    if (!code || !name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 });
    }
    const { rows } = await sql`
      INSERT INTO accounts (code, name, parent_id, notes, is_custom)
      VALUES (
        ${code},
        ${name},
        ${parent_id ?? null},
        ${notes ?? null},
        TRUE
      )
      RETURNING id, code, name, parent_id, notes, is_custom
    `;
    return NextResponse.json({ account: rows[0] });
  } catch (err: any) {
    console.error('[accounts] POST error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

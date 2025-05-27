import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/debug/schema-check – check database schema
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if accounts table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'accounts'
      ) as table_exists;
    `;

    const tableExists = tableCheck.rows[0]?.table_exists;

    if (!tableExists) {
      return NextResponse.json({
        status: 'accounts_table_missing',
        message: 'Accounts table does not exist',
        recommendation: 'Run /api/accounts/db-setup to create the table'
      });
    }

    // Check accounts table schema
    const schemaCheck = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' 
      AND table_name = 'accounts'
      ORDER BY ordinal_position;
    `;

    // Check if there are any accounts
    const countCheck = await sql`
      SELECT COUNT(*) as account_count FROM accounts;
    `;

    return NextResponse.json({
      status: 'success',
      table_exists: true,
      schema: schemaCheck.rows,
      account_count: countCheck.rows[0]?.account_count || 0,
      message: 'Schema check completed successfully'
    });

  } catch (err: any) {
    console.error('[debug/schema-check] Error:', err);
    return NextResponse.json({ 
      status: 'error',
      error: err.message,
      code: err.code || 'unknown'
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/journals/check-schema - check database schema
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check journal_lines table structure
    const journalLinesCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journal_lines' AND column_name = 'line_number') as has_line_number,
        EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
        EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
        EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns 
                WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
        EXISTS (SELECT 1 FROM information_schema.tables 
                WHERE table_name = 'journal_types') as has_journal_types_table
    `;

    return NextResponse.json({ 
      schema: journalLinesCheck.rows[0],
      message: 'Schema check completed'
    });
  } catch (error: any) {
    console.error('Error checking schema:', error);
    return NextResponse.json(
      { error: 'Error checking schema: ' + error.message },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/journals/recurring/db-setup - set up recurring journals table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if journals table exists first
    try {
      await sql`SELECT 1 FROM journals LIMIT 1`;
    } catch (err: any) {
      if (err.message.includes('relation "journals" does not exist')) {
        return NextResponse.json({
          error: 'Journals table does not exist. Please set up journals first.',
          setupRequired: true
        }, { status: 404 });
      }
      throw err;
    }

    // Create recurring_journals table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS recurring_journals (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER NOT NULL REFERENCES journals(id),
        frequency VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        day_of_month INTEGER,
        day_of_week INTEGER,
        last_generated DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create index for performance
    await sql`
      CREATE INDEX IF NOT EXISTS idx_recurring_journals_journal_id ON recurring_journals(journal_id);
    `;

    // Create index for active recurring journals
    await sql`
      CREATE INDEX IF NOT EXISTS idx_recurring_journals_active ON recurring_journals(is_active);
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'Recurring journals table created successfully' 
    });
  } catch (err: any) {
    console.error('[recurring-journals/db-setup] POST error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

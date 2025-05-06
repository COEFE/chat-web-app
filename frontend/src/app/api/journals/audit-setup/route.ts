import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// POST /api/journals/audit-setup - Initialize or fix the journal_audit table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Read the migration SQL file
    const migrationFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'journals', 'migrations', 'add-journal-audit-columns.sql');
    let migrationSql = '';
    
    try {
      migrationSql = fs.readFileSync(migrationFilePath, 'utf8');
    } catch (readErr) {
      console.error('Error reading migration file:', readErr);
      return NextResponse.json({ 
        error: 'Could not read migration file', 
        details: readErr instanceof Error ? readErr.message : String(readErr)
      }, { status: 500 });
    }

    // Execute the migration script
    await sql.query(migrationSql);

    // Verify the table and required columns exist
    const { rows: columns } = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'journal_audit'
    `;

    const columnNames = columns.map(c => c.column_name);

    return NextResponse.json({ 
      success: true, 
      message: 'Journal audit table setup complete',
      columns: columnNames
    });
  } catch (err) {
    console.error('Error setting up journal_audit table:', err);
    return NextResponse.json({ 
      error: 'Failed to set up journal audit table', 
      details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}

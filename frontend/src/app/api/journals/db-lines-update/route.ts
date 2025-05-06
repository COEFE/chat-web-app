import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import path from 'path';

// POST /api/journals/db-lines-update - update the journal_lines table structure
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Read the migration script
    const migrationScript = readFileSync(
      path.join(process.cwd(), 'src/app/api/db-migrations/journal-lines-update.sql'),
      'utf-8'
    );

    // Execute the migration script
    await sql.query(migrationScript);

    return NextResponse.json({ 
      success: true, 
      message: 'Journal lines table structure updated successfully'
    });
  } catch (error: any) {
    console.error('Error updating journal lines table structure:', error);
    return NextResponse.json(
      { error: 'Error updating journal lines table: ' + error.message },
      { status: 500 }
    );
  }
}

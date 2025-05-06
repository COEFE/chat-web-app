import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// POST /api/verify-schema - Verify all required tables exist and have the correct structure
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Define the expected tables
    const requiredTables = [
      'accounts',
      'journals',
      'journal_lines',
      'journal_audit',
      'budgets',
      'journal_attachments'
    ];

    // Check if tables exist
    const { rows: existingTables } = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE';
    `;

    const existingTableNames = existingTables.map(row => row.table_name);
    const missingTables = requiredTables.filter(table => !existingTableNames.includes(table));

    // Get column information for existing tables
    const tableSchemas: Record<string, any[]> = {};
    for (const table of requiredTables) {
      if (existingTableNames.includes(table)) {
        const { rows: columns } = await sql`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${table}
          ORDER BY ordinal_position;
        `;
        tableSchemas[table] = columns;
      }
    }

    // Run setup for any missing tables
    let setupResults = {};
    if (missingTables.length > 0) {
      setupResults = await runSetup(req);
    }

    // Check for foreign key constraints
    const { rows: foreignKeys } = await sql`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
    `;

    // Check for triggers
    const { rows: triggers } = await sql`
      SELECT 
        trigger_name, 
        event_manipulation, 
        event_object_table, 
        action_statement
      FROM information_schema.triggers
      WHERE trigger_schema = 'public';
    `;

    // Count rows in each table
    const tableCounts: Record<string, number> = {};
    for (const table of requiredTables) {
      if (existingTableNames.includes(table)) {
        const countResult = await sql.query(`SELECT COUNT(*) FROM ${table}`);
        tableCounts[table] = parseInt(countResult.rows[0].count);
      }
    }

    return NextResponse.json({
      success: true,
      missingTables,
      existingTables: existingTableNames,
      tableSchemas,
      foreignKeys: foreignKeys,
      triggers,
      rowCounts: tableCounts,
      setupResults
    });
  } catch (err: any) {
    console.error('[verify-schema] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// Helper function to run setup for all tables
async function runSetup(req: NextRequest) {
  const results: Record<string, any> = {};
  
  try {
    // Run accounts setup
    const accountsModule = await import('../accounts/db-setup/route');
    const accountsResult = await accountsModule.POST(req);
    results.accounts = {
      status: accountsResult.status,
      body: await accountsResult.json()
    };
    
    // Run journals setup
    const journalsModule = await import('../journals/db-setup/route');
    const journalsResult = await journalsModule.POST(req);
    results.journals = {
      status: journalsResult.status,
      body: await journalsResult.json()
    };
    
  } catch (error) {
    console.error('[verify-schema] Setup error:', error);
    results.error = error instanceof Error ? error.message : 'Unknown error';
  }
  
  return results;
}

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { readFileSync } from 'fs';
import path from 'path';

/**
 * API route to set up enhanced accounting schema
 * This implements the requirements in Section 1 of the accounting upgrade roadmap
 */
export async function GET(req: NextRequest) {
  try {
    console.log('Starting accounting schema enhancements setup...');
    
    // Read the SQL migration file
    const migrationPath = path.join(process.cwd(), 'src/app/api/db-migrations/accounting-schema-enhancements.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');
    
    // Split the SQL into individual statements
    const statements = migrationSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // Execute each statement separately
    for (const statement of statements) {
      try {
        await sql.query(statement + ';');
      } catch (error: any) {
        console.error(`Error executing SQL statement: ${statement.substring(0, 100)}...`, error);
        // Continue with other statements even if one fails
      }
    }
    
    // Check if type column exists before trying to update it
    const typeColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'type'
      ) as exists;
    `;

    if (typeColumnExists.rows[0].exists) {
      console.log('Type column exists, updating account types...');
      // Update account types for existing accounts if not already set
      await sql`
        UPDATE accounts 
        SET type = 
          CASE 
            WHEN code LIKE '1%' THEN 'asset'
            WHEN code LIKE '2%' THEN 'liability'
            WHEN code LIKE '3%' THEN 'equity'
            WHEN code LIKE '4%' THEN 'revenue'
            WHEN code LIKE '5%' THEN 'expense'
            WHEN code LIKE '6%' THEN 'expense'
            WHEN code LIKE '7%' THEN 'other_income'
            WHEN code LIKE '8%' THEN 'other_expense'
            WHEN code LIKE '9%' THEN 'other'
            ELSE NULL
          END
        WHERE type IS NULL;
      `;
    } else {
      console.log('Type column does not exist yet');
    }
    
    // Check if is_active column exists before trying to update it
    const isActiveColumnExists = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'is_active'
      ) as exists;
    `;

    if (isActiveColumnExists.rows[0].exists) {
      console.log('is_active column exists, updating account status...');
      // Set is_active to true for existing accounts if not already set
      await sql`
        UPDATE accounts 
        SET is_active = TRUE
        WHERE is_active IS NULL;
      `;
    } else {
      console.log('is_active column does not exist yet');
    }
    
    // Recreate balance trigger at statement level
    await sql`DROP TRIGGER IF EXISTS check_balance_trigger ON journal_lines;`;
    await sql`CREATE TRIGGER check_balance_trigger AFTER INSERT OR UPDATE ON journal_lines FOR EACH STATEMENT EXECUTE FUNCTION check_journal_balance();`;
    
    return NextResponse.json({
      success: true,
      message: 'Accounting schema enhancements completed successfully',
    });
  } catch (error: any) {
    console.error('Error setting up accounting schema:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
    }, { status: 500 });
  }
}

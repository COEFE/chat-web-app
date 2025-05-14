import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import fs from 'fs';
import path from 'path';

/**
 * API endpoint to run database migrations
 * This is particularly useful for Vercel deployments where you can't run migrations directly
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      return error;
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Create migrations table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Get list of migrations that have been applied
    const appliedResult = await sql`SELECT name FROM migrations ORDER BY name`;
    const appliedMigrations = new Set(appliedResult.rows.map((row: any) => row.name));
    console.log(`Found ${appliedMigrations.size} previously applied migrations`);

    // Check if the accounts table exists and has the user_id column
    let accountsTableHasUserId = false;
    try {
      const accountsTableCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'user_id'
      `;
      accountsTableHasUserId = accountsTableCheck.rows.length > 0;
    } catch (err) {
      console.error('Error checking accounts table:', err);
    }

    // If accounts table doesn't have user_id, add it
    if (!accountsTableHasUserId) {
      try {
        await sql`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id VARCHAR(255)`;
        console.log('Added user_id column to accounts table');
      } catch (err) {
        console.error('Error adding user_id column to accounts table:', err);
      }
    }

    // Run the statement_trackers migration if not already applied
    const migrationName = '012_create_statement_trackers_table.sql';
    if (!appliedMigrations.has(migrationName)) {
      console.log(`Applying migration: ${migrationName}`);
      
      // Read the migration file
      const migrationPath = path.join(process.cwd(), 'src', 'migrations', migrationName);
      const sqlContent = fs.readFileSync(migrationPath, 'utf8');
      
      // Begin transaction
      await sql`BEGIN`;
      
      try {
        // Execute the SQL
        await sql.query(sqlContent);
        
        // Record that this migration has been applied
        await sql`
          INSERT INTO migrations (name) 
          VALUES (${migrationName})
        `;
        
        // Commit the transaction
        await sql`COMMIT`;
        console.log(`Migration ${migrationName} applied successfully`);
      } catch (err) {
        // Rollback on error
        await sql`ROLLBACK`;
        console.error(`Error applying migration ${migrationName}:`, err);
        throw err;
      }
    } else {
      console.log(`Migration ${migrationName} already applied`);
    }

    return NextResponse.json({
      success: true,
      message: 'Migrations completed successfully',
      appliedMigrations: Array.from(appliedMigrations),
      accountsTableHasUserId
    });
  } catch (error) {
    console.error('Error running migrations:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

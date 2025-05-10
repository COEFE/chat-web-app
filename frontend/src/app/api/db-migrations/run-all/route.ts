import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import fs from 'fs';
import path from 'path';
import * as sql from '@/lib/db';

// Helper function to run migrations in a transaction
async function runMigrationFile(migrationFile: string): Promise<string> {
  const migrationsDir = path.join(process.cwd(), 'src', 'migrations');
  const filePath = path.join(migrationsDir, migrationFile);
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file ${migrationFile} not found at ${filePath}`);
  }
  
  // Read and execute the SQL file
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  
  try {
    // Begin transaction
    await sql.query('BEGIN');
    
    // Execute the SQL
    await sql.query(sqlContent);
    
    // Record that we've applied this migration
    await sql.query('INSERT INTO migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [migrationFile]);
    
    // Commit the transaction
    await sql.query('COMMIT');
    return `Successfully applied migration: ${migrationFile}`;
  } catch (error) {
    // If there's an error, roll back the transaction
    await sql.query('ROLLBACK');
    console.error(`Error applying migration ${migrationFile}:`, error);
    throw error;
  }
}

// POST /api/db-migrations/run-all - Run all pending database migrations
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Create migrations table if it doesn't exist
    await sql.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get list of migrations that have been applied
    const appliedResult = await sql.query('SELECT name FROM migrations ORDER BY name');
    const appliedMigrations = new Set((appliedResult.rows || []).map((row: any) => row.name));

    // Get all migration files
    const migrationsDir = path.join(process.cwd(), 'src', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      return NextResponse.json({ 
        error: `Migrations directory not found at ${migrationsDir}`,
      }, { status: 404 });
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to ensure migrations run in the correct order

    // Run migrations that haven't been applied yet
    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        try {
          const result = await runMigrationFile(file);
          results.push({ file, success: true, message: result });
          successCount++;
        } catch (err: any) {
          results.push({ 
            file, 
            success: false, 
            error: err.message || 'Unknown error' 
          });
          errorCount++;
        }
      } else {
        results.push({ file, success: true, message: 'Already applied', skipped: true });
      }
    }

    return NextResponse.json({ 
      success: errorCount === 0,
      message: `Ran ${migrationFiles.length} migrations: ${successCount} succeeded, ${errorCount} failed, ${migrationFiles.length - successCount - errorCount} skipped`,
      results
    });
  } catch (err: any) {
    console.error('[db-migrations/run-all] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Unknown error',
      details: err.stack
    }, { status: 500 });
  }
}

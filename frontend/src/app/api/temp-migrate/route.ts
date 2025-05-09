import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// This is a temporary endpoint for development use only
// It allows running migrations without authentication
// IMPORTANT: Delete this file after migrations are complete

export async function GET(req: NextRequest) {
  // This simple secret prevents casual access
  const url = new URL(req.url);
  const secretKey = url.searchParams.get('key');
  
  if (secretKey !== 'temp-migration-dev') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const migrationFile = url.searchParams.get('file');
    
    if (!migrationFile) {
      // List available migration files if no specific file requested
      const migrationsDir = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations');
      const files = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();
      
      return NextResponse.json({ 
        availableMigrations: files
      });
    }
    
    // Security check - only allow .sql files from the migrations directory
    if (!migrationFile.endsWith('.sql') || migrationFile.includes('/') || migrationFile.includes('\\')) {
      return NextResponse.json({ error: 'Invalid migration file name' }, { status: 400 });
    }
    
    // Get the full path to the migration file
    const migrationPath = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations', migrationFile);
    
    // Check if the file exists
    if (!fs.existsSync(migrationPath)) {
      return NextResponse.json({ error: `Migration file ${migrationFile} not found` }, { status: 404 });
    }
    
    // Read the migration file
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration script
    await sql.query(migrationSql);
    
    return NextResponse.json({ 
      success: true, 
      message: `Migration ${migrationFile} executed successfully` 
    });
  } catch (err: any) {
    console.error('[temp-migrate] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Unknown error',
      details: err.stack
    }, { status: 500 });
  }
}

import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/db-migrations/run - Run a database migration script
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get the migration file name from the request
    const { migrationFile } = await req.json();
    
    if (!migrationFile) {
      return NextResponse.json({ error: 'Migration file name is required' }, { status: 400 });
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
    console.error('[db-migrations/run] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Unknown error',
      details: err.stack
    }, { status: 500 });
  }
}

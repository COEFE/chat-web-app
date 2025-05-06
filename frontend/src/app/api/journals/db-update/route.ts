import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';

// Execute the database update for journals table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Read the SQL migration file
    const migrationFilePath = path.join(process.cwd(), 'src', 'app', 'api', 'db-migrations', 'journals-structure-update.sql');
    
    console.log('Running journals structure update migration...');
    console.log('Migration file path:', migrationFilePath);
    
    let migrationScript: string;
    
    try {
      migrationScript = fs.readFileSync(migrationFilePath, 'utf8');
    } catch (readError) {
      console.error('Error reading migration file:', readError);
      return NextResponse.json({ error: 'Error reading migration file' }, { status: 500 });
    }
    
    // Execute the migration script
    await sql.query(migrationScript);
    
    console.log('Journal structure update migration completed');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Journal structure updated successfully'
    });
  } catch (e) {
    console.error('Error updating journal structure:', e);
    return NextResponse.json({ 
      error: 'Failed to update journal structure', 
      details: e instanceof Error ? e.message : String(e) 
    }, { status: 500 });
  }
}

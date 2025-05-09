import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin } from '@/lib/firebaseAdminConfig';

/**
 * API endpoint to add new fields to journal_lines table: category, location, vendor, funder
 * POST /api/journals/add-line-fields
 */
export async function POST(req: NextRequest) {
  console.log("[add-line-fields] Migration started");
  
  try {
    // Initialize Firebase Admin if needed
    if (!admin.apps.length) {
      initializeFirebaseAdmin();
    }
    
    // Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required: Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    
    const token = authHeader.split('Bearer ')[1];
    let userId;
    
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      userId = decodedToken.uid;
      console.log('[add-line-fields] User authenticated:', userId);
    } catch (authError) {
      console.error('[add-line-fields] Authentication failed:', authError);
      return NextResponse.json(
        { error: 'Authentication failed: Invalid token' },
        { status: 401 }
      );
    }
    
    // Read the SQL migration file
    const migrationPath = path.join(process.cwd(), 'src/app/api/db-migrations/add-journal-line-fields.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    
    // Run the migration
    await sql.query(migrationSql);
    
    // Verify the columns were added by checking the schema
    const { rows: columns } = await sql`
      SELECT 
        column_name 
      FROM 
        information_schema.columns 
      WHERE 
        table_name = 'journal_lines' AND 
        column_name IN ('category', 'location', 'vendor', 'funder')
    `;
    
    const addedColumns = columns.map(c => c.column_name);
    
    return NextResponse.json({
      success: true, 
      message: 'Journal line fields added successfully',
      addedColumns
    });
    
  } catch (error) {
    console.error('[add-line-fields] Migration failed:', error);
    return NextResponse.json(
      { error: 'Failed to add journal line fields', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

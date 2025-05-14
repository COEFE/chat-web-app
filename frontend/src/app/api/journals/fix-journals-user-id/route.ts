import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

// This endpoint fixes journal entries data isolation by updating user_id for existing records
// POST /api/journals/fix-journals-user-id
export async function POST(req: NextRequest) {
  try {
    console.log('[fix-journals-user-id] Starting fix...');
    
    // Verify authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const token = authHeader.split(' ')[1];
    let userId;
    
    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      userId = decodedToken.uid;
      console.log(`[fix-journals-user-id] Authenticated user: ${userId}`);
    } catch (error) {
      console.error('[fix-journals-user-id] Authentication error:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // List of tables that need user_id column for journal data
    const tables = [
      'journals',
      'journal_lines',
      'journal_attachments',
      'journal_audit'
    ];
    
    const results: Record<string, any> = {};
    
    // Process each table
    for (const table of tables) {
      try {
        console.log(`[fix-journals-user-id] Processing table: ${table}`);
        
        // Check if user_id column already exists
        const columnCheck = await sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = ${table} AND column_name = 'user_id'
          ) as has_column
        `;
        
        const hasColumn = columnCheck.rows[0].has_column;
        
        if (!hasColumn) {
          console.log(`[fix-journals-user-id] Adding user_id column to ${table}`);
          
          // Add user_id column
          await sql.query(`
            ALTER TABLE ${table} 
            ADD COLUMN user_id VARCHAR(255)
          `);
          
          results[table] = {
            column_added: true
          };
        } else {
          console.log(`[fix-journals-user-id] user_id column already exists in ${table}`);
          results[table] = {
            column_added: false
          };
        }
        
        // Update existing records with NULL user_id
        console.log(`[fix-journals-user-id] Updating NULL user_id values in ${table} to current user`);
        
        const updateResult = await sql.query(`
          UPDATE ${table}
          SET user_id = $1
          WHERE user_id IS NULL OR user_id = ''
        `, [userId]);
        
        results[table].records_updated = updateResult.rowCount;
        
        // Create index on user_id for better query performance
        console.log(`[fix-journals-user-id] Creating index on user_id for ${table}`);
        
        try {
          await sql.query(`
            CREATE INDEX IF NOT EXISTS ${table}_user_id_idx ON ${table}(user_id)
          `);
          results[table].index_created = true;
        } catch (indexError: any) {
          console.error(`[fix-journals-user-id] Error creating index on ${table}:`, indexError);
          results[table].index_created = false;
          results[table].index_error = indexError.message;
        }
        
        // Add NOT NULL constraint if possible (only if all records have a user_id)
        console.log(`[fix-journals-user-id] Checking if we can add NOT NULL constraint to ${table}`);
        
        // Use raw query to avoid sql.unsafe issue
        const nullCheckQuery = `
          SELECT COUNT(*) as null_count
          FROM ${table}
          WHERE user_id IS NULL OR user_id = ''
        `;
        const nullCheck = await sql.query(nullCheckQuery);
        
        const nullCount = parseInt(nullCheck.rows[0].null_count || '0');
        
        if (nullCount === 0) {
          console.log(`[fix-journals-user-id] Adding NOT NULL constraint to ${table}`);
          
          try {
            await sql.query(`
              ALTER TABLE ${table}
              ALTER COLUMN user_id SET NOT NULL
            `);
            results[table].not_null_added = true;
          } catch (constraintError: any) {
            console.error(`[fix-journals-user-id] Error adding NOT NULL constraint to ${table}:`, constraintError);
            results[table].not_null_added = false;
            results[table].not_null_error = constraintError.message;
          }
        } else {
          console.log(`[fix-journals-user-id] Cannot add NOT NULL constraint to ${table}, ${nullCount} records with NULL user_id`);
          results[table].not_null_added = false;
          results[table].null_count = nullCount;
        }
      } catch (tableError: any) {
        console.error(`[fix-journals-user-id] Error processing table ${table}:`, tableError);
        results[table] = {
          error: tableError.message
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Journal entries data isolation fix completed',
      results
    });
  } catch (error: any) {
    console.error('[fix-journals-user-id] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'An unknown error occurred'
    }, { status: 500 });
  }
}

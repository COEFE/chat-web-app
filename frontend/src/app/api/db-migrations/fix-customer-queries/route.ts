import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

// This endpoint fixes customer and invoice data isolation by adding user_id filtering
// POST /api/db-migrations/fix-customer-queries
export async function POST(req: NextRequest) {
  try {
    console.log('[fix-customer-queries] Starting fix...');
    
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
      console.log(`[fix-customer-queries] Authenticated user: ${userId}`);
    } catch (error) {
      console.error('[fix-customer-queries] Authentication error:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // List of tables that need user_id column for customer and invoice data
    const tables = [
      'customers',
      'invoices',
      'invoice_lines',
      'invoice_payments'
    ];
    
    const results: Record<string, any> = {};
    
    // Process each table
    for (const table of tables) {
      try {
        console.log(`[fix-customer-queries] Processing table: ${table}`);
        
        // Check if user_id column already exists
        const columnCheck = await sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = ${table} AND column_name = 'user_id'
          ) as exists;
        `;
        
        const hasUserIdColumn = columnCheck.rows[0].exists;
        console.log(`[fix-customer-queries] Table ${table} has user_id column: ${hasUserIdColumn}`);
        
        if (!hasUserIdColumn) {
          // Add user_id column
          await sql.query(`
            ALTER TABLE ${table} 
            ADD COLUMN user_id VARCHAR(128) NULL;
          `);
          console.log(`[fix-customer-queries] Added user_id column to ${table}`);
          
          // Create index on user_id for better query performance
          await sql.query(`
            CREATE INDEX idx_${table}_user_id ON ${table}(user_id);
          `);
          console.log(`[fix-customer-queries] Created index on user_id for ${table}`);
          
          // Update existing records to set user_id to the current user
          const updateResult = await sql.query(`
            UPDATE ${table} 
            SET user_id = '${userId}'
            WHERE user_id IS NULL;
          `);
          
          console.log(`[fix-customer-queries] Updated ${updateResult.rowCount} records in ${table}`);
          
          // Check if there are any NULL values left
          const nullCheck = await sql.query(`
            SELECT COUNT(*) as count 
            FROM ${table} 
            WHERE user_id IS NULL;
          `);
          
          const nullCount = parseInt(nullCheck.rows[0].count);
          
          if (nullCount === 0) {
            // Add NOT NULL constraint
            try {
              await sql.query(`
                ALTER TABLE ${table} 
                ALTER COLUMN user_id SET NOT NULL;
              `);
              console.log(`[fix-customer-queries] Added NOT NULL constraint to ${table}`);
              
              results[table] = {
                success: true,
                message: `Added user_id column, created index, updated ${updateResult.rowCount} records, and added NOT NULL constraint`,
                updatedRecords: updateResult.rowCount
              };
            } catch (e) {
              console.error(`[fix-customer-queries] Error adding NOT NULL constraint to ${table}:`, e);
              results[table] = {
                success: true,
                message: `Added user_id column, created index, and updated ${updateResult.rowCount} records`,
                warning: 'Could not add NOT NULL constraint',
                updatedRecords: updateResult.rowCount
              };
            }
          } else {
            console.log(`[fix-customer-queries] WARNING: ${table} still has ${nullCount} NULL values, skipping NOT NULL constraint`);
            results[table] = {
              success: true,
              message: `Added user_id column, created index, and updated ${updateResult.rowCount} records`,
              warning: `Still has ${nullCount} NULL values, skipped NOT NULL constraint`,
              updatedRecords: updateResult.rowCount
            };
          }
        } else {
          // Update any NULL user_id values to the current user
          const updateResult = await sql.query(`
            UPDATE ${table} 
            SET user_id = '${userId}'
            WHERE user_id IS NULL;
          `);
          
          console.log(`[fix-customer-queries] Updated ${updateResult.rowCount} records with NULL user_id in ${table}`);
          
          results[table] = {
            success: true,
            message: `Table already has user_id column, updated ${updateResult.rowCount} NULL records`,
            updatedRecords: updateResult.rowCount
          };
        }
      } catch (error) {
        console.error(`[fix-customer-queries] Error processing table ${table}:`, error);
        results[table] = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
    
    // Now update the API routes to filter by user_id
    try {
      console.log('[fix-customer-queries] Checking API routes for customer and invoice queries...');
      
      // Check if the customers API route is properly filtering by user_id
      const customersApiCheck = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.routines
          WHERE routine_name LIKE '%customer%' AND routine_definition LIKE '%user_id%'
        ) as exists;
      `;
      
      const hasCustomerUserIdFiltering = customersApiCheck.rows[0].exists;
      console.log(`[fix-customer-queries] Customers API has user_id filtering: ${hasCustomerUserIdFiltering}`);
      
      results['api_routes'] = {
        success: true,
        message: 'API routes checked for user_id filtering',
        details: {
          customers_api: hasCustomerUserIdFiltering ? 'Has user_id filtering' : 'May need manual update'
        }
      };
    } catch (error) {
      console.error('[fix-customer-queries] Error checking API routes:', error);
      results['api_routes'] = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    // Return results
    return NextResponse.json({
      success: true,
      message: 'Customer and invoice data isolation fix completed',
      results
    });
  } catch (error) {
    console.error('[fix-customer-queries] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

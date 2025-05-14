import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

// This endpoint fixes the invoice_payments table by adding missing columns
// POST /api/db-migrations/fix-invoice-payments
export async function POST(req: NextRequest) {
  try {
    console.log('[fix-invoice-payments] Starting fix...');
    
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
      console.log(`[fix-invoice-payments] Authenticated user: ${userId}`);
    } catch (error) {
      console.error('[fix-invoice-payments] Authentication error:', error);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    
    // Check table structure
    console.log('[fix-invoice-payments] Checking invoice_payments table structure...');
    
    // Check if updated_at column exists
    const updatedAtCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_payments' AND column_name = 'updated_at'
      ) as exists;
    `;
    
    const hasUpdatedAt = updatedAtCheck.rows[0].exists;
    console.log(`[fix-invoice-payments] Table has updated_at column: ${hasUpdatedAt}`);
    
    // Check if created_at column exists
    const createdAtCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_payments' AND column_name = 'created_at'
      ) as exists;
    `;
    
    const hasCreatedAt = createdAtCheck.rows[0].exists;
    console.log(`[fix-invoice-payments] Table has created_at column: ${hasCreatedAt}`);
    
    // Add missing timestamp columns if needed
    if (!hasUpdatedAt) {
      console.log('[fix-invoice-payments] Adding updated_at column...');
      await sql`
        ALTER TABLE invoice_payments 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `;
    }
    
    if (!hasCreatedAt) {
      console.log('[fix-invoice-payments] Adding created_at column...');
      await sql`
        ALTER TABLE invoice_payments 
        ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
      `;
    }
    
    // Now try to add user_id column if it doesn't exist
    const userIdCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_payments' AND column_name = 'user_id'
      ) as exists;
    `;
    
    const hasUserId = userIdCheck.rows[0].exists;
    console.log(`[fix-invoice-payments] Table has user_id column: ${hasUserId}`);
    
    if (!hasUserId) {
      // Add user_id column
      await sql`
        ALTER TABLE invoice_payments 
        ADD COLUMN user_id VARCHAR(128) NULL;
      `;
      console.log('[fix-invoice-payments] Added user_id column');
      
      // Create index on user_id for better query performance
      await sql`
        CREATE INDEX idx_invoice_payments_user_id ON invoice_payments(user_id);
      `;
      console.log('[fix-invoice-payments] Created index on user_id');
      
      // Update existing records to set user_id to the current user
      const updateResult = await sql`
        UPDATE invoice_payments 
        SET user_id = ${userId}
        WHERE user_id IS NULL;
      `;
      
      console.log(`[fix-invoice-payments] Updated ${updateResult.rowCount} records with user_id = ${userId}`);
      
      // Check if there are any NULL values left
      const nullCheck = await sql`
        SELECT COUNT(*) as count 
        FROM invoice_payments 
        WHERE user_id IS NULL;
      `;
      
      const nullCount = parseInt(nullCheck.rows[0].count);
      
      if (nullCount === 0) {
        // Add NOT NULL constraint
        try {
          await sql`
            ALTER TABLE invoice_payments 
            ALTER COLUMN user_id SET NOT NULL;
          `;
          console.log('[fix-invoice-payments] Added NOT NULL constraint to user_id');
        } catch (e) {
          console.error('[fix-invoice-payments] Error adding NOT NULL constraint:', e);
          return NextResponse.json({ 
            success: true, 
            message: 'Fixed invoice_payments table structure and added user_id column',
            warning: 'Could not add NOT NULL constraint to user_id'
          });
        }
      } else {
        console.log(`[fix-invoice-payments] WARNING: Still has ${nullCount} NULL values, skipping NOT NULL constraint`);
        return NextResponse.json({ 
          success: true, 
          message: 'Fixed invoice_payments table structure and added user_id column',
          warning: `Still has ${nullCount} NULL values, skipped NOT NULL constraint`
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Successfully fixed invoice_payments table structure',
      details: {
        addedUpdatedAt: !hasUpdatedAt,
        addedCreatedAt: !hasCreatedAt,
        addedUserId: !hasUserId
      }
    });
  } catch (error) {
    console.error('[fix-invoice-payments] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

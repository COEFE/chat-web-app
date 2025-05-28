import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// POST /api/db-migrations/create-bill-refunds - Create the bill_refunds table
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    console.log('[create-bill-refunds] Starting migration...');
    
    // Create the bill_refunds table
    await sql`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_refunds') THEN
              -- Create the bill_refunds table
              CREATE TABLE bill_refunds (
                  id SERIAL PRIMARY KEY,
                  bill_id INTEGER NOT NULL REFERENCES bills(id),
                  refund_date DATE NOT NULL,
                  amount DECIMAL(15, 2) NOT NULL,
                  refund_account_id INTEGER NOT NULL REFERENCES accounts(id),
                  refund_method VARCHAR(50),
                  reference_number VARCHAR(100),
                  journal_id INTEGER REFERENCES journals(id),
                  reason TEXT,
                  user_id VARCHAR(50) NOT NULL,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );

              -- Add indexes for better performance
              CREATE INDEX idx_bill_refunds_bill_id ON bill_refunds(bill_id);
              CREATE INDEX idx_bill_refunds_refund_date ON bill_refunds(refund_date);
              CREATE INDEX idx_bill_refunds_user_id ON bill_refunds(user_id);
              CREATE INDEX idx_bill_refunds_journal_id ON bill_refunds(journal_id);

              -- Add a comment to the table
              COMMENT ON TABLE bill_refunds IS 'Tracks refunds for vendor bills';
              
              RAISE NOTICE 'bill_refunds table created successfully';
          ELSE
              -- Table exists, check if user_id column is NOT NULL
              IF EXISTS (
                  SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'bill_refunds' 
                  AND column_name = 'user_id' 
                  AND is_nullable = 'YES'
              ) THEN
                  -- Make user_id NOT NULL
                  ALTER TABLE bill_refunds ALTER COLUMN user_id SET NOT NULL;
                  RAISE NOTICE 'bill_refunds.user_id column updated to NOT NULL';
              END IF;
              
              RAISE NOTICE 'bill_refunds table already exists';
          END IF;
      END
      $$;
    `;
    
    console.log('[create-bill-refunds] Migration completed successfully');
    
    return NextResponse.json({ 
      success: true, 
      message: 'bill_refunds table created/updated successfully' 
    });
  } catch (err: any) {
    console.error('[create-bill-refunds] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Unknown error',
      details: err.stack
    }, { status: 500 });
  }
}

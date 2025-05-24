import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    // Create bill_credits table
    await query(`
      CREATE TABLE IF NOT EXISTS bill_credits (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
        credit_number VARCHAR(100),
        credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE,
        total_amount NUMERIC(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'Draft',
        terms VARCHAR(100),
        memo TEXT,
        ap_account_id INTEGER REFERENCES accounts(id),
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create bill_credit_lines table
    await query(`
      CREATE TABLE IF NOT EXISTS bill_credit_lines (
        id SERIAL PRIMARY KEY,
        bill_credit_id INTEGER REFERENCES bill_credits(id) ON DELETE CASCADE,
        expense_account_id INTEGER REFERENCES accounts(id),
        description TEXT,
        quantity NUMERIC(15, 2) NOT NULL,
        unit_price NUMERIC(15, 2) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        category VARCHAR(100),
        location VARCHAR(100),
        funder VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credits_vendor_id ON bill_credits(vendor_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credits_user_id ON bill_credits(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credit_lines_bill_credit_id ON bill_credit_lines(bill_credit_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credit_lines_expense_account_id ON bill_credit_lines(expense_account_id)`);

    return NextResponse.json({ 
      success: true, 
      message: 'Bill credits tables created successfully' 
    });
  } catch (err: any) {
    console.error('[bill-credits-setup] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

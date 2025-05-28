import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/accounts/db-setup – create accounts table and seed default COA
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // First check if accounts table exists
    const { rows: existingTables } = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'accounts'
      ) as exists;
    `;
    
    // Table already exists, just verify the schema
    if (existingTables[0]?.exists) {
      // Check if all required columns exist and add them if needed
      await sql`
        ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes TEXT;
      `;
      await sql`
        ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
      `;
      
      // Count accounts to see if we need to add default accounts
      const { rows: accountCount } = await sql`SELECT COUNT(*) as count FROM accounts WHERE user_id = ${userId};`;
      
      // If we already have accounts for this user, we don't need to do anything else
      if (parseInt(accountCount[0]?.count) > 0) {
        return NextResponse.json({ 
          success: true, 
          message: `Accounts table already exists and has ${accountCount[0]?.count} accounts for this user`,
          accountCount: accountCount[0]?.count
        });
      }
      
      // Check if account_code has unique constraint, if not add it
      const { rows: constraints } = await sql`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'accounts' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name LIKE '%account_code%';
      `;
      
      if (constraints.length === 0) {
        // Add unique constraint to account_code
        await sql`
          ALTER TABLE accounts ADD CONSTRAINT accounts_account_code_unique UNIQUE (account_code);
        `;
      }
    } else {
      // Create accounts table if it doesn't exist
      await sql`
        CREATE TABLE IF NOT EXISTS accounts (
          id SERIAL PRIMARY KEY,
          account_code VARCHAR(50) NOT NULL UNIQUE,
          name TEXT NOT NULL,
          parent_id INTEGER REFERENCES accounts(id),
          notes TEXT,
          is_custom BOOLEAN NOT NULL DEFAULT FALSE,
          account_type VARCHAR(50) NOT NULL,
          is_active BOOLEAN DEFAULT TRUE,
          is_deleted BOOLEAN DEFAULT FALSE,
          deleted_at TIMESTAMP WITH TIME ZONE,
          user_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
    }


    // Default Chart of Accounts
    const defaults: { account_code: string; name: string; account_type: string; parent?: string }[] = [
      { account_code: '1000', name: 'Current Assets', account_type: 'asset' },
      { account_code: '1010', name: 'Cash', account_type: 'asset', parent: '1000' },
      { account_code: '1011', name: 'Checking Account', account_type: 'asset', parent: '1010' },
      { account_code: '1012', name: 'Savings Account', account_type: 'asset', parent: '1010' },
      { account_code: '1100', name: 'Accounts Receivable', account_type: 'asset', parent: '1000' },
      { account_code: '1200', name: 'Inventory', account_type: 'asset', parent: '1000' },
      { account_code: '1300', name: 'Prepaid Expenses', account_type: 'asset', parent: '1000' },
      { account_code: '1400', name: 'Other Current Assets', account_type: 'asset', parent: '1000' },
      { account_code: '1500', name: 'Fixed Assets', account_type: 'asset' },
      { account_code: '1510', name: 'Equipment', account_type: 'asset', parent: '1500' },
      { account_code: '1520', name: 'Accum. Depreciation', account_type: 'asset', parent: '1500' },
      { account_code: '2000', name: 'Current Liabilities', account_type: 'liability' },
      { account_code: '2010', name: 'Accounts Payable', account_type: 'liability', parent: '2000' },
      { account_code: '2020', name: 'Credit Card Payable', account_type: 'liability', parent: '2000' },
      { account_code: '2100', name: 'Accrued Expenses', account_type: 'liability', parent: '2000' },
      { account_code: '2200', name: 'Payroll Liabilities', account_type: 'liability', parent: '2000' },
      { account_code: '2300', name: 'Deferred Revenue', account_type: 'liability', parent: '2000' },
      { account_code: '2400', name: 'Long-Term Liabilities', account_type: 'liability' },
      { account_code: '2410', name: 'Notes Payable', account_type: 'liability', parent: '2400' },
      { account_code: '3000', name: 'Equity', account_type: 'equity' },
      { account_code: '3100', name: "Owner's Capital", account_type: 'equity', parent: '3000' },
      { account_code: '3200', name: 'Retained Earnings', account_type: 'equity', parent: '3000' },
      { account_code: '3300', name: 'Distributions', account_type: 'equity', parent: '3000' },
      { account_code: '4000', name: 'Revenue', account_type: 'revenue' },
      { account_code: '4100', name: 'Product Sales', account_type: 'revenue', parent: '4000' },
      { account_code: '4200', name: 'Service Revenue', account_type: 'revenue', parent: '4000' },
      { account_code: '4300', name: 'Other Income', account_type: 'revenue', parent: '4000' },
      { account_code: '5000', name: 'Cost of Goods Sold', account_type: 'expense' },
      { account_code: '5100', name: 'Materials', account_type: 'expense', parent: '5000' },
      { account_code: '5200', name: 'Direct Labor', account_type: 'expense', parent: '5000' },
      { account_code: '6000', name: 'Operating Expenses', account_type: 'expense' },
      { account_code: '6100', name: 'Rent', account_type: 'expense', parent: '6000' },
      { account_code: '6200', name: 'Utilities', account_type: 'expense', parent: '6000' },
      { account_code: '6300', name: 'Payroll Expenses', account_type: 'expense', parent: '6000' },
      { account_code: '6400', name: 'Office Supplies', account_type: 'expense', parent: '6000' },
      { account_code: '6500', name: 'Marketing & Advertising', account_type: 'expense', parent: '6000' },
      { account_code: '6600', name: 'Insurance', account_type: 'expense', parent: '6000' },
      { account_code: '6700', name: 'Depreciation', account_type: 'expense', parent: '6000' },
      { account_code: '6800', name: 'Professional Fees', account_type: 'expense', parent: '6000' },
      { account_code: '6900', name: 'Other Expenses', account_type: 'expense', parent: '6000' }
    ];

    // Seed default accounts
    for (const acct of defaults) {
      if (acct.parent) {
        await sql`
          INSERT INTO accounts (account_code, name, parent_id, notes, is_custom, account_type, is_active, is_deleted, deleted_at, user_id, created_at, updated_at)
          VALUES (
            ${acct.account_code},
            ${acct.name},
            (SELECT id FROM accounts WHERE account_code = ${acct.parent} AND user_id = ${userId}),
            NULL,
            FALSE,
            ${acct.account_type},
            TRUE,
            FALSE,
            NULL,
            ${userId},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (account_code) DO NOTHING;
        `;
      } else {
        await sql`
          INSERT INTO accounts (account_code, name, parent_id, notes, is_custom, account_type, is_active, is_deleted, deleted_at, user_id, created_at, updated_at)
          VALUES (
            ${acct.account_code},
            ${acct.name},
            NULL,
            NULL,
            FALSE,
            ${acct.account_type},
            TRUE,
            FALSE,
            NULL,
            ${userId},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
          ON CONFLICT (account_code) DO NOTHING;
        `;
      }
    }

    return NextResponse.json({ success: true, message: 'Accounts setup and seeded' });
  } catch (err: any) {
    console.error('[accounts/db-setup] Error:', err);
    return NextResponse.json({ 
      error: err.message || 'Unknown error',
      stack: err.stack 
    }, { status: 500 });
  }
}

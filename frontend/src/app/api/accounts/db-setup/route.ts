import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/accounts/db-setup – create accounts table and seed default COA
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Create accounts table
    await sql`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name TEXT NOT NULL,
        parent_id INTEGER REFERENCES accounts(id),
        notes TEXT,
        is_custom BOOLEAN NOT NULL DEFAULT FALSE
      );
    `;

    // Default Chart of Accounts
    const defaults: { code: string; name: string; parent?: string }[] = [
      { code: '1000', name: 'Current Assets' },
      { code: '1010', name: 'Cash', parent: '1000' },
      { code: '1011', name: 'Checking Account', parent: '1010' },
      { code: '1012', name: 'Savings Account', parent: '1010' },
      { code: '1100', name: 'Accounts Receivable', parent: '1000' },
      { code: '1200', name: 'Inventory', parent: '1000' },
      { code: '1300', name: 'Prepaid Expenses', parent: '1000' },
      { code: '1400', name: 'Other Current Assets', parent: '1000' },
      { code: '1500', name: 'Fixed Assets' },
      { code: '1510', name: 'Equipment', parent: '1500' },
      { code: '1520', name: 'Accum. Depreciation', parent: '1500' },
      { code: '2000', name: 'Current Liabilities' },
      { code: '2010', name: 'Accounts Payable', parent: '2000' },
      { code: '2020', name: 'Credit Card Payable', parent: '2000' },
      { code: '2100', name: 'Accrued Expenses', parent: '2000' },
      { code: '2200', name: 'Payroll Liabilities', parent: '2000' },
      { code: '2300', name: 'Deferred Revenue', parent: '2000' },
      { code: '2400', name: 'Long-Term Liabilities' },
      { code: '2410', name: 'Notes Payable', parent: '2400' },
      { code: '3000', name: 'Equity' },
      { code: '3100', name: "Owner's Capital", parent: '3000' },
      { code: '3200', name: 'Retained Earnings', parent: '3000' },
      { code: '3300', name: 'Distributions', parent: '3000' },
      { code: '4000', name: 'Revenue' },
      { code: '4100', name: 'Product Sales', parent: '4000' },
      { code: '4200', name: 'Service Revenue', parent: '4000' },
      { code: '4300', name: 'Other Income', parent: '4000' },
      { code: '5000', name: 'Cost of Goods Sold' },
      { code: '5100', name: 'Materials', parent: '5000' },
      { code: '5200', name: 'Direct Labor', parent: '5000' },
      { code: '6000', name: 'Operating Expenses' },
      { code: '6100', name: 'Rent', parent: '6000' },
      { code: '6200', name: 'Utilities', parent: '6000' },
      { code: '6300', name: 'Payroll Expenses', parent: '6000' },
      { code: '6400', name: 'Office Supplies', parent: '6000' },
      { code: '6500', name: 'Marketing & Advertising', parent: '6000' },
      { code: '6600', name: 'Insurance', parent: '6000' },
      { code: '6700', name: 'Depreciation', parent: '6000' },
      { code: '6800', name: 'Professional Fees', parent: '6000' },
      { code: '6900', name: 'Other Expenses', parent: '6000' }
    ];

    // Seed default accounts
    for (const acct of defaults) {
      if (acct.parent) {
        await sql`
          INSERT INTO accounts (code, name, parent_id, notes, is_custom)
          VALUES (
            ${acct.code},
            ${acct.name},
            (SELECT id FROM accounts WHERE code = ${acct.parent}),
            NULL,
            FALSE
          )
          ON CONFLICT (code) DO NOTHING;
        `;
      } else {
        await sql`
          INSERT INTO accounts (code, name, parent_id, notes, is_custom)
          VALUES (
            ${acct.code},
            ${acct.name},
            NULL,
            NULL,
            FALSE
          )
          ON CONFLICT (code) DO NOTHING;
        `;
      }
    }

    return NextResponse.json({ success: true, message: 'Accounts setup and seeded' });
  } catch (err: any) {
    console.error('[accounts/db-setup] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// Endpoint to fix the issue with totals showing as 0 in journal listings
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;
  
  try {
    // Create or replace a function to properly calculate totals for journals
    await sql.query(`
      CREATE OR REPLACE FUNCTION update_journal_totals() RETURNS VOID AS $$
      BEGIN
        -- Update the journals table to include totals columns if they don't exist
        PERFORM column_name FROM information_schema.columns 
        WHERE table_name = 'journals' AND column_name = 'total_debits';
        
        IF NOT FOUND THEN
          ALTER TABLE journals ADD COLUMN total_debits NUMERIC(15, 2) DEFAULT 0;
        END IF;
        
        PERFORM column_name FROM information_schema.columns 
        WHERE table_name = 'journals' AND column_name = 'total_credits';
        
        IF NOT FOUND THEN
          ALTER TABLE journals ADD COLUMN total_credits NUMERIC(15, 2) DEFAULT 0;
        END IF;
        
        -- Update all journals with correct totals from their lines
        UPDATE journals j SET
          total_debits = COALESCE((SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id), 0),
          total_credits = COALESCE((SELECT SUM(credit) FROM journal_lines WHERE journal_id = j.id), 0);
      
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    // Execute the function to update all journal totals
    await sql.query(`SELECT update_journal_totals();`);
    
    // Check if any journals were updated
    const journalCountResult = await sql.query(`
      SELECT COUNT(*) FROM journals 
      WHERE total_debits > 0 OR total_credits > 0
    `);
    
    const journalsWithTotals = parseInt(journalCountResult.rows[0].count);
    
    return NextResponse.json({
      success: true,
      message: `Successfully updated totals for journals. ${journalsWithTotals} journals have non-zero totals.`,
    });
  } catch (err: any) {
    console.error('[fix-total] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to fix journal totals' }, { status: 500 });
  }
}

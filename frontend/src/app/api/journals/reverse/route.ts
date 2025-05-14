import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * API route to reverse a journal entry
 * Creates a new journal with opposite debit/credit values
 */
export async function POST(request: Request) {
  try {
    // Check authentication
    const { userId } = await authenticateRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { journalId } = await request.json();
    
    if (!journalId) {
      return NextResponse.json(
        { error: 'Journal ID is required' },
        { status: 400 }
      );
    }
    
    // 1. Verify the source journal exists and is posted
    const { rows: journalRows } = await sql`
      SELECT * FROM journals 
      WHERE id = ${journalId} 
      AND is_posted = true 
      AND is_deleted = false
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json(
        { error: 'Journal not found, not posted, or deleted' },
        { status: 404 }
      );
    }
    
    const originalJournal = journalRows[0];
    
    // 2. Get original journal lines
    const { rows: lineRows } = await sql`
      SELECT jl.*, a.code as account_code, a.name as account_name 
      FROM journal_lines jl
      JOIN accounts a ON jl.account_id = a.id
      WHERE jl.journal_id = ${journalId}
      ORDER BY jl.id
    `;
    
    if (lineRows.length === 0) {
      return NextResponse.json(
        { error: 'Journal has no line items' },
        { status: 400 }
      );
    }
    
    // 3. Create a new journal entry with reversed debits/credits
    const today = new Date().toISOString().split('T')[0];
    const reversalMemo = `Reversal of Journal #${journalId}: ${originalJournal.memo}`;
    
    // Ensure the reversal columns exist in the journals table and check which date column exists
    const { rows: columnRows } = await sql`
      SELECT 
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reversal_of_journal_id') as has_reversal_of_journal_id,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reversed_by_journal_id') as has_reversed_by_journal_id,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date_column,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date_column
    `;
    
    // Add missing columns if needed
    if (!columnRows[0].has_reversal_of_journal_id || !columnRows[0].has_reversed_by_journal_id) {
      await sql`
        DO $$
        BEGIN
          -- Add reversal_of_journal_id column if it doesn't exist
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'journals' AND column_name = 'reversal_of_journal_id'
          ) THEN
            ALTER TABLE journals ADD COLUMN reversal_of_journal_id INTEGER REFERENCES journals(id);
          END IF;

          -- Add reversed_by_journal_id column if it doesn't exist
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'journals' AND column_name = 'reversed_by_journal_id'
          ) THEN
            ALTER TABLE journals ADD COLUMN reversed_by_journal_id INTEGER REFERENCES journals(id);
          END IF;
        END
        $$;
      `;
    }
    
    // Determine which date column to use based on schema check
    const dateColumnName = columnRows[0].has_date_column ? 'date' : 
                          columnRows[0].has_transaction_date_column ? 'transaction_date' : 
                          null;
    
    // 3a. Insert the new journal header with reversal_of_journal_id set
    // Make the SQL statement dynamically based on column availability
    let newJournalRows;
    
    if (!dateColumnName) {
      // If no date column is found, use a minimal insert
      const result = await sql`
        INSERT INTO journals (
          memo, 
          created_by, 
          source,
          reversal_of_journal_id
        ) VALUES (
          ${reversalMemo}, 
          ${userId}, 
          'Journal Reversal',
          ${journalId}
        )
        RETURNING id
      `;
      newJournalRows = result.rows;
    } else {
      // Use the appropriate date column based on schema check
      if (dateColumnName === 'date') {
        const result = await sql`
          INSERT INTO journals (
            memo, 
            date, 
            created_by, 
            source,
            reversal_of_journal_id
          ) VALUES (
            ${reversalMemo}, 
            ${today}, 
            ${userId}, 
            'Journal Reversal',
            ${journalId}
          )
          RETURNING id
        `;
        newJournalRows = result.rows;
      } else { // transaction_date
        const result = await sql`
          INSERT INTO journals (
            memo, 
            transaction_date, 
            created_by, 
            source,
            reversal_of_journal_id
          ) VALUES (
            ${reversalMemo}, 
            ${today}, 
            ${userId}, 
            'Journal Reversal',
            ${journalId}
          )
          RETURNING id
        `;
        newJournalRows = result.rows;
      }
    }
    
    const newJournalId = newJournalRows[0].id;
    
    // 3b. Insert all reversed line items in a single SQL statement to maintain balance
    try {
      // Begin a transaction
      await sql`BEGIN;`;
      
      // Create VALUES portion for a batch insert
      const valuesSql = lineRows.map(line => 
        `(${newJournalId}, ${line.account_id}, 'Reversal of ${line.description || 'entry'}', ${line.credit}, ${line.debit})`
      ).join(',');
      
      // Execute a single batch insert for all journal lines to maintain balance in one operation
      if (lineRows.length > 0) {
        await sql.query(`
          INSERT INTO journal_lines (
            journal_id,
            account_id,
            description,
            debit,
            credit
          ) VALUES ${valuesSql};
        `);
      }
      
      // Update the original journal with reversed_by_journal_id
      await sql`
        UPDATE journals
        SET reversed_by_journal_id = ${newJournalId}
        WHERE id = ${journalId}
      `;
      
      // Commit the transaction if everything was successful
      await sql`COMMIT;`;
    } catch (error) {
      // Roll back the transaction if any operation fails
      await sql`ROLLBACK;`;
      throw error; // Re-throw the error after rollback
    }
    
    // The update to original journal is now handled inside the transaction above
    
    return NextResponse.json({ 
      success: true, 
      message: 'Journal reversed successfully',
      journalId: newJournalId
    });
    
  } catch (error) {
    console.error('Error reversing journal:', error);
    return NextResponse.json(
      { error: 'Failed to reverse journal' },
      { status: 500 }
    );
  }
}

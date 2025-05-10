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
    
    // 3a. Insert the new journal header with reversal_of_journal_id set
    const { rows: newJournalRows } = await sql`
      INSERT INTO journals (
        memo, 
        transaction_date, 
        created_by, 
        created_at,
        source,
        reference_number,
        reversal_of_journal_id
      ) VALUES (
        ${reversalMemo}, 
        ${today}, 
        ${userId}, 
        NOW(),
        'Journal Reversal',
        ${`REV-${journalId}`},
        ${journalId}
      )
      RETURNING id
    `;
    
    const newJournalId = newJournalRows[0].id;
    
    // 3b. Insert reversed line items
    for (const line of lineRows) {
      await sql`
        INSERT INTO journal_lines (
          journal_id,
          account_id,
          description,
          debit,
          credit
        ) VALUES (
          ${newJournalId},
          ${line.account_id},
          ${`Reversal of ${line.description || 'entry'}`},
          ${line.credit}, -- Swap debit and credit
          ${line.debit}   -- Swap debit and credit
        )
      `;
    }
    
    // 3c. Update the original journal with reversed_by_journal_id
    await sql`
      UPDATE journals
      SET reversed_by_journal_id = ${newJournalId}
      WHERE id = ${journalId}
    `;
    
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

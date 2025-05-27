import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { afterUpdate, afterDelete, beforeDelete } from '@/lib/accounting/hooks';

// Helper function to check which date column exists in the journals table
async function getJournalDateColumn() {
  const { rows } = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
  `;
  
  const schema = rows[0];
  console.log(`[journals/helper] Schema check:`, schema);
  return schema.has_transaction_date ? 'transaction_date' : 'date';
}

// GET /api/journals/:id - fetch a specific journal entry with its lines and attachments
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }
  
  try {
    // Determine the date column to use
    const dateColumn = await getJournalDateColumn();
    console.log(`[journals/${id}] Using date column:`, dateColumn);
    
    // Get journal header using a parameterized query
    const journalQuery = `
      SELECT 
        id, 
        ${dateColumn} as journal_date, 
        memo, 
        source, 
        created_by, 
        created_at,
        is_posted
      FROM 
        journals
      WHERE 
        id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) AND user_id = $2
    `;
    
    const { rows: journalRows } = await sql.query(journalQuery, [id, userId]);
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    const journal = journalRows[0];
    
    // Get journal lines
    const linesQuery = `
      SELECT 
        jl.id,
        jl.account_id,
        a.account_code AS account_code,
        a.name AS account_name,
        jl.debit,
        jl.credit,
        jl.description,
        jl.category,
        jl.location,
        jl.vendor,
        jl.funder
      FROM 
        journal_lines jl
      JOIN
        accounts a ON jl.account_id = a.id
      WHERE 
        jl.journal_id = $1
      ORDER BY
        jl.id
    `;
    
    const { rows: lines } = await sql.query(linesQuery, [id]);
    
    // Get attachments
    const attachmentsQuery = `
      SELECT 
        id,
        file_name,
        file_url,
        file_type,
        file_size,
        uploaded_by,
        uploaded_at
      FROM 
        journal_attachments
      WHERE 
        journal_id = $1
      ORDER BY
        id
    `;
    
    const { rows: attachments } = await sql.query(attachmentsQuery, [id]);
    
    // Calculate totals
    const totalDebit = (lines as any[]).reduce((sum: number, line: any) => sum + parseFloat(line.debit || 0), 0);
    const totalCredit = (lines as any[]).reduce((sum: number, line: any) => sum + parseFloat(line.credit || 0), 0);
    
    return NextResponse.json({
      journal: {
        ...journal,
        lines,
        attachments,
        totals: {
          debit: totalDebit,
          credit: totalCredit,
          balance: totalDebit - totalCredit
        }
      }
    });
  } catch (err: any) {
    console.error(`[journals/${id}] GET error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// PATCH /api/journals/:id - update a journal entry (if not posted)
export async function PATCH(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }

  const body = await req.json();
  
  try {
    // Determine the date column to use
    const dateColumn = await getJournalDateColumn();
    console.log(`[journals/${id}/PATCH] Using date column:`, dateColumn);
    
    // Check if the journal exists and is not posted
    const existingJournalQuery = `
      SELECT * FROM journals 
      WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) AND user_id = $2
    `;
    
    const { rows: existing } = await sql.query(existingJournalQuery, [id, userId]);
    
    if (existing.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    const existingJournal = existing[0];
    const beforeState = existingJournal;
    
    // Check if posted
    if (existingJournal.is_posted && !body.force) {
      return NextResponse.json({ 
        error: 'Cannot edit a posted journal entry without force flag' 
      }, { status: 403 });
    }
    
    // Begin transaction
    await sql.query('BEGIN');
    
    try {
      // Update journal header if provided
      if (body.date || body.memo || body.source) {
        // Create dynamic update query based on the date column name
        const updateQuery = `
          UPDATE journals
          SET
            ${dateColumn} = COALESCE($1, ${dateColumn}),
            memo = COALESCE($2, memo),
            source = COALESCE($3, source)
          WHERE id = $4
        `;
        
        await sql.query(updateQuery, [body.date, body.memo, body.source, id]);
      }
      
      // Update lines if provided
      if (body.lines && Array.isArray(body.lines)) {
        // Validate lines
        for (const line of (body.lines as any[])) {
          if (!line.account_id || (line.debit === undefined && line.credit === undefined)) {
            await sql.query('ROLLBACK');
            return NextResponse.json({ 
              error: 'Each line must have an account_id and either a debit or credit amount.' 
            }, { status: 400 });
          }
        }
        
        // Check if debits = credits
        const totalDebits = (body.lines as any[]).reduce((sum: number, line: any) => 
          sum + (parseFloat(line.debit) || 0), 0);
        const totalCredits = (body.lines as any[]).reduce((sum: number, line: any) => 
          sum + (parseFloat(line.credit) || 0), 0);
        
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          await sql.query('ROLLBACK');
          return NextResponse.json({ 
            error: `Journal entry must balance. Debits: ${totalDebits}, Credits: ${totalCredits}` 
          }, { status: 400 });
        }
        
        // Delete existing lines
        await sql.query('DELETE FROM journal_lines WHERE journal_id = $1', [id]);
        
        // Insert new lines
        for (const line of (body.lines as any[])) {
          const insertLineQuery = `
            INSERT INTO journal_lines (
              journal_id, 
              account_id, 
              debit, 
              credit, 
              description, 
              category, 
              location, 
              vendor, 
              funder
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `;
          
          const lineParams = [
            id,
            line.account_id,
            line.debit || 0,
            line.credit || 0,
            line.description || null,
            line.category || null,
            line.location || null,
            line.vendor || null,
            line.funder || null
          ];
          
          await sql.query(insertLineQuery, lineParams);
        }
      }
      
      // Get the updated state for audit
      const updatedQuery = `
        SELECT 
          j.*,
          (
            SELECT json_agg(jl.*)
            FROM journal_lines jl
            WHERE jl.journal_id = j.id
          ) AS lines
        FROM 
          journals j
        WHERE 
          j.id = $1
      `;
      
      const { rows: updatedRows } = await sql.query(updatedQuery, [id]);
      const afterState = updatedRows[0];
      
      // Commit transaction
      await sql.query('COMMIT');
      
      // Regenerate embeddings if necessary and update balances
      afterUpdate(id, beforeState, afterState, userId).catch(hookError => {
        console.error(`Error in afterUpdate hook for journal ${id}:`, hookError);
      });
      
      return NextResponse.json({
        message: 'Journal entry updated successfully',
        journal: afterState // Return the updated journal state
      });
    } catch (err: any) {
      // Rollback transaction on error
      await sql.query('ROLLBACK');
      console.error(`[journals/${id}] PATCH transaction error:`, err);
      return NextResponse.json({ error: err.message || 'Transaction failed' }, { status: 500 });
    }
  } catch (err: any) {
    console.error(`[journals/${id}] PATCH error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE /api/journals/:id - delete a journal entry (if not posted)
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }

  try {
    // Check if the journal exists and is not posted
    const { rows } = await sql.query(
      'SELECT * FROM journals WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) AND user_id = $2',
      [id, userId]
    );
    
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    const journal = rows[0];
    
    // Check if posted
    if (journal.is_posted) {
      return NextResponse.json({ 
        error: 'Cannot delete a posted journal entry' 
      }, { status: 403 });
    }
    
    // Notify hooks before deletion
    await beforeDelete(id, userId).catch(hookError => {
      console.error(`Error in beforeDelete hook for journal ${id}:`, hookError);
    });
    
    // Soft delete the journal with a single atomic update (no transaction needed)
    await sql.query(
      'UPDATE journals SET is_deleted = TRUE WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) AND user_id = $2',
      [id, userId]
    );
    
    // Notify hooks after deletion
    afterDelete(id, journal, userId).catch(hookError => {
      console.error(`Error in afterDelete hook for journal ${id}:`, hookError);
    });
    
    return NextResponse.json({
      message: 'Journal entry deleted successfully'
    });
  } catch (err: any) {
    console.error(`[journals/${id}] DELETE error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

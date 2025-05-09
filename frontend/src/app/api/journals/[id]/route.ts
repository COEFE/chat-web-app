import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { afterUpdate, afterDelete, beforeDelete } from '@/lib/accounting/hooks';

// GET /api/journals/:id - fetch a specific journal entry with its lines and attachments
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }
  try {
    // Get journal header
    const { rows: journalRows } = await sql`
      SELECT 
        id, 
        date, 
        memo, 
        source, 
        created_by, 
        created_at,
        is_posted
      FROM 
        journals
      WHERE 
        id = ${id} AND is_deleted = FALSE
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    const journal = journalRows[0];
    
    // Get journal lines
    const { rows: lines } = await sql`
      SELECT 
        jl.id,
        jl.account_id,
        a.code AS account_code,
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
        jl.journal_id = ${id}
      ORDER BY
        jl.id
    `;
    
    // Get attachments
    const { rows: attachments } = await sql`
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
        journal_id = ${id}
      ORDER BY
        id
    `;
    
    // Calculate totals
    const totalDebit = (lines as any[]).reduce((sum: number, line: any) => sum + parseFloat(line.debit), 0);
    const totalCredit = (lines as any[]).reduce((sum: number, line: any) => sum + parseFloat(line.credit), 0);
    
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
    // Check if journal exists and is not posted
    const { rows: journalRows } = await sql`
      SELECT is_posted FROM journals WHERE id = ${id} AND is_deleted = FALSE
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    if (journalRows[0].is_posted) {
      return NextResponse.json({ 
        error: 'Cannot modify a posted journal entry' 
      }, { status: 400 });
    }
    
    // Get the current state for audit
    const { rows: beforeRows } = await sql`
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
        j.id = ${id}
    `;
    
    const beforeState = beforeRows[0];
    
    // Begin transaction
    await sql`BEGIN`;
    
    try {
      // Update journal header if provided
      if (body.date || body.memo || body.source) {
        await sql`
          UPDATE journals
          SET
            date = COALESCE(${body.date}, date),
            memo = COALESCE(${body.memo}, memo),
            source = COALESCE(${body.source}, source)
          WHERE id = ${id}
        `;
      }
      
      // Update lines if provided
      if (body.lines && Array.isArray(body.lines)) {
        // Validate lines
        for (const line of (body.lines as any[])) {
          if (!line.account_id || (line.debit === undefined && line.credit === undefined)) {
            await sql`ROLLBACK`;
            return NextResponse.json({ 
              error: 'Each line must have an account_id and either a debit or credit amount.' 
            }, { status: 400 });
          }
        }
        
        // Check if debits = credits
        const totalDebits = (body.lines as any[]).reduce((sum: number, line: any) => sum + (parseFloat(line.debit) || 0), 0);
        const totalCredits = (body.lines as any[]).reduce((sum: number, line: any) => sum + (parseFloat(line.credit) || 0), 0);
        
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          await sql`ROLLBACK`;
          return NextResponse.json({ 
            error: `Journal entry must balance. Debits: ${totalDebits}, Credits: ${totalCredits}` 
          }, { status: 400 });
        }
        
        // Delete existing lines
        await sql`DELETE FROM journal_lines WHERE journal_id = ${id}`;

        // Prepare for bulk insert of all lines
        const valueParams: (string | number | null)[] = [];
        const placeholders: string[] = [];
        
        // Build the parameters and placeholders for all lines
        (body.lines as any[]).forEach((line, i) => {
          const offset = i * 9; // 9 columns per row (including the 4 new fields)
          valueParams.push(
            id,
            line.account_id,
            parseFloat(line.debit) || 0,
            parseFloat(line.credit) || 0,
            line.description || null,
            line.category || null,
            line.location || null,
            line.vendor || null,
            line.funder || null
          );
          
          // Create placeholder like ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          placeholders.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9})`);
        });
        
        // Bulk insert all lines in a single query
        if (placeholders.length > 0) {
          const valuesClause = placeholders.join(', ');
          
          await sql.query(`
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
            ) VALUES ${valuesClause}
          `, valueParams);
        }
      }
      
      // Get the updated state for audit
      const { rows: afterRows } = await sql`
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
          j.id = ${id}
      `;
      
      const afterState = afterRows[0];
      
      // Regenerate embeddings if necessary and update balances
      afterUpdate(id, beforeState, afterState, userId).catch(hookError => {
        console.error(`Error in afterUpdate hook for journal ${id}:`, hookError);
        // Non-critical, don't block response
      });
      
      // Commit transaction
      await sql`COMMIT`;
      
      return NextResponse.json({ 
        success: true, 
        message: 'Journal entry updated successfully',
        journal: afterState // Return the updated journal state
      });
    } catch (txError) {
      // Rollback on error
      await sql`ROLLBACK`;
      throw txError;
    }
  } catch (err: any) {
    console.error(`[journals/${id}] PATCH error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE /api/journals/:id - soft delete a journal entry (if not posted)
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid journal ID' }, { status: 400 });
  }
  try {
    // Call beforeDelete hook for validation (e.g., check if posted or exists)
    const { valid: canDelete, error: beforeDeleteError } = await beforeDelete(id, userId);
    if (!canDelete) {
      // The hook might return a 404 or 400 type error, so status could be dynamic if needed
      return NextResponse.json({ error: beforeDeleteError || 'Pre-delete validation failed' }, { status: 400 });
    }
    
    // Begin transaction
    await sql`BEGIN`;
    
    try {
      // Get the current state for audit
      // This needs to be done AFTER validation confirms the journal exists and can be deleted,
      // but BEFORE it's actually marked as deleted.
      const { rows: beforeRows } = await sql`
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
          j.id = ${id}
      `;
      
      // If beforeRows is empty here, it implies a race condition or an issue with beforeDelete not catching it.
      // However, beforeDelete should have already confirmed existence.
      if (beforeRows.length === 0) {
        await sql`ROLLBACK`; // Rollback if something went wrong after validation
        return NextResponse.json({ error: 'Journal not found unexpectedly after validation' }, { status: 404 });
      }
      const beforeState = beforeRows[0];
      
      // Soft delete the journal
      await sql`
        UPDATE journals
        SET 
          is_deleted = TRUE,
          deleted_at = CURRENT_TIMESTAMP
        WHERE id = ${id}
      `;
      
      // Call afterDelete hook for audit logging and other side effects
      // The hook will handle inserting into journal_audit
      afterDelete(id, beforeState, userId).catch(hookError => {
        console.error(`Error in afterDelete hook for journal ${id}:`, hookError);
        // Non-critical, don't block response, but log it
      });
      
      // Commit transaction
      await sql`COMMIT`;
      
      return NextResponse.json({ 
        success: true, 
        message: 'Journal entry deleted successfully' 
      });
    } catch (txError) {
      // Rollback on error
      await sql`ROLLBACK`;
      throw txError;
    }
  } catch (err: any) {
    console.error(`[journals/${id}] DELETE error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

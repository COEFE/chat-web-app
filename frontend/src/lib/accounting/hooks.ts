/**
 * Accounting System Hooks
 * 
 * These hooks are called during the journal posting lifecycle to maintain
 * data integrity, audit trails, and enable AI-driven features.
 */

import { sql } from '@vercel/postgres';
import { createEmbedding } from '@/lib/ai/embeddings';
import { Journal, JournalLine } from '@/types/accounting';

/**
 * BEFORE-POST Hook
 * Called before a journal is saved to ensure data validity
 */
export async function beforePost(
  journal: Journal, 
  userId: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Check for required fields
  if (!journal.transaction_date) {
    return { valid: false, error: 'Transaction date is required' };
  }
  
  if (!journal.memo || journal.memo.trim().length === 0) {
    return { valid: false, error: 'Memo is required' };
  }
  
  if (!journal.lines || journal.lines.length === 0) {
    return { valid: false, error: 'At least one journal line is required' };
  }
  
  // Check for balanced debits/credits (client-side validation)
  const totalDebits = journal.lines.reduce((sum: number, line: JournalLine) => sum + (Number(line.debit) || 0), 0);
  const totalCredits = journal.lines.reduce((sum: number, line: JournalLine) => sum + (Number(line.credit) || 0), 0);
  
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return { 
      valid: false, 
      error: `Journal must balance: debits (${totalDebits.toFixed(2)}) must equal credits (${totalCredits.toFixed(2)})` 
    };
  }
  
  // Check for period locks - don't allow posting to closed accounting periods
  try {
    // Convert transaction_date to string if it's a Date object
    const dateStr = typeof journal.transaction_date === 'string' 
      ? journal.transaction_date 
      : journal.transaction_date.toISOString().split('T')[0];
      
    const { rows } = await sql.query(`
      SELECT EXISTS (
        SELECT 1 FROM period_locks 
        WHERE period = to_char($1::date, 'YYYY-MM')
        AND is_locked = true
      ) as is_locked
    `, [dateStr]);
    
    if (rows[0]?.is_locked) {
      return { valid: false, error: 'Cannot post to a locked accounting period' };
    }
  } catch (error) {
    console.log('Period lock check skipped - table may not exist yet');
    // Continue even if period_locks doesn't exist yet
  }
  
  // All validations passed
  return { valid: true };
}

/**
 * BEFORE-UPDATE Hook
 * Called before a journal is updated to ensure data validity
 */
export async function beforeUpdate(
  journalId: number, 
  updates: Partial<Journal>, // The intended updates
  userId: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Check if journal exists and is not posted
  const { rows } = await sql`SELECT is_posted FROM journals WHERE id = ${journalId} AND is_deleted = FALSE`;
  if (rows.length === 0) {
    return { valid: false, error: 'Journal not found or has been deleted' };
  }
  if (rows[0].is_posted) {
    return { valid: false, error: 'Cannot modify a posted journal entry' };
  }
  // Add any other specific update validations here if needed
  return { valid: true };
}

/**
 * BEFORE-DELETE Hook
 * Called before a journal is deleted
 */
export async function beforeDelete(
  journalId: number, 
  userId: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Check if journal exists and is not posted
  const { rows } = await sql`SELECT is_posted FROM journals WHERE id = ${journalId} AND is_deleted = FALSE`;
  if (rows.length === 0) {
    return { valid: false, error: 'Journal not found or has been deleted' };
  }
  if (rows[0].is_posted) {
    return { valid: false, error: 'Cannot delete a posted journal entry' };
  }
  return { valid: true };
}

/**
 * AFTER-POST Hook
 * Called after a journal is successfully posted to handle side-effects
 */
export async function afterPost(
  journalId: number,
  userId: string,
  beforeState?: any, // Optional: for consistency if pre-fetched
  afterState?: any   // Optional: for consistency if pre-constructed
): Promise<void> {
  console.log(`Running afterPost hook for journal ${journalId}`);
  
  try {
    // 1. Generate embeddings for AI classification
    await generateJournalEmbeddings(journalId);
    
    // 2. Record in audit log
    // If afterState is not provided, it implies it needs to be fetched or constructed.
    // For a 'POST' action, 'beforeState' might be minimal or non-existent (new record).
    // 'afterState' is crucial here.
    const finalAfterState = afterState ?? await sql`SELECT * FROM journals WHERE id = ${journalId} AND is_deleted = FALSE`.then(res => res.rows[0]);
    await recordAuditEvent(journalId, 'POST', userId, beforeState, finalAfterState);
    
    // 3. Update account balance cache (if implemented)
    await updateAccountBalances(journalId);
  } catch (error) {
    console.error('Error in afterPost hook:', error);
    // Don't throw - we don't want to roll back the transaction if hooks fail
  }
}

/**
 * AFTER-UPDATE Hook
 * Called after a journal is updated to maintain data consistency
 */
export async function afterUpdate(
  journalId: number,
  before: any,
  after: any,
  userId: string
): Promise<void> {
  console.log(`Running afterUpdate hook for journal ${journalId}`);
  
  try {
    // 1. Record audit with before/after state
    await recordAuditEvent(journalId, 'UPDATE', userId, before, after);
    
    // 2. Regenerate embeddings if line text has changed
    if (linesChanged(before, after)) {
      await regenerateJournalEmbeddings(journalId);
    }
    
    // 3. Update account balances if amounts changed
    if (amountsChanged(before, after)) {
      await updateAccountBalances(journalId);
    }
  } catch (error) {
    console.error('Error in afterUpdate hook:', error);
  }
}

/**
 * AFTER-DELETE Hook (or soft-delete)
 * Called when a journal is deleted or marked as deleted
 */
export async function afterDelete(
  journalId: number,
  before: any,
  userId: string
): Promise<void> {
  console.log(`Running afterDelete hook for journal ${journalId}`);
  
  try {
    // 1. Record audit with previous state
    await recordAuditEvent(journalId, 'DELETE', userId, before);
    
    // 2. Reverse account balance updates
    await reverseAccountBalances(journalId, before);
  } catch (error) {
    console.error('Error in afterDelete hook:', error);
  }
}

/**
 * AFTER-UNPOST Hook
 * Called after a journal is successfully un-posted
 */
export async function afterUnpost(
  journalId: number,
  userId: string,
  beforeState: any,
  afterState: any
): Promise<void> {
  console.log(`Running afterUnpost hook for journal ${journalId}`);
  try {
    // 1. Record in audit log
    await recordAuditEvent(journalId, 'UNPOST', userId, beforeState, afterState);

    // 2. Consider if any other actions from 'afterPost' need reversal here
    // For example, if embeddings are specific to posted status, or if account balances need adjustment.
    // For now, primarily focusing on the audit event.

  } catch (error) {
    console.error('Error in afterUnpost hook:', error);
    // Don't throw - we don't want to roll back the transaction if hooks fail
  }
}

// ------------------------
// Helper functions
// ------------------------

/**
 * Generate embeddings for all lines in a journal
 */
async function generateJournalEmbeddings(journalId: number): Promise<void> {
  // Get journal lines
  const { rows: lines } = await sql`
    SELECT 
      id, 
      journal_id,
      account_id,
      description,
      debit,
      credit
    FROM 
      journal_lines
    WHERE 
      journal_id = ${journalId}
  `;
  
  // Get journal metadata for context
  const { rows: journals } = await sql`
    SELECT 
      id,
      memo,
      source,
      journal_type,
      transaction_date
    FROM 
      journals
    WHERE 
      id = ${journalId}
  `;
  
  if (journals.length === 0 || lines.length === 0) {
    console.log(`Skip embedding generation: no journal/lines found for ID ${journalId}`);
    return;
  }
  
  const journal = journals[0];
  
  // Process each line
  for (const line of lines) {
    try {
      // Create text to embed (combine journal + line data)
      const textToEmbed = `
        Journal: ${journal.memo}
        Type: ${journal.journal_type || 'General'}
        Date: ${journal.transaction_date}
        Line Description: ${line.description || ''}
        Amount: ${line.debit > 0 ? line.debit : line.credit}
        ${line.debit > 0 ? 'Debit' : 'Credit'}: Account ${line.account_id}
      `;
      
      // Generate embedding
      const embedding = await createEmbedding(textToEmbed);
      
      if (embedding) {
        // Convert embedding array to string format for PostgreSQL
        const embeddingStr = `[${embedding.join(',')}]`;
        
        // Store embedding in database
        await sql.query(`
          UPDATE journal_lines
          SET embedding = $1::vector
          WHERE id = $2
        `, [embeddingStr, line.id]);
      }
    } catch (error) {
      console.error(`Error generating embedding for line ${line.id}:`, error);
    }
  }
}

/**
 * Regenerate embeddings for an updated journal
 */
async function regenerateJournalEmbeddings(journalId: number): Promise<void> {
  // Just reuse the generate function
  return generateJournalEmbeddings(journalId);
}

/**
 * Record an audit event in the journal_audit table
 */
async function recordAuditEvent(
  journalId: number,
  action: 'POST' | 'UPDATE' | 'DELETE' | 'UNPOST',
  userId: string,
  before?: any,
  after?: any
): Promise<void> {
  await sql`
    INSERT INTO journal_audit (
      journal_id,
      action,
      performed_by,
      performed_at,
      before_state,
      after_state
    ) VALUES (
      ${journalId},
      ${action},
      ${userId},
      CURRENT_TIMESTAMP,
      ${before ? JSON.stringify(before) : null},
      ${after ? JSON.stringify(after) : null}
    )
  `;
}

/**
 * Update account balance cache for affected accounts
 * Note: Implement this if you have an account_balances table
 */
async function updateAccountBalances(journalId: number): Promise<void> {
  // This is a placeholder for a more complex implementation
  // that would update a balance cache table if you have one
  console.log(`Would update account balances for journal ${journalId}`);
  
  // Example implementation if you had an account_balances table:
  /*
  await sql`
    WITH affected_accounts AS (
      SELECT DISTINCT account_id FROM journal_lines WHERE journal_id = ${journalId}
    )
    UPDATE account_balances ab
    SET 
      balance = (
        SELECT SUM(debit - credit) 
        FROM journal_lines jl
        JOIN journals j ON jl.journal_id = j.id
        WHERE jl.account_id = ab.account_id
        AND j.is_posted = true
        AND j.is_deleted = false
      )
    WHERE account_id IN (SELECT account_id FROM affected_accounts)
  `;
  */
}

/**
 * Reverse account balance updates for a deleted journal
 */
async function reverseAccountBalances(journalId: number, journalData: any): Promise<void> {
  // Similar to updateAccountBalances, but would subtract the values
  console.log(`Would reverse account balances for deleted journal ${journalId}`);
}

/**
 * Check if journal line text has changed (to know if embeddings need regeneration)
 */
function linesChanged(before: any, after: any): boolean {
  if (!before?.lines || !after?.lines) return true;
  
  // Simple check: did the number of lines change?
  if (before.lines.length !== after.lines.length) return true;
  
  // Check if any line descriptions changed
  for (let i = 0; i < before.lines.length; i++) {
    if (before.lines[i].description !== after.lines[i].description) return true;
    if (before.lines[i].account_id !== after.lines[i].account_id) return true;
  }
  
  // Also check journal memo (often part of embedding context)
  if (before.memo !== after.memo) return true;
  
  return false;
}

/**
 * Check if any monetary amounts changed (to know if balances need updating)
 */
function amountsChanged(before: any, after: any): boolean {
  if (!before?.lines || !after?.lines) return true;
  
  // Simple check: did the number of lines change?
  if (before.lines.length !== after.lines.length) return true;
  
  // Check if any amounts changed
  for (let i = 0; i < before.lines.length; i++) {
    if (Number(before.lines[i].debit) !== Number(after.lines[i].debit)) return true;
    if (Number(before.lines[i].credit) !== Number(after.lines[i].credit)) return true;
  }
  
  return false;
}

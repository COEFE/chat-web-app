import { sql } from '@vercel/postgres';
import { beforePost, afterPost, beforeUpdate, afterUpdate, beforeDelete, afterDelete, afterUnpost } from './hooks';

// Types for the journal entry system
export interface JournalLine {
  id?: number;
  line_number: number;
  account_id: number;
  account_name?: string; // For UI display purposes
  account_code?: string; // For UI display purposes
  description: string;
  debit: number;
  credit: number;
  category?: string;
  location?: string;
  vendor?: string;
  funder?: string;
}

export interface Journal {
  id?: number;
  journal_number?: string;
  journal_type: string;
  transaction_date: string; // ISO date string
  memo: string;
  source?: string;
  reference_number?: string;
  is_posted: boolean;
  created_by?: string;
  lines: JournalLine[];
  attachments?: JournalAttachment[];
  total_debits?: number;
  total_credits?: number;
  is_balanced?: boolean;
}

export interface JournalAttachment {
  id?: number;
  journal_id?: number;
  file_name: string;
  file_path: string;
  file_size?: number;
  file_type?: string;
  uploaded_by?: string;
}

export interface JournalType {
  code: string;
  name: string;
  description: string;
  requires_approval: boolean;
  default_memo?: string;
  auto_numbering_prefix?: string;
}

/**
 * Get journal types from database
 */
export async function getJournalTypes(): Promise<JournalType[]> {
  try {
    // Check if journal_types table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_types'
      ) as exists;
    `;
    
    // If journal_types table doesn't exist, return default types
    if (!tableCheck.rows[0].exists) {
      return [
        { 
          code: 'GJ', 
          name: 'General Journal', 
          description: 'For general accounting entries', 
          requires_approval: false
        }
      ];
    }
    
    // Get types from database
    const result = await sql`SELECT * FROM journal_types ORDER BY code`;
    return result.rows as unknown as JournalType[];
  } catch (error) {
    console.error('Error fetching journal types:', error);
    // Return a default type if query fails
    return [{ 
      code: 'GJ', 
      name: 'General Journal', 
      description: 'For general accounting entries', 
      requires_approval: false
    }];
  }
}

/**
 * Get journal by ID with lines and attachments
 * @param journalId - The ID of the journal to retrieve
 * @param userId - Optional user ID to ensure data privacy (only return journals belonging to this user)
 */
export async function getJournal(journalId: number, userId?: string): Promise<Journal | null> {
  // Check schema first for backwards compatibility
  const schemaCheck = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_types') as has_journal_types_table
  `;

  const schema = schemaCheck.rows[0];
  
  // Build the query based on the available columns
  let selectFields = `
    j.id, 
    ${schema.has_journal_number ? 'j.journal_number,' : 'NULL as journal_number,'}
    ${schema.has_journal_type ? 'j.journal_type,' : '\'GJ\' as journal_type,'}
    ${schema.has_transaction_date ? 'j.transaction_date,' : schema.has_date ? 'j.date as transaction_date,' : 'CURRENT_DATE as transaction_date,'}
    j.memo, j.source, 
    ${schema.has_reference_number ? 'j.reference_number,' : 'NULL as reference_number,'}
    j.is_posted, j.created_by, j.created_at,
    ${schema.has_journal_types_table ? 'jt.name as journal_type_name,' : '\'General Journal\' as journal_type_name,'}
    (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id) as total_debits,
    (SELECT SUM(credit) FROM journal_lines WHERE journal_id = j.id) as total_credits,
    (SELECT COUNT(*) FROM journal_attachments WHERE journal_id = j.id) as attachment_count
  `;

  // Update join based on schema
  let joinClause = schema.has_journal_types_table && schema.has_journal_type ? 
    'LEFT JOIN journal_types jt ON j.journal_type = jt.code' : '';

  // Get journal header with user_id filtering for data privacy
  let whereClause = 'j.id = $1 AND j.is_deleted = FALSE';
  let queryParams: (number | string)[] = [journalId];
  
  // Add user_id filter if provided (for data privacy)
  if (userId) {
    whereClause += ' AND j.user_id = $2';
    queryParams.push(userId);
    console.log(`[getJournal] Filtering journal ${journalId} for user: ${userId}`);
  }
  
  const journalResult = await sql.query(
    `SELECT ${selectFields.trim()}
    FROM journals j
    ${joinClause}
    WHERE ${whereClause}`,
    queryParams
  );
  
  if (journalResult.rows.length === 0) {
    return null;
  }
  
  // Check if journal_lines has a line_number column
  const lineNumberCheck = await sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'journal_lines' AND column_name = 'line_number'
    ) as has_line_number;
  `;

  const hasLineNumber: boolean = lineNumberCheck.rows[0]?.has_line_number;

  // Build dynamic select for line number
  const lineNumberField = hasLineNumber
    ? 'jl.line_number'
    : 'ROW_NUMBER() OVER (ORDER BY jl.id) AS line_number';

  const orderByField = hasLineNumber ? 'jl.line_number' : 'jl.id';

  // Get journal lines
  const linesQuery = `SELECT 
      jl.id, ${lineNumberField}, jl.account_id, jl.description,
      jl.debit, jl.credit, jl.category, jl.location, jl.vendor, jl.funder,
      a.code as account_code, a.name as account_name
    FROM journal_lines jl
    LEFT JOIN accounts a ON jl.account_id = a.id
    WHERE jl.journal_id = $1
    ORDER BY ${orderByField}`;

  const linesResult = await sql.query(linesQuery, [journalId]);
  
  // Get journal attachments
  const attachmentsResult = await sql.query(
    `SELECT *
    FROM journal_attachments
    WHERE journal_id = $1`,
    [journalId]
  );
  
  // Combine the results
  const journal = {
    ...journalResult.rows[0],
    lines: linesResult.rows as unknown as JournalLine[],
    attachments: attachmentsResult.rows as unknown as JournalAttachment[],
    // Calculate totals
    total_debits: linesResult.rows.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0),
    total_credits: linesResult.rows.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0),
  } as Journal;
  
  return journal;
}

/**
 * Get journals with pagination and filtering
 */
export async function getJournals(
  page: number = 1, 
  limit: number = 20, 
  type?: string, 
  startDate?: string, 
  endDate?: string, 
  isPosted?: boolean,
  userId?: string
): Promise<{ journals: Journal[], total: number }> {
  const offset = (page - 1) * limit;
  
  // Build where clauses as an array of conditions
  const conditions = [];
  const params = [];
  
  // Always filter by user_id if provided (for data privacy)
  if (userId) {
    conditions.push('j.user_id = $' + (params.length + 1));
    params.push(userId);
    console.log(`[getJournals] Filtering journals for user: ${userId}`);
  }
  
  if (type) {
    conditions.push('j.journal_type = $' + (params.length + 1));
    params.push(type);
  }
  
  if (startDate) {
    conditions.push('j.transaction_date >= $' + (params.length + 1));
    params.push(startDate);
  }
  
  if (endDate) {
    conditions.push('j.transaction_date <= $' + (params.length + 1));
    params.push(endDate);
  }
  
  if (isPosted !== undefined) {
    conditions.push('j.is_posted = $' + (params.length + 1));
    params.push(isPosted);
  }
  
  // Always add non-deleted condition
  conditions.push('j.is_deleted = FALSE');
  
  // Build WHERE clause string
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count for pagination
  const countResult = await sql.query(
    `SELECT COUNT(*) as total FROM journals j ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total);
  
  // First, check if the journals table has been migrated to the new schema
  const schemaCheck = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date,
      EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_types') as has_journal_types_table
  `;

  const schema = schemaCheck.rows[0];
  console.log('Schema check:', schema);
  
  // Build the query based on the available columns
  let selectFields = `
    j.id, 
    ${schema.has_journal_number ? 'j.journal_number,' : 'NULL as journal_number,'}
    ${schema.has_journal_type ? 'j.journal_type,' : '\'GJ\' as journal_type,'}
    ${schema.has_transaction_date ? 'j.transaction_date,' : schema.has_date ? 'j.date as transaction_date,' : 'CURRENT_DATE as transaction_date,'}
    j.memo, j.is_posted, j.created_by,
    ${schema.has_journal_types_table ? 'jt.name as journal_type_name,' : '\'General Journal\' as journal_type_name,'}
    (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id) as total_debits,
    (SELECT SUM(credit) FROM journal_lines WHERE journal_id = j.id) as total_credits,
    (SELECT COUNT(*) FROM journal_lines WHERE journal_id = j.id) as line_count,
    (SELECT COUNT(*) FROM journal_attachments WHERE journal_id = j.id) as attachment_count
  `;
  
  // Build the ordering by available date column
  let orderBy = schema.has_transaction_date ? 'j.transaction_date' : schema.has_date ? 'j.date' : 'j.id';
  
  // Update join based on schema
  const joinClause = schema.has_journal_types_table && schema.has_journal_type ? 
    'LEFT JOIN journal_types jt ON j.journal_type = jt.code' : '';
  
  // Add pagination parameters
  params.push(limit);
  params.push(offset);
  
  // Build the final query with proper parameter references
  const query = `
    SELECT ${selectFields.trim()}
    FROM journals j
    ${joinClause}
    ${whereClause}
    ORDER BY ${orderBy} DESC, j.id DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  
  const journalsResult = await sql.query(query, params);
  
  return {
    journals: journalsResult.rows as Journal[],
    total
  };
}

/**
 * Get the next sequential journal number
 */
async function getNextJournalNumber(client: any): Promise<string> {
  try {
    // Get the highest journal number currently in use
    const result = await client.query(`
      SELECT MAX(CAST(NULLIF(REGEXP_REPLACE(journal_number, '[^0-9]', '', 'g'), '') AS INTEGER)) as max_num 
      FROM journals 
      WHERE journal_number ~ '^[0-9]+$'
    `);
    
    const maxNum = result.rows[0].max_num || 0;
    const nextNum = maxNum + 1;
    
    // Format the number with leading zeros
    return nextNum.toString().padStart(5, '0');
  } catch (error) {
    console.error('Error generating next journal number:', error);
    // Fallback to timestamp-based number if there's an error
    return Date.now().toString().slice(-6);
  }
}

/**
 * Create a new journal entry with lines and attachments
 */
export async function createJournal(journal: Journal, userId: string): Promise<number> {
  // Validate journal is balanced
  const totalDebits = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredits = journal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  
  // Check if debits equal credits (allow for small rounding differences)
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error('Journal entry must balance (debits must equal credits)');
  }
  
  // Ensure each line has either debit OR credit, not both
  for (const line of journal.lines) {
    if (line.debit > 0 && line.credit > 0) {
      throw new Error('Each journal line must have either a debit OR credit amount, not both');
    }
    
    // Ensure we don't have any zero-value lines
    if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
      throw new Error('Each journal line must have a non-zero debit or credit amount');
    }
  }
  
  // Check schema first for backwards compatibility
  const schemaCheck = await sql`
    SELECT 
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
  `;

  const schema = schemaCheck.rows[0];
  
  try {
    // Start a transaction
    const client = await sql.connect();
    let journalId: number;
    
    try {
      await client.query('BEGIN');
      
      // Create journal header with dynamic column selection based on schema
      let insertColumns = [];
      let placeholders = [];
      let values = [];
      let index = 1;
      
      // Add appropriate date column based on schema
      if (schema.has_transaction_date) {
        insertColumns.push('transaction_date');
        placeholders.push(`$${index++}`);
        values.push(journal.transaction_date);
      } else if (schema.has_date) {
        insertColumns.push('date');
        placeholders.push(`$${index++}`);
        values.push(journal.transaction_date);
      }
      
      // Add optional columns if they exist in schema
      if (schema.has_journal_type) {
        insertColumns.push('journal_type');
        placeholders.push(`$${index++}`);
        values.push(journal.journal_type || 'GJ');
      }
      
      if (schema.has_journal_number) {
        // Get the next journal number
        const nextJournalNumber = await getNextJournalNumber(client);
        insertColumns.push('journal_number');
        placeholders.push(`$${index++}`);
        values.push(journal.journal_number || nextJournalNumber);
      }
      
      if (schema.has_reference_number) {
        insertColumns.push('reference_number');
        placeholders.push(`$${index++}`);
        values.push(journal.reference_number || null);
      }
      
      // Required columns always exist
      insertColumns.push('memo', 'source', 'created_by', 'user_id', 'is_posted');
      placeholders.push(`$${index++}`, `$${index++}`, `$${index++}`, `$${index++}`, `$${index++}`);
      values.push(journal.memo, journal.source || null, userId, userId, journal.is_posted !== undefined ? journal.is_posted : true);
      
      console.log(`[createJournal] Creating journal for user: ${userId}`);
      
      // Build the query
      const insertQuery = `
        INSERT INTO journals (${insertColumns.join(', ')})
        VALUES (${placeholders.join(', ')})
        RETURNING id
      `;
      
      const journalResult = await client.query(insertQuery, values);
      journalId = journalResult.rows[0].id;
      
      // Check if journal_lines table has line_number column
      const lineNumberCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'journal_lines' AND column_name = 'line_number'
        ) as exists;
      `);
      
      const hasLineNumber = lineNumberCheck.rows[0].exists;
      
      // Insert journal lines based on schema
      for (const line of journal.lines) {
        if (hasLineNumber) {
          // If line_number column exists, use it
          await client.query(`
            INSERT INTO journal_lines (
              journal_id, line_number, account_id, description, debit, credit,
              category, location, vendor, funder, user_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
            )
          `, [
            journalId,
            line.line_number,
            line.account_id,
            line.description,
            line.debit || 0,
            line.credit || 0,
            line.category || null,
            line.location || null,
            line.vendor || null,
            line.funder || null,
            userId // Add the user_id to ensure it's not null
          ]);
        } else {
          // If line_number column doesn't exist, omit it
          await client.query(`
            INSERT INTO journal_lines (
              journal_id, account_id, description, debit, credit,
              category, location, vendor, funder, user_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
          `, [
            journalId,
            line.account_id,
            line.description,
            line.debit || 0,
            line.credit || 0,
            line.category || null,
            line.location || null,
            line.vendor || null,
            line.funder || null,
            userId // Add the user_id to ensure it's not null
          ]);
        }
      }
      
      // Insert attachments if any
      if (journal.attachments && journal.attachments.length > 0) {
        for (const attachment of journal.attachments) {
          await client.query(`
            INSERT INTO journal_attachments (
              journal_id, file_name, file_path, file_size, file_type, uploaded_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6
            )
          `, [
            journalId,
            attachment.file_name,
            attachment.file_path,
            attachment.file_size || 0,
            attachment.file_type || 'application/octet-stream',
            userId
          ]);
        }
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      return journalId;
    } catch (error) {
      // Rollback in case of error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (error) {
    console.error('Error creating journal:', error);
    throw error;
  }
}

/**
 * Update an existing journal
 */
export async function updateJournal(journal: Journal, userId: string): Promise<void> {
  if (!journal.id) {
    throw new Error('Journal ID is required for update');
  }
  
  // Call beforeUpdate hook for validation (e.g., check if posted)
  const { valid: canUpdate, error: beforeUpdateError } = await beforeUpdate(journal.id, journal, userId);
  if (!canUpdate) {
    throw new Error(beforeUpdateError || 'Pre-update validation failed.');
  }
  
  // Get the current state for audit, before any changes are made
  const beforeState = await getJournal(journal.id);
  if (!beforeState) {
    // This case should ideally be caught by beforeUpdate if journal doesn't exist
    throw new Error('Journal not found, cannot capture before state for audit.');
  }
  
  // Start a transaction
  const client = await sql.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check schema first for backwards compatibility
    const schemaCheck = await client.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
    `);
    
    const schema = schemaCheck.rows[0];
    
    // Build update query dynamically based on schema
    let updateSets = [];
    let values = [];
    let index = 1;
    
    // Handle date field based on schema
    if (schema.has_transaction_date) {
      updateSets.push(`transaction_date = $${index++}`);
      values.push(journal.transaction_date);
    } else if (schema.has_date) {
      updateSets.push(`date = $${index++}`);
      values.push(journal.transaction_date);
    }
    
    // Handle optional columns if they exist
    if (schema.has_journal_type) {
      updateSets.push(`journal_type = $${index++}`);
      values.push(journal.journal_type || 'GJ');
    }
    
    if (schema.has_reference_number) {
      updateSets.push(`reference_number = $${index++}`);
      values.push(journal.reference_number || null);
    }
    
    // Add required columns
    updateSets.push(`memo = $${index++}`, `source = $${index++}`);
    values.push(journal.memo, journal.source || null);
    
    // Add journal ID
    values.push(journal.id);
    
    // Build and execute update query
    if (updateSets.length > 0) {
      const updateQuery = `
        UPDATE journals
        SET ${updateSets.join(', ')}
        WHERE id = $${index}
      `;
      
      await client.query(updateQuery, values);
    }
    
    // Delete existing lines to replace with new ones
    await client.query('DELETE FROM journal_lines WHERE journal_id = $1', [journal.id]);
    
    // Insert updated journal lines
    for (const line of journal.lines) {
      await client.query(`
        INSERT INTO journal_lines (
          journal_id, line_number, account_id, description, debit, credit
        ) VALUES (
          $1, $2, $3, $4, $5, $6
        )
      `, [
        journal.id,
        line.line_number,
        line.account_id,
        line.description,
        line.debit || 0,
        line.credit || 0
      ]);
    }
    
    // Commit the transaction before calling afterUpdate hook
    await client.query('COMMIT');

    // Call afterUpdate hook for audit logging and other side effects
    // The 'journal' object passed to this function serves as the 'afterState'
    await afterUpdate(journal.id, beforeState, journal, userId);

  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

/**
 * Post a journal
 */
export async function postJournal(journalId: number, userId: string): Promise<void> {
  // Check if journal exists and is not already posted
  const journalResult = await sql`
    SELECT is_posted, journal_type, transaction_date, memo, source, reference_number, created_by, created_at
    FROM journals 
    WHERE id = ${journalId} AND is_deleted = FALSE
  `;
  
  if (journalResult.rows.length === 0) {
    throw new Error('Journal not found or has been deleted');
  }
  if (journalResult.rows[0].is_posted) {
    throw new Error('Journal is already posted');
  }

  // Fetch the full 'beforeState' including lines for the audit log
  // This is done before any hooks that might alter the journal for posting validation
  const beforeState = await getJournal(journalId);
  if (!beforeState) {
    // Should not happen if the above check passed, but good for type safety
    throw new Error('Failed to fetch journal details for audit before posting.');
  }

  // Call beforePost hook for validation before attempting to post
  const { valid, error: beforePostError } = await beforePost(beforeState, userId);
  if (!valid) {
    throw new Error(beforePostError || 'Pre-posting validation failed.');
  }
  
  // Start a transaction
  const client = await sql.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update journal to posted
    await client.query(`
      UPDATE journals
      SET is_posted = TRUE
      WHERE id = $1
    `, [journalId]);
    
    // Construct afterState based on beforeState and the change made
    const afterState = { ...beforeState, is_posted: true };
    
    // Call afterPost hook for audit logging and other side effects
    // The hook will handle inserting into journal_audit with action 'POST'
    // Note: afterPost itself calls recordAuditEvent
    await afterPost(journalId, userId, beforeState, afterState);
        
    // Commit the transaction
    await client.query('COMMIT');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

/**
 * Unpost a journal
 */
export async function unpostJournal(journalId: number, userId: string): Promise<void> {
  // Check if journal exists, is not deleted, and is actually posted
  const journalCheck = await sql`
    SELECT is_posted 
    FROM journals 
    WHERE id = ${journalId} AND is_deleted = FALSE
  `;

  if (journalCheck.rows.length === 0) {
    throw new Error('Journal not found or has been deleted.');
  }
  if (!journalCheck.rows[0].is_posted) {
    throw new Error('Journal is not currently posted.');
  }

  // Get the current full state for audit before unposting
  const beforeState = await getJournal(journalId);
  if (!beforeState) {
    // Should not happen if the above check passed, but good for type safety
    throw new Error('Failed to fetch journal details for audit before unposting.');
  }

  // Start a transaction
  const client = await sql.connect();
  try {
    await client.query('BEGIN');

    // Update journal to unposted
    await client.query(
      `UPDATE journals SET is_posted = FALSE WHERE id = $1`,
      [journalId]
    );

    // Construct afterState based on beforeState and the change made
    const afterState = { ...beforeState, is_posted: false };

    // Call afterUnpost hook for audit logging and other side effects
    await afterUnpost(journalId, userId, beforeState, afterState);

    // Commit the transaction
    await client.query('COMMIT');

  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error(`Error in unpostJournal for journal ${journalId}:`, error);
    throw error; // Re-throw the error after logging and rollback
  } finally {
    // Release the client back to the pool
    client.release();
  }
}

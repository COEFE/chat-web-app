import { sql } from '@vercel/postgres';

/**
 * Creates bank transactions for journal lines that affect bank accounts
 * @param journalId - The ID of the journal entry
 * @param userId - The ID of the user creating the transactions
 * @returns Object containing the number of transactions created
 */
export async function createBankTransactionsFromJournal(journalId: number, userId: string): Promise<{ 
  transactionsCreated: number 
}> {
  try {
    // First check the journal schema to see available columns
    const { rows: schemaResults } = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') AS has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') AS has_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'memo') AS has_memo,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'description') AS has_description,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') AS has_reference_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference') AS has_reference,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'account_type') AS has_account_type,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'type') AS has_type
      `;
    
    const schema = schemaResults[0];
    
    // Build dynamic query for journal information based on available columns
    let dateColumn = 'created_at::date';
    if (schema.has_transaction_date) {
      dateColumn = 'transaction_date';
    } else if (schema.has_date) {
      dateColumn = 'date';
    }
    
    let referenceColumn = "''";
    if (schema.has_reference_number) {
      referenceColumn = 'reference_number';
    } else if (schema.has_reference) {
      referenceColumn = 'reference';
    }
    
    let descriptionColumn = "''";
    if (schema.has_memo) {
      descriptionColumn = 'memo';
    } else if (schema.has_description) {
      descriptionColumn = 'description';
    }
    
    // Get journal information with dynamic columns
    const journalQuery = `
      SELECT 
        id,
        ${dateColumn} AS journal_date,
        ${referenceColumn} AS reference,
        ${descriptionColumn} AS description
      FROM journals
      WHERE id = $1
    `;
    
    const { rows: journalRows } = await sql.query(journalQuery, [journalId]);
    
    if (journalRows.length === 0) {
      throw new Error(`Journal ID ${journalId} not found`);
    }
    
    const journal = journalRows[0];
    
    // Get journal lines that affect bank accounts
    // Join with accounts to get the account type and bank_account_id
    let accountTypeColumn = "'unknown'";
    if (schema.has_account_type) {
      accountTypeColumn = 'a.account_type';
    } else if (schema.has_type) {
      accountTypeColumn = 'a.type';
    }
    
    const journalLineQuery = `
      SELECT 
        jl.id,
        jl.debit,
        jl.credit,
        jl.description,
        jl.account_id,
        a.name AS account_name,
        ${accountTypeColumn} AS account_type,
        ba.id AS bank_account_id
      FROM journal_lines jl
      JOIN accounts a ON jl.account_id = a.id
      JOIN bank_accounts ba ON ba.gl_account_id = a.id
      WHERE 
        jl.journal_id = $1
        AND ba.is_active = TRUE
        AND ba.is_deleted = FALSE
    `;
    
    const { rows: journalLines } = await sql.query(journalLineQuery, [journalId]);
    
    console.log(`Found ${journalLines.length} journal lines affecting bank accounts`);
    
    if (journalLines.length === 0) {
      // No bank account-linked journal lines
      return { transactionsCreated: 0 };
    }
    
    // For each journal line affecting a bank account, create a bank transaction
    let transactionsCreated = 0;
    
    for (const line of journalLines) {
      // Determine amount and transaction type
      let amount: number;
      let transactionType: 'credit' | 'debit';
      
      if (line.debit > 0) {
        amount = line.debit;
        // In accounting, a debit to a bank account means money coming in (credit in bank terms)
        transactionType = 'credit';
      } else if (line.credit > 0) {
        amount = line.credit;
        // In accounting, a credit to a bank account means money going out (debit in bank terms)
        transactionType = 'debit';
      } else {
        // Skip lines with zero amount
        continue;
      }
      
      // Create a description based on journal + line description
      const description = line.description || journal.description || `Journal #${journalId}`;
      
      // Create the bank transaction
      const { rows: transactionRows } = await sql`
        INSERT INTO bank_transactions (
          bank_account_id,
          transaction_date,
          post_date,
          description,
          amount,
          transaction_type,
          status,
          reference_number,
          match_type,
          notes
        ) 
        VALUES (
          ${line.bank_account_id},
          ${journal.journal_date},
          CURRENT_DATE,
          ${description},
          ${amount},
          ${transactionType},
          'unmatched',
          ${journal.reference || `J-${journalId}`},
          'journal',
          ${`Auto-generated from journal #${journalId}, affecting account ${line.account_name}`}
        )
        RETURNING id
      `;
      
      if (transactionRows.length > 0) {
        transactionsCreated++;
        
        // Try to link the journal line to this bank transaction for future reference
        // But don't fail if the column doesn't exist yet
        try {
          await sql`
            UPDATE journal_lines 
            SET bank_transaction_id = ${transactionRows[0].id}
            WHERE id = ${line.id}
          `;
        } catch (linkErr) {
          // Just log this but continue - the bank transaction is created either way
          console.warn(`Could not link journal line ${line.id} to bank transaction ${transactionRows[0].id}: ${linkErr}`);
        }
      }
    }
    
    console.log(`Created ${transactionsCreated} bank transactions from journal #${journalId}`);
    return { transactionsCreated };
    
  } catch (error) {
    console.error('Error creating bank transactions from journal:', error);
    throw error;
  }
}

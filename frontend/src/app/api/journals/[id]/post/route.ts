import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { createEmbedding } from '@/lib/ai/embeddings';
import { createBankTransactionsFromJournal } from '@/lib/accounting/bankIntegration';

// POST /api/journals/:id/post - post (finalize) a journal entry
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  // Extract and parse the ID more carefully
  const pathParts = req.nextUrl.pathname.split('/');
  const idPart = pathParts[pathParts.indexOf('journals') + 1] || '';
  console.log('API received path:', req.nextUrl.pathname);
  console.log('Path parts:', pathParts);
  console.log('Extracted ID part:', idPart);
  
  const id = parseInt(idPart, 10);
  console.log('Parsed ID:', id, 'isNaN:', isNaN(id));
  
  if (isNaN(id)) {
    return NextResponse.json({ error: `Invalid journal ID: '${idPart}'` }, { status: 400 });
  }

  try {
    // Check if journal exists and is not already posted or deleted
    const { rows: journalRows } = await sql`
      SELECT is_posted, is_deleted FROM journals WHERE id = ${id}
    `;
    
    if (journalRows.length === 0) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    
    if (journalRows[0].is_posted) {
      return NextResponse.json({ error: 'Journal entry is already posted' }, { status: 400 });
    }
    
    if (journalRows[0].is_deleted) {
      return NextResponse.json({ error: 'Cannot post a deleted journal entry' }, { status: 400 });
    }

    // Verify the journal entry is balanced
    const { rows: balanceRows } = await sql`
      SELECT 
        SUM(debit) AS total_debit, 
        SUM(credit) AS total_credit 
      FROM 
        journal_lines 
      WHERE 
        journal_id = ${id}
    `;
    
    const totalDebit = parseFloat(balanceRows[0].total_debit || 0);
    const totalCredit = parseFloat(balanceRows[0].total_credit || 0);
    
    if (Math.abs(totalDebit - totalCredit) > 0.01) { // Allow for small rounding errors
      return NextResponse.json({ 
        error: `Journal entry is out of balance. Debits: ${totalDebit}, Credits: ${totalCredit}` 
      }, { status: 400 });
    }

    // Begin transaction
    await sql`BEGIN`;
    
    try {
      // Mark journal as posted
      await sql`
        UPDATE journals SET is_posted = TRUE WHERE id = ${id}
      `;
      
      // Try to create or fix the journal_audit table if needed
      try {
        // First check if the table exists
        const { rows: tableCheck } = await sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'journal_audit'
          ) as exists
        `;
        
        // If table doesn't exist, create it with all needed columns
        if (!tableCheck[0].exists) {
          console.log('Creating journal_audit table from scratch...');
          await sql`
            CREATE TABLE journal_audit (
              id SERIAL PRIMARY KEY,
              journal_id INTEGER NOT NULL,
              action VARCHAR(50),
              changed_by VARCHAR(255) NOT NULL,
              changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              before JSONB,
              after JSONB
            )
          `;
        } else {
          // Get existing columns in the table
          const { rows: columns } = await sql`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'journal_audit'
          `;
          const existingColumns = columns.map(col => col.column_name);
          console.log('Existing columns in journal_audit:', existingColumns);
          
          // Check and add each required column if missing
          if (!existingColumns.includes('action')) {
            console.log('Adding action column to journal_audit table...');
            await sql`ALTER TABLE journal_audit ADD COLUMN action VARCHAR(50)`;
          }
          
          if (!existingColumns.includes('changed_by')) {
            console.log('Adding changed_by column to journal_audit table...');
            await sql`ALTER TABLE journal_audit ADD COLUMN changed_by VARCHAR(255)`;
          }
          
          if (!existingColumns.includes('changed_at')) {
            console.log('Adding changed_at column to journal_audit table...');
            await sql`ALTER TABLE journal_audit ADD COLUMN changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`;
          }
          
          if (!existingColumns.includes('journal_id')) {
            console.log('Adding journal_id column to journal_audit table...');
            await sql`ALTER TABLE journal_audit ADD COLUMN journal_id INTEGER`;
          }
        }
        
        // Now insert the audit record safely
        await sql`
          INSERT INTO journal_audit (
            journal_id, 
            action, 
            changed_by, 
            changed_at
          ) VALUES (
            ${id}, 
            'POSTED', 
            ${userId}, 
            CURRENT_TIMESTAMP
          )
        `;
      } catch (auditErr) {
        // Just log this but don't fail the transaction - posting is more important than audit
        console.error('Audit logging error:', auditErr);
      }
      
      // Commit transaction
      await sql`COMMIT`;
      
      // Create bank transactions for this journal if it affects bank accounts
      let bankTransactionsCreated = 0;
      let embeddingCount = 0; // Initialize embeddingCount in the outer scope

      try {
        const { transactionsCreated } = await createBankTransactionsFromJournal(id, userId);
        bankTransactionsCreated = transactionsCreated;
        console.log(`Created ${transactionsCreated} bank transactions from journal #${id}`);
      } catch (bankErr) {
        // Log but don't fail the process if bank transactions can't be created
        console.error('Error creating bank transactions:', bankErr);
      }
      
      // After successful posting, generate embeddings for the journal lines
      try {
        // Get journal lines that need embeddings
        const { rows: journalLines } = await sql`
          SELECT 
            jl.id,
            jl.description,
            a.name as account_name,
            jl.debit,
            jl.credit
          FROM 
            journal_lines jl
          LEFT JOIN
            accounts a ON jl.account_id = a.id
          WHERE 
            jl.journal_id = ${id} AND
            jl.embedding IS NULL
        `;
        
        console.log(`[journals/post] Generating embeddings for ${journalLines.length} journal lines from newly posted journal #${id}`);
        
        // Generate and store embeddings for each line
        for (const line of journalLines) {
          try {
            // Create text for embedding
            const textToEmbed = [
              line.description || '',
              line.account_name || '',
              `Debit: ${line.debit || 0}`,
              `Credit: ${line.credit || 0}`
            ].filter(Boolean).join(' ');
            
            if (textToEmbed.trim().length === 0) {
              continue; // Skip if no text to embed
            }
            
            // Generate embedding
            const embedding = await createEmbedding(textToEmbed);
            
            if (embedding) {
              // Convert embedding array to string for PostgreSQL
              const embeddingStr = `[${embedding.join(',')}]`;
              
              // Store embedding in database
              await sql`
                UPDATE journal_lines
                SET embedding = ${embeddingStr}::vector
                WHERE id = ${line.id}
              `;
              
              embeddingCount++;
            }
          } catch (lineError) {
            console.error(`[journals/post] Error generating embedding for line ${line.id}:`, lineError);
            // Continue with other lines even if one fails
          }
        }
        
        console.log(`[journals/post] Successfully generated ${embeddingCount} embeddings for journal #${id}`);
      } catch (embeddingError) {
        // Don't fail the transaction if embedding generation fails
        console.error(`[journals/post] Error generating embeddings for journal #${id}:`, embeddingError);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Journal entry posted successfully',
        journal_id: id,
        embeddings_generated: embeddingCount,
        bank_transactions_created: bankTransactionsCreated
      });
    } catch (txError) {
      // Rollback on error
      await sql`ROLLBACK`;
      throw txError;
    }
  } catch (err: any) {
    console.error(`[journals/${id}/post] POST error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

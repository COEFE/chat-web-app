import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { createBankTransactionsFromJournal } from '@/lib/accounting/bankIntegration';

// POST /api/bank-accounts/convert-journals - Convert existing journal entries to bank transactions
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get request parameters
    const body = await req.json();
    const limit = body.limit || 100; // Default limit to avoid processing too many at once
    
    // Find posted journals with lines affecting bank accounts
    const { rows: journals } = await sql`
      SELECT DISTINCT j.id
      FROM journals j
      JOIN journal_lines jl ON j.id = jl.journal_id
      JOIN accounts a ON jl.account_id = a.id
      JOIN bank_accounts ba ON ba.gl_account_id = a.id
      WHERE 
        j.is_posted = TRUE 
        AND j.is_deleted = FALSE
        AND ba.is_active = TRUE
        AND ba.is_deleted = FALSE
      ORDER BY j.id DESC
      LIMIT ${limit}
    `;
    
    console.log(`Found ${journals.length} journals to convert to bank transactions`);
    
    if (journals.length === 0) {
      return NextResponse.json({
        message: 'No eligible journals found to convert',
        journals_processed: 0,
        transactions_created: 0
      });
    }
    
    // Process each journal
    let journalsProcessed = 0;
    let totalTransactionsCreated = 0;
    
    for (const journal of journals) {
      try {
        // Create bank transactions for this journal
        const { transactionsCreated } = await createBankTransactionsFromJournal(journal.id, userId);
        
        if (transactionsCreated > 0) {
          journalsProcessed++;
          totalTransactionsCreated += transactionsCreated;
          console.log(`Created ${transactionsCreated} bank transactions from journal #${journal.id}`);
        }
      } catch (err) {
        console.error(`Error processing journal #${journal.id}:`, err);
        // Continue with other journals
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Successfully processed ${journalsProcessed} journals and created ${totalTransactionsCreated} bank transactions`,
      journals_processed: journalsProcessed,
      transactions_created: totalTransactionsCreated
    });
  } catch (err) {
    console.error('Error converting journals to bank transactions:', err);
    return NextResponse.json(
      { error: 'Failed to convert journals to bank transactions', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

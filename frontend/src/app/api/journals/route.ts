import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { 
  getJournals, 
  createJournal, 
  getJournal, 
  getJournalTypes, 
  Journal, 
  JournalLine 
} from '@/lib/accounting/journalQueries';
import { beforePost, afterPost } from '@/lib/accounting/hooks';

// GET /api/journals - fetch journal entries with optional filters
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const journalType = url.searchParams.get('journalType') || undefined;
    const isPostedParam = url.searchParams.get('isPosted');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    // Special parameter for getting journal types
    if (url.searchParams.get('types') === 'true') {
      const types = await getJournalTypes();
      return NextResponse.json(types);
    }
    
    // Special parameter for getting a specific journal
    const journalId = url.searchParams.get('id');
    if (journalId) {
      const journal = await getJournal(parseInt(journalId, 10), userId);
      if (!journal) {
        return NextResponse.json({ error: 'Journal not found' }, { status: 404 });
      }
      return NextResponse.json(journal);
    }
    
    // Handle isPosted parameter
    let isPosted: boolean | undefined = undefined;
    if (isPostedParam === 'true') {
      isPosted = true;
    } else if (isPostedParam === 'false') {
      isPosted = false;
    }
    
    // Get journals with pagination and filters
    // Always pass userId for data privacy/isolation
    const { journals, total } = await getJournals(
      page,
      limit,
      journalType,
      startDate,
      endDate,
      isPosted,
      userId // Pass userId to ensure data privacy
    );
    
    return NextResponse.json({
      journals,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[journals] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch journals' },
      { status: 500 }
    );
  }
}

// POST /api/journals - create a new journal entry
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;
  
  console.log('[API] Authenticated userId:', userId);

  try {
    const body = await req.json();
    
    console.log('[API] Received request body:', JSON.stringify(body, null, 2));
    console.log('[API] Number of lines received:', body.journal?.lines ? body.journal.lines.length : 'No lines property');
    
    // Handle the new format with nested journal object
    if (body.journal && body.journal.lines && Array.isArray(body.journal.lines)) {
      const { journal } = body;
      const { journal_date, memo, source, reference_number, lines } = journal;
      
      // Validate required fields
      if (!journal_date) {
        return NextResponse.json({ error: 'Date is required' }, { status: 400 });
      }
      
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return NextResponse.json({ error: 'At least one journal line is required' }, { status: 400 });
      }
      
      // Check for balanced debits and credits using the correct field names
      const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
      
      // Ensure we don't have lines with both debit and credit values
      for (const line of lines) {
        if ((parseFloat(line.debit) || 0) > 0 && (parseFloat(line.credit) || 0) > 0) {
          return NextResponse.json({
            error: 'Each journal line must have either a debit OR credit amount, not both',
            problemLine: line
          }, { status: 400 });
        }
      }
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        return NextResponse.json({
          error: `Journal entry must balance. Total debits: $${totalDebits.toFixed(2)}, Total credits: $${totalCredits.toFixed(2)}`,
          totalDebits,
          totalCredits
        }, { status: 400 });
      }
      
      // Create the journal entry
      const journalEntry = await createJournal({
        journal_type: journal.journal_type || 'GJ',
        journal_date: journal_date, // Keep as string since interface expects string
        memo: memo || '',
        source: source || '',
        reference_number: reference_number || '',
        is_posted: false,
        created_by: userId,
        lines: lines
      }, userId);
      
      return NextResponse.json({ 
        message: 'Journal entry created successfully', 
        journal: journalEntry 
      });
    }
    // Legacy format handling (keep existing logic)
    else if (body.date && body.lines && Array.isArray(body.lines)) {
      // Legacy format
      const { date, memo, source, lines } = body;
      
      // Validate required fields
      if (!date) {
        return NextResponse.json({ error: 'Date is required' }, { status: 400 });
      }
      
      if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return NextResponse.json({ error: 'At least one journal line is required' }, { status: 400 });
      }
      
      // Check for balanced debits and credits
      const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
      
      // Ensure we don't have lines with both debit and credit values
      for (const line of lines) {
        if ((parseFloat(line.debit_amount) || 0) > 0 && (parseFloat(line.credit_amount) || 0) > 0) {
          return NextResponse.json({
            error: 'Each journal line must have either a debit OR credit amount, not both',
            problemLine: line
          }, { status: 400 });
        }
      }
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) { // Allow for small rounding differences
        // Attempt to auto-balance using suspense account 9999
        try {
          const diff = parseFloat((totalDebits - totalCredits).toFixed(2));
          const suspenseAccountSearch = '9999';
          
          // Find suspense account
          const suspenseAccountResult = await sql`
            SELECT id, name, code 
            FROM accounts 
            WHERE code = ${suspenseAccountSearch}
            LIMIT 1
          `;
          
          if (suspenseAccountResult.rows.length > 0) {
            const suspenseAccount = suspenseAccountResult.rows[0];
            
            // Add balancing line
            lines.push({
              accountId: suspenseAccount.id,
              description: 'Auto-balancing entry',
              debit_amount: diff < 0 ? Math.abs(diff) : 0,
              credit_amount: diff > 0 ? diff : 0
            });
            
            // Recalculate totals after adding balancing line
            const newTotalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit_amount) || 0), 0);
            const newTotalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit_amount) || 0), 0);
            
            if (Math.abs(newTotalDebits - newTotalCredits) <= 0.01) {
            } else {
              return NextResponse.json({
                error: `Failed to auto-balance journal. Remaining difference: ${(newTotalDebits - newTotalCredits).toFixed(2)}`,
              }, { status: 400 });
            }
          } else {
            // No suspense account found, return original error
            return NextResponse.json({
              error: `Journal entry is not balanced. Difference: ${(totalDebits - totalCredits).toFixed(2)}. Create account 9999 for auto-balancing.`,
              totalDebits,
              totalCredits,
              difference: totalDebits - totalCredits
            }, { status: 400 });
          }
        } catch (error) {
          console.error('Error during auto-balancing:', error);
          return NextResponse.json({
            error: `Journal entry is not balanced. Difference: ${(totalDebits - totalCredits).toFixed(2)}`,
            totalDebits,
            totalCredits,
            difference: totalDebits - totalCredits
          }, { status: 400 });
        }
      }
      
      // Convert to new journal format
      const journal: Journal = {
        journal_date: date,
        memo: memo || '',
        source: source,
        journal_type: 'GJ', // Default to General Journal for legacy entries
        is_posted: false,
        lines: lines.map((line: any, index: number): JournalLine => ({
          line_number: index + 1,
          account_id: line.accountId || line.account_id,
          description: line.description || '',
          debit_amount: (parseFloat(line.debit_amount) || 0) > 0 ? parseFloat(line.debit_amount) : 0,
          credit_amount: (parseFloat(line.credit_amount) || 0) > 0 ? parseFloat(line.credit_amount) : 0
        }))
      };
      
      // Run pre-post validation hooks
      const validation = await beforePost(journal, userId);
      if (!validation.valid) {
        return NextResponse.json({
          error: validation.error || 'Journal validation failed'
        }, { status: 400 });
      }
      
      // Create journal with new function
      const journalId = await createJournal(journal, userId);
      
      // Run post-save hooks
      afterPost(journalId, userId).catch(hookError => {
        console.error('Error in afterPost hook:', hookError);
        // Don't block the response for hook errors
      });
      
      return NextResponse.json({
        id: journalId,
        message: 'Journal entry created successfully'
      });
    } else if (body.journal) {
      // New format
      const journal: Journal = body.journal;
      
      // Validate required fields
      if (!journal.journal_date) {
        return NextResponse.json({ error: 'Transaction date is required' }, { status: 400 });
      }
      
      if (!journal.journal_type) {
        return NextResponse.json({ error: 'Journal type is required' }, { status: 400 });
      }
      
      if (!journal.lines || !Array.isArray(journal.lines) || journal.lines.length === 0) {
        return NextResponse.json({ error: 'At least one journal line is required' }, { status: 400 });
      }
      
      // Check for balanced debits and credits
      const totalDebits = journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.debit_amount)) || 0), 0);
      const totalCredits = journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.credit_amount)) || 0), 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) { // Allow for small rounding differences
        return NextResponse.json({
          error: 'Journal entries must balance. Debits and credits are not equal.',
          totalDebits,
          totalCredits,
          difference: totalDebits - totalCredits
        }, { status: 400 });
      }
      
      // Create journal with new function
      const journalId = await createJournal(journal, userId);
      
      return NextResponse.json({
        id: journalId,
        message: 'Journal entry created successfully'
      });
    } else {
      return NextResponse.json({ 
        error: 'Invalid request format. Expected either legacy format with date and lines, or new format with journal object.'
      }, { status: 400 });
    }
  } catch (err: any) {
    console.error('[journals] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create journal entry' },
      { status: 500 }
    );
  }
}

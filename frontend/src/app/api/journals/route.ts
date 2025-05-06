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
      const journal = await getJournal(parseInt(journalId, 10));
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
    const { journals, total } = await getJournals(
      page,
      limit,
      journalType,
      startDate,
      endDate,
      isPosted
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

  try {
    const body = await req.json();
    
    // Detect what format we're dealing with (legacy or new)
    if (body.date && body.lines && Array.isArray(body.lines)) {
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
      const totalDebits = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
      
      // Detailed line checking for debugging
      const lineDetails = lines.map((line, i) => ({
        index: i,
        accountId: line.accountId || line.account_id,
        debit: parseFloat(line.debit) || 0,
        credit: parseFloat(line.credit) || 0,
        type: typeof line.debit,
        rawDebit: line.debit,
        rawCredit: line.credit
      }));
      
      console.log('Journal balance check:', { 
        totalDebits: totalDebits.toFixed(2), 
        totalCredits: totalCredits.toFixed(2),
        difference: (totalDebits - totalCredits).toFixed(2),
        lineCount: lines.length
      });
      
      // Ensure we don't have lines with both debit and credit values
      for (const line of lines) {
        if ((parseFloat(line.debit) || 0) > 0 && (parseFloat(line.credit) || 0) > 0) {
          return NextResponse.json({
            error: 'Each journal line must have either a debit OR credit amount, not both',
            problemLine: line
          }, { status: 400 });
        }
      }
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) { // Allow for small rounding differences
        return NextResponse.json({
          error: `Journal entry is not balanced. Difference: ${(totalDebits - totalCredits).toFixed(2)}`,
          totalDebits,
          totalCredits,
          difference: totalDebits - totalCredits,
          lineDetails: lineDetails
        }, { status: 400 });
      }
      
      // Convert to new journal format
      const journal: Journal = {
        transaction_date: date,
        memo: memo || '',
        source: source,
        journal_type: 'GJ', // Default to General Journal for legacy entries
        is_posted: false,
        lines: lines.map((line: any, index: number): JournalLine => ({
          line_number: index + 1,
          account_id: line.accountId || line.account_id,
          description: line.description || '',
          debit: (parseFloat(line.debit) || 0) > 0 ? parseFloat(line.debit) : 0,
          credit: (parseFloat(line.credit) || 0) > 0 ? parseFloat(line.credit) : 0
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
      if (!journal.transaction_date) {
        return NextResponse.json({ error: 'Transaction date is required' }, { status: 400 });
      }
      
      if (!journal.journal_type) {
        return NextResponse.json({ error: 'Journal type is required' }, { status: 400 });
      }
      
      if (!journal.lines || !Array.isArray(journal.lines) || journal.lines.length === 0) {
        return NextResponse.json({ error: 'At least one journal line is required' }, { status: 400 });
      }
      
      // Check for balanced debits and credits
      const totalDebits = journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0);
      const totalCredits = journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0);
      
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

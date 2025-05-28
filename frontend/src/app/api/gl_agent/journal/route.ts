import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { createJournalFromAI } from '@/lib/journalUtils';
import { logAuditEvent } from '@/lib/auditLogger';
import { AIJournalEntry } from '@/lib/journalUtils';
import { GLAgent } from '@/lib/agents/glAgent';

/**
 * POST /api/gl_agent/journal
 * Creates a journal entry through the GL Agent
 * This endpoint allows other agents (like AP agent) to create journal entries
 * through the GL agent, maintaining proper separation of concerns
 */
export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      console.log('[GL Agent Journal API] Authentication failed');
      return error;
    }
    
    // Parse request body
    const body = await request.json();
    
    // For internal API calls, use the userId from the request body
    let effectiveUserId = userId;
    
    // Special handling for internal API calls
    if (userId === 'internal-api') {
      // If the request comes from an internal API call, check for userId in the body
      if (body.userId && body.userId !== 'internal-api') {
        // If a valid user ID is provided in the body, use it
        effectiveUserId = body.userId;
        console.log('[GL Agent Journal API] Using userId from request body for internal API call:', effectiveUserId);
      } else if (body.originator === 'AP_BILL_PAYMENT') {
        // For bill payments, use a special system user ID
        effectiveUserId = 'system-bill-payment';
        console.log('[GL Agent Journal API] Using system user ID for bill payment journal');
      } else {
        // For other internal operations, use a default system user
        effectiveUserId = 'system-journal';
        console.log('[GL Agent Journal API] Using default system user ID for internal operation');
      }
    }
    
    // Log the effective user ID for debugging
    console.log('[GL Agent Journal API] Effective user ID:', effectiveUserId);
    
    console.log('[GL Agent Journal API] Authenticated user:', effectiveUserId);
    console.log('[GL Agent Journal API] Request URL:', request.url);
    console.log('[GL Agent Journal API] Request headers:', {
      contentType: request.headers.get('Content-Type'),
      authorization: request.headers.get('Authorization')?.substring(0, 15) + '...',
    });
    console.log('[GL Agent Journal API] Journal entry data:', {
      memo: body.journalEntry?.memo,
      journal_date: body.journalEntry?.journal_date,
      journal_type: body.journalEntry?.journal_type,
      reference_number: body.journalEntry?.reference_number,
      lineCount: body.journalEntry?.lines?.length,
      originator: body.originator
    });
    
    // Validate input
    if (!body.journalEntry) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Journal entry data is required' 
        },
        { status: 400 }
      );
    }
    
    const journalEntry = body.journalEntry as AIJournalEntry;
    
    // Validate required fields
    if (!journalEntry.memo || !journalEntry.journal_date || !journalEntry.lines || journalEntry.lines.length === 0) {
      return NextResponse.json({ 
        error: 'Missing required fields: memo, journal_date, and lines are required' 
      }, { status: 400 });
    }

    // Validate date format
    const journalDate = new Date(journalEntry.journal_date);
    if (isNaN(journalDate.getTime())) {
      return NextResponse.json({ 
        error: 'Invalid journal_date format' 
      }, { status: 400 });
    }

    // Validate lines have required fields
    for (const line of journalEntry.lines) {
      if (!line.account_code_or_name || (line.debit === undefined && line.credit === undefined)) {
        return NextResponse.json(
          { 
            success: false, 
            message: 'Each journal line must have account_code_or_name and either debit or credit amount.' 
          },
          { status: 400 }
        );
      }
    }
    
    console.log(`[GL Agent Journal API] Creating journal entry: ${journalEntry.memo}`);
    
    // Use the existing createJournalFromAI function to create the journal entry
    // This maintains consistency with how the GL agent would create entries
    const result = await createJournalFromAI(journalEntry, effectiveUserId);
    
    if (!result.success) {
      console.error(`[GL Agent Journal API] Error creating journal: ${result.message}`);
      return NextResponse.json(
        { 
          success: false, 
          message: result.message,
          missingAccounts: result.missingAccounts 
        },
        { status: 400 }
      );
    }
    
    // Log audit event for journal creation
    await logAuditEvent({
      user_id: effectiveUserId,
      action_type: 'JOURNAL_CREATED',
      entity_type: 'JOURNAL',
      entity_id: String(result.journalId),
      context: {
        source: 'gl_agent-api',
        memo: journalEntry.memo,
        journal_type: journalEntry.journal_type || 'JE',
        originator: body.originator || 'AP_AGENT'
      },
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });
    
    console.log(`[GL Agent Journal API] Successfully created journal entry with ID: ${result.journalId}`);
    
    return NextResponse.json({
      success: true,
      journalId: result.journalId,
      message: `Journal entry created successfully with ID: ${result.journalId}`
    });
  } catch (error) {
    console.error('[GL Agent Journal API] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error instanceof Error ? error.message : 'Unknown error creating journal entry'
      },
      { status: 500 }
    );
  }
}

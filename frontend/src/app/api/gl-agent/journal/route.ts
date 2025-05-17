import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { createJournalFromAI } from '@/lib/journalUtils';
import { logAuditEvent } from '@/lib/auditLogger';
import { AIJournalEntry } from '@/lib/journalUtils';
import { GLAgent } from '@/lib/agents/glAgent';

/**
 * POST /api/gl-agent/journal
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
    
    console.log('[GL Agent Journal API] Authenticated user:', userId);
    
    // Parse request body
    const body = await request.json();
    
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
    
    // Validate journal entry format has required fields
    if (!journalEntry.memo || !journalEntry.transaction_date || !journalEntry.lines || journalEntry.lines.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid journal entry format. Required fields: memo, transaction_date, and at least one line.' 
        },
        { status: 400 }
      );
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
    const result = await createJournalFromAI(journalEntry, userId);
    
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
      user_id: userId,
      action_type: 'JOURNAL_CREATED',
      entity_type: 'JOURNAL',
      entity_id: String(result.journalId),
      context: {
        source: 'gl-agent-api',
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

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { logAuditEvent } from '@/lib/auditLogger';

/**
 * POST /api/journals/post - Post one or more journal entries
 * Sets the is_posted flag to true for the specified journal IDs
 */
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse the request body
    const body = await req.json();
    
    // Validate required fields
    if (!body.journalIds || !Array.isArray(body.journalIds) || body.journalIds.length === 0) {
      return NextResponse.json({ 
        error: 'Invalid request: journalIds array is required' 
      }, { status: 400 });
    }

    const journalIds = body.journalIds;
    const postedDate = new Date().toISOString();
    let postedCount = 0;

    // Update each journal to mark it as posted
    for (const journalId of journalIds) {
      // Check if journal exists and is not already posted
      const existingJournal = await sql`
        SELECT id, is_posted 
        FROM journals 
        WHERE id = ${journalId} 
        AND is_deleted = false
      `;

      if (existingJournal.rows.length === 0) {
        console.warn(`Journal ID ${journalId} not found or deleted`);
        continue;
      }

      if (existingJournal.rows[0].is_posted) {
        console.warn(`Journal ID ${journalId} is already posted`);
        continue;
      }

      // Mark the journal as posted with current timestamp
      await sql`
        UPDATE journals 
        SET is_posted = true, 
            posted_date = ${postedDate}, 
            posted_by = ${userId},
            updated_at = ${postedDate}
        WHERE id = ${journalId}
      `;
      
      // Log the journal posting action
      await logAuditEvent({
        user_id: userId,
        action_type: "POST_JOURNAL",
        entity_type: "JOURNAL",
        entity_id: journalId.toString(),
        context: { postedDate },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      postedCount++;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully posted ${postedCount} journal entries`,
      postedCount,
      journalIds: journalIds
    });
  } catch (error) {
    console.error('[api/journals/post] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to post journal entries' },
      { status: 500 }
    );
  }
}

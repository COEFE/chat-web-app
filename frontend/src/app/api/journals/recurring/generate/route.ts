import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { addDays, addMonths, addQuarters, addYears, isAfter, isBefore, lastDayOfMonth } from 'date-fns';

// POST /api/journals/recurring/generate - generate recurring journal entries
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if recurring_journals table exists
    try {
      await sql`SELECT 1 FROM recurring_journals LIMIT 1`;
    } catch (err: any) {
      if (err.message.includes('relation "recurring_journals" does not exist')) {
        return NextResponse.json({
          error: 'Recurring journals table does not exist. Please set up first.',
          setupRequired: true
        }, { status: 404 });
      }
      throw err;
    }

    const today = new Date();
    const todayISOString = today.toISOString();
    const results = {
      generated: 0,
      skipped: 0,
      errors: 0,
      details: [] as string[]
    };

    // Get all active recurring journals that need to be generated
    const { rows: recurringJournals } = await sql`
      SELECT 
        rj.id, 
        rj.journal_id,
        rj.frequency,
        rj.start_date,
        rj.end_date,
        rj.day_of_month,
        rj.day_of_week,
        rj.last_generated,
        rj.is_active,
        j.memo,
        j.source,
        j.date as original_date
      FROM 
        recurring_journals rj
      JOIN 
        journals j ON rj.journal_id = j.id
      WHERE 
        rj.is_active = TRUE
        AND (rj.last_generated IS NULL OR rj.last_generated < ${todayISOString})
        AND rj.start_date <= ${todayISOString}
        AND (rj.end_date IS NULL OR rj.end_date >= ${todayISOString})
    `;

    // Process each recurring journal
    for (const recurring of recurringJournals) {
      try {
        // Determine the next date to generate based on frequency
        let nextDate = calculateNextDate(
          recurring.last_generated ? new Date(recurring.last_generated) : new Date(recurring.start_date),
          recurring.frequency,
          recurring.day_of_month,
          recurring.day_of_week
        );

        // Skip if the next date is in the future
        if (isAfter(nextDate, today)) {
          results.skipped++;
          continue;
        }

        // Skip if we've reached the end date
        if (recurring.end_date && isAfter(nextDate, new Date(recurring.end_date))) {
          results.skipped++;
          continue;
        }

        // Get the original journal details
        const { rows: originalJournal } = await sql`
          SELECT * FROM journals WHERE id = ${recurring.journal_id}
        `;

        if (originalJournal.length === 0) {
          throw new Error(`Original journal ${recurring.journal_id} not found`);
        }

        // Get the original journal lines
        const { rows: originalLines } = await sql`
          SELECT * FROM journal_lines WHERE journal_id = ${recurring.journal_id}
        `;

        if (originalLines.length === 0) {
          throw new Error(`No journal lines found for journal ${recurring.journal_id}`);
        }

        // Create a new journal entry
        const nextDateISOString = nextDate.toISOString();
        const { rows: newJournal } = await sql`
          INSERT INTO journals (
            date, 
            memo, 
            source, 
            created_by, 
            created_at, 
            is_posted, 
            is_deleted
          )
          VALUES (
            ${nextDateISOString}, 
            ${originalJournal[0].memo}, 
            ${originalJournal[0].source || null}, 
            ${userId}, 
            CURRENT_TIMESTAMP, 
            FALSE, 
            FALSE
          )
          RETURNING id
        `;

        const newJournalId = newJournal[0].id;

        // Create the journal lines
        for (const line of originalLines) {
          await sql`
            INSERT INTO journal_lines (
              journal_id, 
              account_id, 
              debit, 
              credit, 
              memo
            )
            VALUES (
              ${newJournalId}, 
              ${line.account_id}, 
              ${line.debit}, 
              ${line.credit}, 
              ${line.memo || null}
            )
          `;
        }

        // Update the last_generated date
        await sql`
          UPDATE recurring_journals 
          SET last_generated = ${nextDateISOString}
          WHERE id = ${recurring.id}
        `;

        results.generated++;
        results.details.push(`Generated journal for ${recurring.memo} on ${nextDate.toISOString().split('T')[0]}`);
      } catch (err: any) {
        console.error(`Error generating recurring journal ${recurring.id}:`, err);
        results.errors++;
        results.details.push(`Error for journal ${recurring.id}: ${err.message}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      results
    });
  } catch (err: any) {
    console.error('[journals/recurring/generate] POST error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// Helper function to calculate the next date based on frequency
function calculateNextDate(
  baseDate: Date,
  frequency: string,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null
): Date {
  let nextDate: Date;

  switch (frequency) {
    case 'weekly':
      nextDate = addDays(baseDate, 7);
      // Adjust to the specified day of week if provided
      if (dayOfWeek !== undefined && dayOfWeek !== null) {
        const currentDayOfWeek = nextDate.getDay();
        const daysToAdd = (7 + dayOfWeek - currentDayOfWeek) % 7;
        nextDate = addDays(nextDate, daysToAdd);
      }
      break;

    case 'monthly':
      nextDate = addMonths(baseDate, 1);
      // Adjust to the specified day of month if provided
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        if (dayOfMonth === 31 || dayOfMonth === 0) {
          // Last day of month
          nextDate = lastDayOfMonth(nextDate);
        } else {
          nextDate.setDate(Math.min(dayOfMonth, lastDayOfMonth(nextDate).getDate()));
        }
      }
      break;

    case 'quarterly':
      nextDate = addQuarters(baseDate, 1);
      // Adjust to the specified day of month if provided
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        if (dayOfMonth === 31 || dayOfMonth === 0) {
          // Last day of month
          nextDate = lastDayOfMonth(nextDate);
        } else {
          nextDate.setDate(Math.min(dayOfMonth, lastDayOfMonth(nextDate).getDate()));
        }
      }
      break;

    case 'yearly':
      nextDate = addYears(baseDate, 1);
      // Adjust to the specified day of month if provided
      if (dayOfMonth !== undefined && dayOfMonth !== null) {
        if (dayOfMonth === 31 || dayOfMonth === 0) {
          // Last day of month
          nextDate = lastDayOfMonth(nextDate);
        } else {
          nextDate.setDate(Math.min(dayOfMonth, lastDayOfMonth(nextDate).getDate()));
        }
      }
      break;

    default:
      throw new Error(`Unsupported frequency: ${frequency}`);
  }

  return nextDate;
}

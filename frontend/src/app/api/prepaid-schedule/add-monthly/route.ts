import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getAuth, getFirestore } from '@/lib/firebaseAdmin';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = getAuth();
    let decodedToken: any;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = decodedToken.uid;
    // Determine schedule to process
    const body = await req.json();
    let scheduleToProcess: any;
    let docRef: any;
    if (body.schedule) {
      scheduleToProcess = body.schedule;
    } else if (body.documentId) {
      const db = getFirestore();
      docRef = db.collection('users').doc(userId).collection('documents').doc(body.documentId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      const docData = docSnap.data() as any;
      if (docData.userId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!docData.schedule) {
        return NextResponse.json({ error: 'No schedule found on document' }, { status: 400 });
      }
      scheduleToProcess = docData.schedule;
    } else {
      return NextResponse.json({ error: 'No schedule or documentId provided' }, { status: 400 });
    }

    const systemPrompt = `You are an expert accounting assistant specializing in prepaid expense amortization.
You will receive a JSON array of prepaid expense items.
For each item in the array, calculate and add a property "monthlyBreakdown" that is an array of 12 numbers (January through December) representing the amortization expense for each corresponding month, based on its startDate and endDate.
Preserve the original array length and order; do not remove, merge, or omit any items.
Respond ONLY with the complete updated JSON array and nothing else.`;

    /* ------------------------------------------------------------------
       Call Anthropic and robustly extract the JSON array from the reply
    ------------------------------------------------------------------*/
    const { currentMonth = null, currentYear = null } = body;
    const maxAttempts = 3;
    let updatedSchedule: any = null;
    let lastSanitized = '';

    for (let attempt = 0; attempt < maxAttempts && !updatedSchedule; attempt++) {
      // If this isn't the first attempt, prepend a clarification message
      const userPrompt =
        attempt === 0
          ? JSON.stringify(scheduleToProcess)
          : `Your previous response was not a pure JSON array. Please respond **ONLY** with a JSON array.\n\nHere is the schedule again:\n${JSON.stringify(
              scheduleToProcess,
              null,
              2
            )}`;

      const aiResponse = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      // Extract AI response text
      const rawText = ((aiResponse.content?.[0]) as any)?.text as string || '';
      // Strip markdown fences
      const noFences = rawText.replace(/```json/gi, '').replace(/```/g, '');
      // Remove comments and ellipses
      const sanitized = noFences
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/\.\.\./g, '')
        .trim();
      lastSanitized = sanitized;

      // Try to locate JSON array start
      let jsonArrayStr: string | null = null;
      let startIdx = sanitized.search(/\[\s*\{/);
      if (startIdx === -1) startIdx = sanitized.indexOf('[');
      if (startIdx !== -1) {
        // Bracket matching to find array end
        let depth = 0,
          endIdx = -1;
        for (let i = startIdx; i < sanitized.length; i++) {
          if (sanitized[i] === '[') depth++;
          else if (sanitized[i] === ']') {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
        if (endIdx === -1) endIdx = sanitized.length - 1;
        jsonArrayStr = sanitized.substring(startIdx, endIdx + 1).replace(/,\s*]/g, ']');
      }

      try {
        if (jsonArrayStr) {
          updatedSchedule = JSON.parse(jsonArrayStr);
        } else {
          // Fallback: attempt to parse whole sanitized string
          const parsed = JSON.parse(sanitized);
          if (Array.isArray(parsed)) {
            updatedSchedule = parsed;
          } else if (parsed && Array.isArray(parsed.schedule)) {
            updatedSchedule = parsed.schedule;
          }
        }
      } catch {
        // Ignore JSON parse error; will retry if attempts remain
      }
    }

    if (!updatedSchedule) {
      console.error('[api/prepaid-schedule/add-monthly] Failed to extract JSON array after retries. Last sanitized output:', lastSanitized);
      return NextResponse.json(
        {
          error: 'AI response did not contain a JSON array after multiple attempts.',
          raw: lastSanitized,
        },
        { status: 500 }
      );
    }

    console.log('[api/prepaid-schedule/add-monthly] Parsed updatedSchedule length:', updatedSchedule.length);

    // --- Deterministically compute monthly breakdown to ensure totals align ---
    function monthsBetweenInclusive(start: Date, end: Date) {
      return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    }

    function generateBreakdown(item: any) {
      const start = new Date(item.startDate);
      const end = new Date(item.endDate);
      // Create a copy of all original fields first to preserve custom properties
      const result = { ...item };
      
      if (isNaN(start.valueOf()) || isNaN(end.valueOf()) || start > end) return result;
      const totalMonths = monthsBetweenInclusive(start, end);
      if (totalMonths <= 0) return result;
      const monthlyAmt = Number((item.amountPosted / totalMonths).toFixed(2));
      const breakdown = Array(12).fill(0);
      for (let i = 0; i < totalMonths; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const idx = d.getMonth();
        breakdown[idx] += monthlyAmt;
      }
      // adjust rounding difference to ensure sum equals amountPosted
      const diff = Number((item.amountPosted - breakdown.reduce((s: number, v: number) => s + v, 0)).toFixed(2));
      if (Math.abs(diff) >= 0.01) {
        // add diff to last month of service period
        breakdown[(new Date(end)).getMonth()] += diff;
      }
      // Add monthly calculation fields to the result object
      result.monthlyAmount = monthlyAmt;
      result.monthlyBreakdown = breakdown;
      return result;
    }

    updatedSchedule = updatedSchedule.map(generateBreakdown);

    if (currentMonth !== null && currentYear !== null) {
      // catch-up depreciation when prior months exist
      const cutOff = new Date(currentYear, currentMonth, 1);
      updatedSchedule = updatedSchedule.map((item: any) => {
        // Make a full copy to preserve all custom properties
        const result = { ...item };
        const mb = item.monthlyBreakdown;
        if (!Array.isArray(mb) || mb.length !== 12) return result;
        const start = new Date(item.startDate);
        const monthsDiffTotal = (cutOff.getFullYear() - start.getFullYear()) * 12 + (cutOff.getMonth() - start.getMonth());
        if (monthsDiffTotal <= 0) return result; // no catch-up needed

        // limit to array length
        const monthsDiff = Math.min(monthsDiffTotal, mb.length);
        let catchUp = 0;
        const adjusted = mb.map((val: number, idx: number) => {
          if (idx < monthsDiff) {
            catchUp += val;
            return 0;
          }
          return val;
        });
        const currentIdx = currentMonth;
        if (currentIdx >= 0 && currentIdx < adjusted.length) {
          adjusted[currentIdx] += catchUp;
        }
        result.monthlyBreakdown = adjusted;
        return result;
      });
    }

    // Update Firestore with monthly breakdown if using documentId
    if (docRef) {
      await docRef.update({ schedule: updatedSchedule, status: 'monthlyGenerated' });
    }

    return NextResponse.json({ schedule: updatedSchedule }, { status: 200 });
  } catch (error) {
    console.error('[api/prepaid-schedule/add-monthly] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error augmenting schedule' },
      { status: 500 }
    );
  }
}

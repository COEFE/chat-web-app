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

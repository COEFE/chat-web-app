import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // Assumes ANTHROPIC_API_KEY is in env

export async function POST(req: NextRequest) {
  console.log('[api/prepaid-schedule] Authorization header:', req.headers.get('Authorization'));
  const authHeader = req.headers.get('Authorization');
  console.log('[api/prepaid-schedule] raw authHeader:', authHeader);
  try {
    // Authenticate
    const idToken = authHeader?.split('Bearer ')[1];
    console.log('[api/prepaid-schedule] Extracted idToken:', idToken ? `${idToken.substring(0,8)}...${idToken.slice(-8)}` : idToken);
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized: No token provided' }, { status: 401 });
    }
    console.log('[api/prepaid-schedule] Verifying ID token...');
    const auth = getAuth();
    let decodedToken;
    try {
      decodedToken = await auth.verifyIdToken(idToken);
    } catch (err) {
      console.error('[api/prepaid-schedule] verifyIdToken error:', err);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const userId = decodedToken.uid;

    // Parse body
    const bodyJson = await req.json();
    const { documentId, mapping = {} } = bodyJson;
    if (!documentId) {
      return NextResponse.json({ error: 'No documentId provided' }, { status: 400 });
    }

    // Fetch document metadata from Firestore
    const db = getFirestore();
    // Use the user-specific subcollection path
    const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const docData = docSnap.data();
    if (docData?.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const storagePath = docData.storagePath;

    // Download file from Storage
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const [buffer] = await file.download();

    // Parse workbook
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetStubs: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    /* -----------------------------------------------
       Deterministic extraction of prepaid rows
    -----------------------------------------------*/
    // Dynamic header mapping
    const headerRaw = rows.length ? (rows[0] as any[]).map(h => String(h).trim()) : [];
    const headerNormalized = headerRaw.map(h => h.toLowerCase());
    const baseKeys = ['vendor','posting','invoice','amount','start','end','period'];

    const headerIndices: Record<string, number> = {};
    for (const [key, label] of Object.entries(mapping as Record<string,string>)) {
      headerIndices[key] = headerNormalized.findIndex(h => h === String(label).toLowerCase().trim());
    }

    // Ensure default keys still map even if not explicitly provided
    baseKeys.forEach(def => {
      if (!(def in headerIndices)) {
        const fallbackLabel = def; // use the key itself as fallback label
        headerIndices[def] = headerNormalized.findIndex(h => h === fallbackLabel);
      }
    });

    // Helper getters for main indices
    const vendorIdx = headerIndices.vendor ?? -1;
    const postingIdx = headerIndices.posting ?? -1;
    const invoiceIdx = headerIndices.invoice ?? -1;
    const amountIdx = headerIndices.amount ?? -1;
    const startIdx = headerIndices.start ?? -1;
    const endIdx = headerIndices.end ?? -1;
    const periodIdx = headerIndices.period ?? -1;

    function serialToISO(serial:number){
      const epoch=new Date(Date.UTC(1899,11,30));
      return new Date(epoch.getTime()+serial*86400000).toISOString().split('T')[0];
    }

    // Helper to parse "May 1 - May 31, 2023" style strings
    function parseServicePeriod(str: string): { start: string; end: string } {
      if (typeof str !== 'string' || !str.includes('-')) return { start: '', end: '' };
      try {
        const [rawStart, rawEnd] = str.split(/\s*-\s*/); // split on dash with optional spaces
        if (!rawStart || !rawEnd) return { start: '', end: '' };

        // Extract year (assume it appears in the end part or start part)
        const yearMatch = rawEnd.match(/(\d{4})/);
        const year = yearMatch ? yearMatch[1] : undefined;

        // Normalise helper
        const normalise = (segment: string, fallbackYear?: string) => {
          let cleaned = segment.replace(/,/g, '').trim();
          // Append year if not present but fallbackYear exists
          if (!/\d{4}/.test(cleaned) && fallbackYear) {
            cleaned += ` ${fallbackYear}`;
          }
          const date = new Date(cleaned);
          return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
        };

        const startISO = normalise(rawStart, year);
        const endISO = normalise(rawEnd, year);
        return { start: startISO, end: endISO };
      } catch (err) {
        console.warn('[api/prepaid-schedule] Failed to parse service period string:', str, err);
        return { start: '', end: '' };
      }
    }

    let deterministicSchedule: any[] = [];
    if(vendorIdx!==-1 && postingIdx!==-1 && amountIdx!==-1){
      for(let i=1;i<rows.length;i++){
        const row=rows[i];
        if(!row || !row[vendorIdx]) continue;

        // core fields
        const vendor=row[vendorIdx];
        let posting=row[postingIdx];
        if(typeof posting==='number') posting=serialToISO(posting);
        const amount=Number(row[amountIdx])||0;
        const invoice = invoiceIdx!==-1 ? row[invoiceIdx] : '';
        let sd=startIdx!==-1?row[startIdx]:'';
        let ed=endIdx!==-1?row[endIdx]:'';
        if(typeof sd==='number') sd=serialToISO(sd);
        if(typeof ed==='number') ed=serialToISO(ed);

        // If start/end missing and combined Service Period column exists, parse it
        if((!sd || !ed) && periodIdx!==-1){
          const periodVal=row[periodIdx];
          const {start, end}=parseServicePeriod(typeof periodVal==='number'?String(periodVal):periodVal);
          sd = sd || start;
          ed = ed || end;
        }

        const item: any = { postingDate:String(posting), vendor:String(vendor), invoiceNumber:String(invoice), amountPosted:amount, startDate:String(sd), endDate:String(ed), monthlyAmount:0 };

        // Add any additional mapped columns
        for (const [key, idx] of Object.entries(headerIndices)) {
          if(baseKeys.includes(key)) continue; // already handled
          item[key] = idx !== -1 ? row[idx] : '';
        }

        deterministicSchedule.push(item);
      }
    }

    // --- Format Excel data for AI --- 
    // Similar to logic in /api/chat but simplified for just the first sheet
    let formattedExcelData = `Content of Excel sheet "${sheetName}":\n\n`;
    if (rows.length > 0) {
      // Create a simple text representation (e.g., tab-separated)
      formattedExcelData += rows.map((row: any[]) => 
        row.map(cell => cell === null || cell === undefined ? '' : String(cell)).join('\t')
      ).join('\n');
    } else {
      formattedExcelData += "(Sheet is empty)";
    }
    console.log('[api/prepaid-schedule] Formatted Excel data length:', formattedExcelData.length);

    // --- Define AI Prompt ---
    const extraKeys = Object.keys(mapping as Record<string,string>).filter(k => !baseKeys.includes(k));
    const extraInstr = extraKeys.length
      ? ` In addition, include the field(s) ${extraKeys.join(', ')} exactly as they appear in the source row. Do not rename them or modify their values.`
      : '';

    const systemPrompt = `You are an expert accounting assistant specializing in prepaid expense amortization.` +
      ` Analyze the following transaction data extracted from an Excel file. Identify all potential prepaid expenses.` +
      ` For each prepaid expense return a JSON object with:` +
      ` vendor (string), postingDate (YYYY-MM-DD), invoiceNumber (string or empty), amountPosted (number), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD).` +
      `${extraInstr}` +
      ` Respond ONLY with a JSON array, no markdown.`;

    // --- Call Anthropic API --- 
    console.log('[api/prepaid-schedule] Calling Anthropic API...');
    const aiResponse = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022', // Switched to Claude 3.5 Haiku for extended tokens
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: formattedExcelData,
        },
      ],
    });
    console.log('[api/prepaid-schedule] Anthropic API response received.');
    
    // --- Parse AI Response --- 
    // Log the raw response content for debugging
    if (aiResponse.content && aiResponse.content.length > 0 && aiResponse.content[0].type === 'text') {
      console.log('[api/prepaid-schedule] Raw AI response content:', aiResponse.content[0].text);
    } else {
      console.log('[api/prepaid-schedule] Raw AI response content missing or not text.');
    }

    let schedule: any[] = [];
    try {
      if (aiResponse.content && aiResponse.content.length > 0 && aiResponse.content[0].type === 'text') {
        const rawText = aiResponse.content[0].text.trim();
        const cleanText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        // Find first '[' and match brackets
        const startIdx = cleanText.indexOf('[');
        if (startIdx === -1) {
          throw new Error('AI response did not contain a JSON array.');
        }
        let depth = 0;
        let endIdx = -1;
        for (let i = startIdx; i < cleanText.length; i++) {
          const ch = cleanText[i];
          if (ch === '[') depth++;
          else if (ch === ']') {
            depth--;
            if (depth === 0) { endIdx = i; break; }
          }
        }
        // If no matching ']', assume truncated
        if (endIdx === -1) {
          endIdx = cleanText.length - 1;
          console.warn('[api/prepaid-schedule] JSON array may be truncated; parsing up to available content.');
        }
        let arrayString = cleanText.substring(startIdx, endIdx + 1);
        // Remove trailing commas before closing bracket
        arrayString = arrayString.replace(/,(\s*])/g, '$1');
        try {
          schedule = JSON.parse(arrayString);
          console.log('[api/prepaid-schedule] Successfully parsed AI response JSON.');
        } catch (e) {
          // Fallback: trim last incomplete item
          const lastObjEnd = arrayString.lastIndexOf('}');
          if (lastObjEnd > 0) {
            const trimmedArr = arrayString.substring(0, lastObjEnd + 1) + ']';
            schedule = JSON.parse(trimmedArr);
            console.warn('[api/prepaid-schedule] Parsed partial schedule by trimming incomplete last element.');
          } else {
            console.error('[api/prepaid-schedule] Error parsing schedule JSON:', e);
            throw new Error('AI response JSON was malformed.');
          }
        }
      } else {
        console.error('[api/prepaid-schedule] AI response content missing or invalid:', aiResponse.content);
        throw new Error('AI response content was missing or invalid.');
      }
    } catch (error) {
      // Log the raw text as well if parsing fails
      const rawText = aiResponse.content && aiResponse.content.length > 0 && aiResponse.content[0].type === 'text' 
                      ? aiResponse.content[0].text.trim() 
                      : 'AI response content missing or not text.';
      console.error('[api/prepaid-schedule] Error parsing AI response. Raw text was:', rawText, error);
      return NextResponse.json(
        {
          error: 'Failed to parse AI response',
          details: error instanceof Error ? error.message : 'Unknown parsing error'
        }, { status: 500 });
    }
    
    console.log('[api/prepaid-schedule] AI analysis complete. Schedule generated:', schedule);

    // Persist generated schedule and update status
    await docRef.update({ schedule, status: 'generated' });
    return NextResponse.json({ schedule, documentId }, { status: 200 });
  } catch (error) {
    console.error('[api/prepaid-schedule] Error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

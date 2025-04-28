import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

interface BreakdownItem {
  postingDate: string;
  vendor: string;
  amountPosted: number;
  startDate: string;
  endDate: string;
  monthlyAmount: number;
  monthlyBreakdown: number[];
}

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

    // Parse request body
    const body = await req.json();
    console.log('[api/prepaid-schedule/append] Request body:', body);
    const { documentId, breakdownData } = body;
    console.log('[api/prepaid-schedule/append] documentId=', documentId, 'breakdownData length=', Array.isArray(breakdownData) ? breakdownData.length : 'not array');
    if (!documentId || !Array.isArray(breakdownData)) {
      return NextResponse.json({ error: 'documentId and breakdownData are required' }, { status: 400 });
    }

    // Load existing document
    const db = getFirestore();
    const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const docData = docSnap.data() as any;
    if (docData.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Retrieve existing schedule array; if missing, attempt to reconstruct from the workbook
    let existingSchedule: any[] = Array.isArray(docData.schedule) ? docData.schedule : [];

    // Global container for sheet-derived month headers
    let monthHeadersFromSheet: string[] | null = null;

    // Fetch workbook for header detection and optional schedule reconstruction
    const fileUrl = docData.downloadURL;
    if (fileUrl) {
      try {
        const resp = await fetch(fileUrl);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          const wb = XLSX.read(new Uint8Array(ab), { type: 'array', sheetStubs: true });
          const sheetName = wb.SheetNames[0];
          const ws = wb.Sheets[sheetName];
          const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          if (data.length > 1) {
            // Normalize headers and detect month columns
            const normalize = (s: any) => (typeof s === 'string' ? s.toLowerCase().replace(/[^a-z]/g, '') : '');
            const headerNormalized = data[0].map(normalize);
            const baseMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            const baseMonthsNormalized = baseMonths.map(normalize);
            // Detect month columns by full name or 3-letter abbreviation
            const monthIndices: number[] = [];
            headerNormalized.forEach((h, i) => {
              const fullIdx = baseMonthsNormalized.indexOf(h);
              const abbrIdx = baseMonthsNormalized.findIndex(m => m.startsWith(h));
              if (fullIdx !== -1 || abbrIdx !== -1) monthIndices.push(i);
            });
            console.log('[api/prepaid-schedule/append] Debug monthIndices:', monthIndices);
            if (monthIndices.length === 12) {
              monthHeadersFromSheet = monthIndices.map(i => String(data[0][i]));
              console.log('[api/prepaid-schedule/append] Captured sheet monthHeaders:', monthHeadersFromSheet);
            }
            // Identify other column indices
            const vendorIdx = headerNormalized.findIndex(h => ['vendor','vendorname','payee'].some(p => h.includes(p)));
            const postingIdx = headerNormalized.findIndex(h => ['postingdate','postdate','date'].some(p => h.includes(p)));
            const amountIdx = headerNormalized.findIndex(h => ['originalcost','amountposted','amount','cost'].some(p => h.includes(p)));
            const startIdx = headerNormalized.findIndex(h => ['startdate','begindate','servicebegin','servicestart'].some(p => h.includes(p)));
            const endIdx = headerNormalized.findIndex(h => ['enddate','finishdate','serviceend','servicefinish'].some(p => h.includes(p)));
            // Reconstruct existingSchedule if empty
            if (existingSchedule.length === 0) {
              const bodyRows = data.slice(1).filter(row => row.some(cell => cell !== '') && (vendorIdx === -1 ? true : String(row[vendorIdx]).toLowerCase() !== 'total'));
              existingSchedule = bodyRows.map(row => {
                const monthly = monthIndices.length === 12 ? monthIndices.map(i => Number(row[i]) || 0) : [];
                let postingDate: any = row[postingIdx];
                if (typeof row[postingIdx] === 'number') {
                  const epoch = new Date(Date.UTC(1899,11,30));
                  postingDate = new Date(epoch.getTime() + row[postingIdx] * 86400000).toISOString().split('T')[0];
                }
                const monthlyAmount = monthly.length ? monthly.reduce((s, v) => s + v, 0) / (monthly.filter(v => v !== 0).length || 1) : 0;
                return {
                  vendor: row[vendorIdx] ?? '',
                  postingDate,
                  amountPosted: Number(row[amountIdx]) || 0,
                  startDate: row[startIdx] ?? '',
                  endDate: row[endIdx] ?? '',
                  monthlyAmount,
                  monthlyBreakdown: monthly,
                };
              });
              console.log('[api/prepaid-schedule/append] Parsed', existingSchedule.length, 'rows from workbook');
            }
          }
        } else {
          console.warn('[api/prepaid-schedule/append] Failed to download file for parsing, status', resp.status);
        }
      } catch (parseErr) {
        console.error('[api/prepaid-schedule/append] Error parsing workbook:', parseErr);
      }
    }
    console.log('[api/prepaid-schedule/append] existingSchedule length=', existingSchedule.length);

    // ------------------- AI Inference Section -------------------
    const anthropic = new Anthropic(); // API key via env

    // Determine headers to use: sheet-originated headers first
    let detectedMonthHeaders: string[] = [];

    if (monthHeadersFromSheet && monthHeadersFromSheet.length === 12) {
      detectedMonthHeaders = monthHeadersFromSheet;
    } else if (docData.monthHeaders && Array.isArray(docData.monthHeaders)) {
      detectedMonthHeaders = docData.monthHeaders;
    } else {
      // fallback from fiscalStartMonth
      const buildMonthHeadersLocal = (startIdx:number)=>{
        const base=['January','February','March','April','May','June','July','August','September','October','November','December'];
        return base.slice(startIdx).concat(base.slice(0,startIdx));
      };
      detectedMonthHeaders = buildMonthHeadersLocal(typeof docData.fiscalStartMonth === 'number' ? docData.fiscalStartMonth : 0);
    }
    console.log('[api/prepaid-schedule/append] Using detectedMonthHeaders:', detectedMonthHeaders);

    // Determine Fiscal Start Month Deterministically
    const baseMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let fiscalStartMonth = 0; // Default to January
    if (detectedMonthHeaders.length === 12) {
      const firstMonth = detectedMonthHeaders[0].toLowerCase();
      const idx = baseMonths.findIndex(m => m.toLowerCase() === firstMonth);
      if (idx !== -1) {
        fiscalStartMonth = idx;
      }
    }
    console.log(`[api/prepaid-schedule/append] Determined fiscalStartMonth: ${fiscalStartMonth} (${baseMonths[fiscalStartMonth]})`);

    // Use provided currentMonth/Year from original document
    const providedMonth = typeof docData.currentMonth === 'number' ? docData.currentMonth : 0;
    const providedYear = typeof docData.currentYear === 'number' ? docData.currentYear : new Date().getFullYear();
    console.log(`[api/prepaid-schedule/append] Using provided currentMonth: ${providedMonth}, currentYear: ${providedYear}`);

    // Build prompt
    const systemPrompt = `You are an expert accounting assistant specialising in prepaid expense schedules.
The fiscal year starts in month ${fiscalStartMonth} (${baseMonths[fiscalStartMonth]}). The month headers must remain exactly as provided.
1. Use the provided currentMonth (${providedMonth}) and currentYear (${providedYear}); do NOT infer or modify them.
2. For each transaction in newTransactions: compute its monthlyBreakdown array (length 12). The array indices MUST align exactly with the provided monthHeaders (index 0 = ${detectedMonthHeaders[0]}, index 11 = ${detectedMonthHeaders[11]}). Calculate based on each transaction's startDate, endDate, and amountPosted.
3. Append these processed new transactions to the end of the existingSchedule.
4. Return JSON ONLY with the following exact structure (no additional keys or prose):
{"currentMonth":${providedMonth},"currentYear":${providedYear},"mergedSchedule":[ /* existingSchedule then processed newTransactions */ ]}`;

    const userContentObj = {
      monthHeaders: detectedMonthHeaders,
      existingSchedule,
      newTransactions: breakdownData,
      currentMonth: providedMonth,
      currentYear: providedYear,
    };

    let aiMerged: any = null;
    try {
      const aiResp = await anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          { role: 'user', content: JSON.stringify(userContentObj) }
        ]
      });
      const raw = aiResp.content && aiResp.content.length>0 && aiResp.content[0].type==='text' ? aiResp.content[0].text.trim() : '';
      aiMerged = JSON.parse(raw);
    } catch(err){
      console.error('[api/prepaid-schedule/append] AI merge failed:', err);
    }

    let mergedSchedule: any[];
    let currentMonth = providedMonth;
    let currentYear = providedYear;

    if(aiMerged && Array.isArray(aiMerged.mergedSchedule)){
      mergedSchedule = aiMerged.mergedSchedule;
      currentMonth = aiMerged.currentMonth ?? providedMonth;
      currentYear = aiMerged.currentYear ?? providedYear;
      console.log('[api/prepaid-schedule/append] AI produced merged schedule length', mergedSchedule.length);
    } else {
      // Fallback simple merge
      console.warn('[api/prepaid-schedule/append] Falling back to simple concatenation.');
      mergedSchedule = existingSchedule.concat(breakdownData);
    }

    // We'll create a NEW document rather than modifying the existing one
    // Copy relevant metadata from original doc to preserve folder placement etc.
    const {
      folderId = null,
      name: originalName = 'Prepaid Schedule',
      contentType: _ct, // ignore
    } = docData as any;

    // Prepare new doc name
    const newName = `${originalName} (updated ${new Date().toLocaleDateString()})`;

    // Placeholder for storage info to be filled after upload
    let newStoragePath = '';
    let newDownloadURL = '';

    // Create Firestore doc first (without storagePath) so we have its ID for filename
    const newDocRef = await db.collection('users').doc(userId).collection('documents').add({
      userId,
      name: newName,
      folderId: folderId || null,
      status: 'appended',
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId: documentId,
      schedule: mergedSchedule,
      fiscalStartMonth,
      currentMonth,
      currentYear,
    });
    const newDocId = newDocRef.id;

    /* ---------------------------------------------------------
       Re-generate Excel workbook to reflect updated schedule
    ---------------------------------------------------------*/
    try {
      // Helper to build month header array starting at fiscalStartMonth
      function buildMonthHeaders(startIdx: number) {
        const base = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return base.slice(startIdx).concat(base.slice(0, startIdx));
      }

      const monthHeaders = detectedMonthHeaders && detectedMonthHeaders.length === 12
        ? detectedMonthHeaders
        : buildMonthHeaders(fiscalStartMonth);
      const headersRow = ['Vendor','Posting Date','Original Cost','Start Date','End Date',...monthHeaders,'Remaining Balance','Total'];
      const dataRows = mergedSchedule.map((item: any) => {
        const total = (item.monthlyBreakdown||[]).reduce((s: number,v: number)=>s+v,0);
        const remaining = (item.amountPosted||0) - total;
        return [
          item.vendor,
          item.postingDate,
          item.amountPosted,
          item.startDate,
          item.endDate,
          ...(item.monthlyBreakdown||Array(12).fill(0)),
          remaining,
          total
        ];
      });

      // Calculate totals row
      const totalsMonthly = Array(12).fill(0);
      let totalsOriginalCost = 0;
      let totalsRemaining = 0;
      let totalsTotal = 0;
      mergedSchedule.forEach((item: any) => {
        totalsOriginalCost += item.amountPosted || 0;
        const monthly = (item.monthlyBreakdown || Array(12).fill(0));
        monthly.forEach((v: number, idx: number) => {
          totalsMonthly[idx] += v || 0;
        });
        const totalRow = (item.monthlyBreakdown || []).reduce((s: number,v:number)=>s+v,0);
        const remainingRow = (item.amountPosted || 0) - totalRow;
        totalsRemaining += remainingRow;
        totalsTotal += totalRow;
      });
      const totalsRow = ['TOTAL','','', '', '', ...totalsMonthly, totalsRemaining, totalsTotal];

      const ws = XLSX.utils.aoa_to_sheet([headersRow,...dataRows,totalsRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Schedule');
      const buffer = XLSX.write(wb,{bookType:'xlsx',type:'buffer'});

      // Upload file to Firebase Storage
      const storage = getStorage();
      const bucket = storage.bucket(storage.app.options.storageBucket as string);
      const filename = `prepaid-schedule-${newDocId}-${Date.now()}.xlsx`;
      newStoragePath = `prepaid-schedules/${userId}/${filename}`;
      const fileRef = bucket.file(newStoragePath);
      await fileRef.save(buffer,{metadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
      await fileRef.makePublic();
      newDownloadURL = fileRef.publicUrl();

      // Update document with new file info
      await newDocRef.update({ 
        downloadURL: newDownloadURL, 
        storagePath: newStoragePath, 
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        updatedAt: new Date(), 
        monthHeaders: detectedMonthHeaders, // Save the correct headers used
        fiscalStartMonth, // Save the determined fiscal start
        currentMonth, // Save the inferred current month
        currentYear // Save the inferred current year
      });

      console.log('[api/prepaid-schedule/append] Excel regenerated and uploaded');
    } catch(excelErr) {
      console.error('[api/prepaid-schedule/append] Failed to regenerate Excel:', excelErr);
    }

    console.log('[api/prepaid-schedule/append] Firestore update complete');
    // Verify update
    const afterSnap = await newDocRef.get();
    const afterData = afterSnap.data() as any;
    console.log('[api/prepaid-schedule/append] After update schedule length=', Array.isArray(afterData.schedule) ? afterData.schedule.length : 'no schedule');
    return NextResponse.json({ newDocId, schedule: mergedSchedule }, { status: 200 });
  } catch (err: any) {
    console.error('[api/prepaid-schedule/append] Error:', err);
    return NextResponse.json({ error: err.message || 'Error appending schedule' }, { status: 500 });
  }
}

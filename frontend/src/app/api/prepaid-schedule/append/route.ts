import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin';
import * as XLSX from 'xlsx';

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

    if (existingSchedule.length === 0) {
      try {
        const fileUrl = docData.downloadURL;
        if (fileUrl) {
          console.log('[api/prepaid-schedule/append] Attempting to parse schedule from file', fileUrl);
          const resp = await fetch(fileUrl);
          if (resp.ok) {
            const ab = await resp.arrayBuffer();
            const wb = XLSX.read(new Uint8Array(ab), { type: 'array', sheetStubs: true });
            const sheetName = wb.SheetNames[0];
            const ws = wb.Sheets[sheetName];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (data.length > 1) {
              const normalize = (s: any) => (typeof s === 'string' ? s.toLowerCase().replace(/[^a-z]/g, '') : '');
              const header = data[0].map(normalize);
              const findIdx = (patterns: string[]) => header.findIndex((h: string) => patterns.some(p => h.includes(p)));
              const vendorIdx = findIdx(['vendor','vendorname','payee']);
              const postingIdx = findIdx(['postingdate','postdate','date']);
              const amountIdx = findIdx(['originalcost','amountposted','amount','cost']);
              const startIdx = findIdx(['startdate','begindate','servicebegin','servicestart']);
              const endIdx = findIdx(['enddate','finishdate','serviceend','servicefinish']);
              const monthIdxStart = findIdx(['january','jan']);
              const monthIdxEnd = monthIdxStart !== -1 ? monthIdxStart + 11 : -1;

              const bodyRows = data.slice(1).filter(row => row.some(cell => cell !== '') && (vendorIdx === -1 ? true : String(row[vendorIdx]).toLowerCase() !== 'total'));
              existingSchedule = bodyRows.map(row => {
                const monthly = monthIdxStart !== -1 ? row.slice(monthIdxStart, monthIdxEnd + 1).map((v: any)=>Number(v)||0) : [];

                const postingVal = row[postingIdx];
                let postingDate = postingVal;
                if (typeof postingVal === 'number') {
                  // Convert Excel serial to date string (assuming 1900 date system)
                  const epoch = new Date(Date.UTC(1899,11,30));
                  const date = new Date(epoch.getTime() + postingVal * 86400000);
                  postingDate = date.toISOString().split('T')[0];
                }

                return {
                  vendor: row[vendorIdx] ?? '',
                  postingDate,
                  amountPosted: Number(row[amountIdx]) || 0,
                  startDate: row[startIdx] ?? '',
                  endDate: row[endIdx] ?? '',
                  monthlyAmount: monthly.reduce((s:number,v:number)=>s+v,0)/(monthly.filter((v:number)=>v!==0).length||1),
                  monthlyBreakdown: monthly,
                };
              });
              console.log('[api/prepaid-schedule/append] Parsed', existingSchedule.length, 'rows from workbook');
            }
          } else {
            console.warn('[api/prepaid-schedule/append] Failed to download file for parsing, status', resp.status);
          }
        }
      } catch(parseErr) {
        console.error('[api/prepaid-schedule/append] Error parsing workbook:', parseErr);
      }
    }
    console.log('[api/prepaid-schedule/append] existingSchedule length=', existingSchedule.length);

    // Merge schedules by simple concatenation
    const mergedSchedule = existingSchedule.concat(breakdownData);
    console.log('[api/prepaid-schedule/append] Merged schedule length=', mergedSchedule.length);

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
    });
    const newDocId = newDocRef.id;

    /* ---------------------------------------------------------
       Re-generate Excel workbook to reflect updated schedule
    ---------------------------------------------------------*/
    try {
      const monthHeaders = [
        'January','February','March','April','May','June','July','August','September','October','November','December'
      ];
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
      await newDocRef.update({ downloadURL: newDownloadURL, storagePath: newStoragePath, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', updatedAt: new Date() });

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

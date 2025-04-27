import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const auth = getAuth();
    let decoded: any;
    try { decoded = await auth.verifyIdToken(idToken); } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = decoded.uid;

    // Parse request body
    const { documentId } = await req.json();
    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    // Load existing schedule from document
    const db = getFirestore();
    const docRef = db.collection('users').doc(userId).collection('documents').doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const data = docSnap.data() as any;
    const schedule: any[] = Array.isArray(data.schedule) ? data.schedule : [];

    // Build Excel sheet data
    const monthHeaders = [
      'January','February','March','April','May','June',
      'July','August','September','October','November','December'
    ];
    const headers = ['Vendor','Posting Date','Original Cost','Start Date','End Date',
      ...monthHeaders,'Remaining Balance','Total'];
    const rows = schedule.map(item => {
      const total = (item.monthlyBreakdown||[]).reduce((sum: number, v: number) => sum + v, 0);
      const remaining = (item.amountPosted||0) - total;
      return [
        item.vendor, item.postingDate, item.amountPosted,
        item.startDate, item.endDate,
        ...(item.monthlyBreakdown||[]), remaining, total
      ];
    });

    // Create workbook
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Upload to Firebase Storage
    const storage = getStorage();
    const bucket = storage.bucket(storage.app.options.storageBucket as string);
    const filename = `schedule-${documentId}-${Date.now()}.xlsx`;
    const path = `prepaid-exports/${userId}/${filename}`;
    const file = bucket.file(path);
    await file.save(buffer, { metadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
    await file.makePublic();
    const url = file.publicUrl();

    // Create Firestore doc for exported file
    const newDoc = await db.collection('users').doc(userId).collection('documents').add({
      userId,
      fileName: filename,
      storagePath: path,
      downloadURL: url,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uploadTime: FieldValue.serverTimestamp(),
      status: 'exported',
      folderId: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      parentId: documentId,
    });

    return NextResponse.json({ documentId: newDoc.id }, { status: 200 });
  } catch (err: any) {
    console.error('[api/prepaid-schedule/export] Error:', err);
    return NextResponse.json({ error: err.message||'Error exporting schedule' }, { status: 500 });
  }
}

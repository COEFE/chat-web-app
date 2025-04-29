import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getFirestore, getStorage } from '@/lib/firebaseAdmin';
import * as XLSX from 'xlsx';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') || '';
  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const auth = getAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = decoded.uid;
  const documentId = req.nextUrl.searchParams.get('documentId');
  if (!documentId) return NextResponse.json({ error: 'No documentId provided' }, { status: 400 });

  const db = getFirestore();
  const docSnap = await db.collection('users').doc(userId).collection('documents').doc(documentId).get();
  if (!docSnap.exists) return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  const storagePath = (docSnap.data() as any).storagePath;

  const bucket = getStorage().bucket();
  const [buffer] = await bucket.file(storagePath).download();
  const workbook = XLSX.read(buffer, { type: 'buffer', sheetStubs: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const headers = rows.length ? (rows[0] as any[]).map(h => String(h).trim()) : [];

  return NextResponse.json({ headers }, { status: 200 });
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import XLSX from 'xlsx-js-style';

/*
  POST body: { raw?: string, fileName?: string }
  - If raw provided, treat as CSV plain text.
  - Else expect multipart? For simplicity we match budget flow: client converts to CSV then passes raw.

  Output: { rows: Array<Record<string, any>> } – rows are JS objects with detected column keys.
*/
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const { raw } = await req.json();
  if (!raw) {
    return NextResponse.json({ error: 'raw is required' }, { status: 400 });
  }

  // Detect if raw looks like CSV or maybe TSV
  let rows: Record<string, any>[] = [];
  try {
    // SheetJS can parse CSV string via read()
    const wb = XLSX.read(raw, { type: 'string', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: null, blankrows: false });
  } catch (e) {
    console.error('[gl-transactions/parse] Sheet parse error – treating as custom split', e);
    const lines: string[] = raw.split(/\r?\n/).filter(Boolean);
    const headers: string[] = lines[0].split(',');
    rows = lines.slice(1).map((lineStr: string) => {
      const vals = lineStr.split(',');
      const obj: Record<string, any> = {};
      headers.forEach((h: string, idx: number) => {
        obj[h.trim() || `col${idx}`] = vals[idx];
      });
      return obj;
    });
  }

  // Fallback: if first row has mostly numeric keys, AI infer headers later in ingest.
  return NextResponse.json({ rows });
}

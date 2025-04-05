// frontend/src/app/api/excel-test/route.ts
import { NextRequest, NextResponse } from 'next/server';

console.log("--- MODULE LOAD: /api/excel-test ---");

export async function POST(req: NextRequest) {
  console.log("--- ENTERING POST /api/excel-test ---");
  return NextResponse.json({ success: true, message: "Excel Test API reached!" });
}

export async function GET(req: NextRequest) {
  console.log("--- ENTERING GET /api/excel-test ---");
  return NextResponse.json({ success: true, message: "Excel Test API reached via GET!" });
}

console.log("--- MODULE LOAD CHECKPOINT 1: /api/excel-process/route.ts ---");

import { NextRequest, NextResponse } from 'next/server';
import { processExcelOperation } from '@/lib/excelUtils';
console.log("--- MODULE LOAD CHECKPOINT 2: Imports done ---"); // Log after imports

// The processExcelOperation function has been moved to @/lib/excelUtils


// --- Original POST function (now calls the new function) ---
export async function POST(req: NextRequest): Promise<NextResponse> {
  console.log('--- ENTERING HTTP POST /api/excel-process ---');

  // Authentication should be added back here when Firebase is re-enabled
  // For now, using a dummy user ID. In a real scenario, you'd get this from the token.
  const dummyUserId = "http-test-user";
  console.log("--- Skipping Authentication (Firebase commented out) ---");

  let body;
  try {
    body = await req.json();
    console.log("HTTP Request Body Parsed:", body);
  } catch (error: any) {
    console.error('--- ERROR parsing HTTP request body ---');
    console.error('Error Details:', error);
    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  }

  const { operation, documentId, data } = body;

  // Call the core processing function
  return processExcelOperation(operation, documentId, data, dummyUserId);
}

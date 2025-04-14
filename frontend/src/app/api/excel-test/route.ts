// frontend/src/app/api/excel-test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

console.log("--- MODULE LOAD: /api/excel-test ---");

export async function POST(req: NextRequest) {
  console.log("--- ENTERING POST /api/excel-test ---");
  
  try {
    // Track memory usage
    const memUsageBefore = process.memoryUsage();
    console.log(`[excel-test] Memory usage before operation: ${JSON.stringify({
        rss: `${Math.round(memUsageBefore.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageBefore.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsageBefore.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageBefore.external / 1024 / 1024)}MB`,
    })}`);
    
    // Check if we're running in Vercel
    const isVercel = process.env.VERCEL === '1';
    console.log(`[excel-test] Running in Vercel environment: ${isVercel}`);
    
    // Create a simple Excel workbook
    console.log(`[excel-test] Creating workbook...`);
    const workbook = XLSX.utils.book_new();
    
    // Create sample data
    const data = [
      ["UWorld Receipt"],
      ["Order Number:", "9212477 - Charge"],
      ["Order Date:", "02/15/2025"],
      ["Payment Method:", "Paid by PayPal"],
      ["IP Address:", "67.250.35.232"]
    ];
    
    // Create worksheet from data
    console.log(`[excel-test] Creating worksheet...`);
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    // Write to buffer
    console.log(`[excel-test] Writing to buffer...`);
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer',
      bookType: 'xlsx',
      compression: true
    });
    console.log(`[excel-test] Buffer created, size: ${excelBuffer.length} bytes`);
    
    // Track memory after workbook creation
    const memUsageAfter = process.memoryUsage();
    console.log(`[excel-test] Memory usage after operation: ${JSON.stringify({
        rss: `${Math.round(memUsageAfter.rss / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsageAfter.heapTotal / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsageAfter.heapUsed / 1024 / 1024)}MB`,
        external: `${Math.round(memUsageAfter.external / 1024 / 1024)}MB`,
    })}`);
    
    // Return success with the Excel file as base64
    return NextResponse.json({ 
      success: true, 
      message: "Excel file created successfully", 
      fileSize: excelBuffer.length,
      fileBase64: excelBuffer.toString('base64')
    });
  } catch (error: any) {
    console.error(`[excel-test] Error creating Excel file:`, error);
    console.error(`[excel-test] Full error object:`, JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    return NextResponse.json({ 
      success: false, 
      message: `Error creating Excel file: ${error.message || 'Unknown error'}`,
      error: JSON.stringify(error, Object.getOwnPropertyNames(error))
    }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  console.log("--- ENTERING GET /api/excel-test ---");
  return NextResponse.json({ success: true, message: "Excel Test API reached via GET!" });
}

import { NextResponse } from 'next/server';
import { identifyExpenseAccountWithAI } from '@/lib/excelDataProcessor';

export async function GET() {
  try {
    // Test the AI-powered expense account identification function
    const result = await identifyExpenseAccountWithAI({
      memo: "Office supplies - paper, pens, and printer ink",
      vendorId: 1,
      accountName: "Office Supplies",
      amount: "120.50"
    });

    return NextResponse.json({
      success: true,
      message: "AI function test completed successfully",
      result
    });
  } catch (error) {
    console.error("Error testing AI functions:", error);
    return NextResponse.json({
      success: false,
      message: "Error testing AI functions",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

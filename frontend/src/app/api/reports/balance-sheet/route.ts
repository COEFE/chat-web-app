import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getBalanceSheet } from '@/lib/accounting/reportQueries';

// POST /api/reports/balance-sheet
export async function POST(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get as-of date from request body
    const { asOfDate } = await req.json();
    
    if (!asOfDate) {
      return NextResponse.json({
        error: 'As-of date is required'
      }, { status: 400 });
    }
    
    // Get balance sheet data
    const data = await getBalanceSheet(asOfDate);
    
    // Find totals from the data
    const totalAssets = data.find(row => row.isSubtotal && row.accountType === 'asset')?.balance || 0;
    const totalLiabilities = data.find(row => row.isSubtotal && row.accountType === 'liability')?.balance || 0;
    const totalEquity = data.find(row => row.isSubtotal && row.accountType === 'equity')?.balance || 0;
    const totalLiabilitiesAndEquity = data.find(row => row.isTotal)?.balance || 0;
    
    return NextResponse.json({
      balanceSheet: data,
      totals: {
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        liabilitiesAndEquity: totalLiabilitiesAndEquity,
        difference: Math.abs(totalAssets - totalLiabilitiesAndEquity)
      }
    });
  } catch (err: any) {
    console.error('[reports/balance-sheet] Error:', err);
    return NextResponse.json({
      error: err.message || 'An error occurred while generating the balance sheet'
    }, { status: 500 });
  }
}

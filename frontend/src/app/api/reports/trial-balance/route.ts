import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getTrialBalance } from '@/lib/accounting/reportQueries';

// POST /api/reports/trial-balance
export async function POST(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get date range from request body
    const { startDate, endDate } = await req.json();
    
    if (!startDate || !endDate) {
      return NextResponse.json({
        error: 'Start date and end date are required'
      }, { status: 400 });
    }
    
    // Get trial balance data
    const data = await getTrialBalance(startDate, endDate);
    
    // Calculate totals
    const totalDebits = data.reduce((sum, row) => sum + Number(row.debitBalance), 0);
    const totalCredits = data.reduce((sum, row) => sum + Number(row.creditBalance), 0);
    
    return NextResponse.json({
      trialBalance: data,
      totals: {
        debits: totalDebits,
        credits: totalCredits,
        difference: Math.abs(totalDebits - totalCredits)
      }
    });
  } catch (err: any) {
    console.error('[reports/trial-balance] Error:', err);
    return NextResponse.json({
      error: err.message || 'An error occurred while generating the trial balance'
    }, { status: 500 });
  }
}

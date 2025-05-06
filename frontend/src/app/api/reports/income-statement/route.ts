import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getIncomeStatement } from '@/lib/accounting/reportQueries';

// POST /api/reports/income-statement
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
    
    // Get income statement data
    const data = await getIncomeStatement(startDate, endDate);
    
    // Find revenue, expense and net income totals from the data
    const totalRevenue = data.find(row => row.isSubtotal && row.accountType === 'revenue')?.balance || 0;
    const totalExpenses = data.find(row => row.isSubtotal && row.accountType === 'expense')?.balance || 0;
    const netIncome = data.find(row => row.isTotal)?.balance || 0;
    
    return NextResponse.json({
      incomeStatement: data,
      totals: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome: netIncome
      }
    });
  } catch (err: any) {
    console.error('[reports/income-statement] Error:', err);
    return NextResponse.json({
      error: err.message || 'An error occurred while generating the income statement'
    }, { status: 500 });
  }
}

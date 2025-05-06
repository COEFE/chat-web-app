import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { getDashboardData } from '@/lib/accounting/dashboardQueries';

export async function GET(request: NextRequest) {
  // Authenticate request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    // Get dashboard data
    const dashboardData = await getDashboardData();

    return NextResponse.json({
      dashboard: dashboardData
    });
  } catch (error: any) {
    console.error('Error generating dashboard:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate dashboard data' },
      { status: 500 }
    );
  }
}

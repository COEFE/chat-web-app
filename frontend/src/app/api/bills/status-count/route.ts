import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// GET /api/bills/status-count
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;
  
  try {
    // Query the database to get counts of bills by status
    const result = await sql`
      SELECT status, COUNT(*) as count
      FROM bills
      WHERE is_deleted IS NOT TRUE
      GROUP BY status
      ORDER BY count DESC
    `;
    
    // Format the results
    const statusCounts = result.rows.reduce((acc, row) => {
      acc[row.status] = parseInt(row.count);
      return acc;
    }, {} as Record<string, number>);
    
    return NextResponse.json({ success: true, statusCounts });
  } catch (error) {
    console.error('[Bills Status API] Error getting bill status counts:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to retrieve bill status counts' 
      }, 
      { status: 500 }
    );
  }
}
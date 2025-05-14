import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

/**
 * GET /api/bills/[id]/refunds - Get refunds for a specific bill
 */
export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const { params } = context;
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    const billId = parseInt(params.id);
    
    if (isNaN(billId)) {
      return NextResponse.json(
        { error: 'Invalid bill ID' },
        { status: 400 }
      );
    }
    
    // Check if the bill exists and belongs to the user
    const billCheck = await sql`
      SELECT id FROM bills 
      WHERE id = ${billId} AND user_id = ${userId}
    `;
    
    if (billCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Bill not found or you do not have permission to access it' },
        { status: 404 }
      );
    }
    
    // Get refunds with account information
    const result = await sql`
      SELECT r.*, a.name as account_name
      FROM bill_refunds r
      LEFT JOIN accounts a ON r.refund_account_id = a.id
      WHERE r.bill_id = ${billId} AND r.user_id = ${userId}
      ORDER BY r.refund_date DESC
    `;
    
    return NextResponse.json({
      refunds: result.rows
    });
  } catch (err: any) {
    console.error('[bills/[id]/refunds] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to get bill refunds' },
      { status: 500 }
    );
  }
}

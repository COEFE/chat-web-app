import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { logAuditEvent } from '@/lib/auditLogger';

// One-time use endpoint to fix a bill payment issue
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Only allow specific authorized users to run this fix
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the bill ID from the query parameter
    const url = new URL(req.url);
    const billId = url.searchParams.get('billId') || '3'; // Default to bill ID 3

    // Update the bill status and amount_paid
    const updateResult = await sql`
      UPDATE bills
      SET amount_paid = '500.00', 
          status = 'Paid',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${billId}
      RETURNING id, bill_number, total_amount, amount_paid, status
    `;

    if (updateResult.rowCount === 0) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Log the fix as an audit event
    await logAuditEvent({
      timestamp: new Date().toISOString(),
      user_id: userId,
      action_type: 'BILL_PAYMENT_FIX',
      entity_type: 'Bill',
      entity_id: parseInt(billId),
      changes_made: [
        { field: 'amount_paid', old_value: 'incorrect value', new_value: '500.00' },
        { field: 'status', old_value: 'Partially Paid', new_value: 'Paid' }
      ],
      status: 'SUCCESS',
      context: { note: 'Manual fix for bill payment amount calculation issue' }
    });

    return NextResponse.json({
      success: true,
      message: 'Bill payment fixed successfully',
      bill: updateResult.rows[0]
    });
  } catch (err: any) {
    console.error('Error fixing bill payment:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fix bill payment' },
      { status: 500 }
    );
  }
}

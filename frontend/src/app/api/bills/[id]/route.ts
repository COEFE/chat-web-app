import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import {
  getBill,
  updateBill,
  deleteBill,
} from '@/lib/accounting/billQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// GET /api/bills/[id] - fetch a specific bill
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const includeLines = url.searchParams.get('includeLines') !== 'false';
    const includePayments = url.searchParams.get('includePayments') !== 'false';

    const bill = await getBill(id, includeLines, includePayments);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    return NextResponse.json(bill);
  } catch (err: any) {
    console.error(`[bills/${id}] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

// PUT /api/bills/[id] - update a specific bill
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body || !body.bill) {
      return NextResponse.json({ error: 'Bill data is required' }, { status: 400 });
    }

    // Get the existing bill first
    const existingBill = await getBill(id);
    if (!existingBill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Don't allow updates if bill has payments and we're trying to change certain fields
    if ((existingBill.amount_paid || 0) > 0) {
      const { bill } = body;
      if (
        (bill.vendor_id && bill.vendor_id !== existingBill.vendor_id) ||
        (bill.total_amount && bill.total_amount !== existingBill.total_amount) ||
        (bill.ap_account_id && bill.ap_account_id !== existingBill.ap_account_id)
      ) {
        return NextResponse.json(
          { error: 'Cannot modify vendor, total amount, or AP account for a bill that has payments' },
          { status: 400 }
        );
      }
    }

    const { bill, lines } = body;

    // If updating total_amount, make sure it's not less than amount already paid
    if (bill.total_amount && (existingBill.amount_paid || 0) > bill.total_amount) {
      return NextResponse.json(
        { error: `Cannot set total amount less than amount already paid (${existingBill.amount_paid})` },
        { status: 400 }
      );
    }

    // Update the bill
    const updatedBill = await updateBill(
      id,
      {
        ...bill,
        // Fields that should never be updated via API
        amount_paid: undefined, // Never update amount_paid directly, only via payments
        is_deleted: undefined, // Never update is_deleted directly, use DELETE endpoint
        deleted_at: undefined, // Never update deleted_at directly, use DELETE endpoint
      },
      lines
    );

    // Audit Log for Bill Update
    if (userId && updatedBill) {
      const changes: { field: string; old_value: any; new_value: any }[] = [];
      const fieldsToCompare: (keyof typeof existingBill)[] = [
        'vendor_id', 'bill_number', 'bill_date', 'due_date', 
        'total_amount', 'status', 'terms', 'memo', 'ap_account_id'
      ];

      for (const field of fieldsToCompare) {
        if (existingBill[field] !== updatedBill[field] && 
            typeof updatedBill[field] !== 'undefined') { // only log if value actually changed and new value is defined
          changes.push({
            field: String(field),
            old_value: existingBill[field],
            new_value: updatedBill[field],
          });
        }
      }
      // Note: Line item changes are handled within updateBill and could be logged there
      // or as separate LINE_ITEM_UPDATED events if needed.
      // For this BILL_UPDATED event, we focus on direct bill properties.

      if (changes.length > 0 || (lines && lines.length > 0)) { // Log if direct fields changed or if lines were part of the update payload
        const auditEntry: AuditLogData = {
          timestamp: new Date().toISOString(),
          user_id: userId,
          action_type: 'BILL_UPDATED',
          entity_type: 'Bill',
          entity_id: id,
          changes_made: changes.length > 0 ? changes : null, // Only include changes if there are any
          status: 'SUCCESS',
          context: (lines && lines.length > 0) ? { line_items_provided_in_update: true, line_items_count: lines.length } : null,
        };
        try {
          logAuditEvent(auditEntry);
        } catch (auditError) {
          console.error(`Audit Log Error (BILL_UPDATED, ID: ${id}):`, auditError);
        }
      }
    }

    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    console.error(`[bills/${id}] PUT error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to update bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/bills/[id] - soft delete a bill
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    // Get the bill to check if it has payments
    const bill = await getBill(id, false, true);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Don't allow deletion if bill has payments
    if ((bill.amount_paid || 0) > 0) {
      return NextResponse.json({ error: 'Cannot delete a bill that has payments' }, { status: 400 });
    }

    // Delete the bill (soft delete)
    await deleteBill(id);

    // Audit Log for Bill Deletion
    if (userId) {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_DELETED',
        entity_type: 'Bill',
        entity_id: id,
        changes_made: [
            { field: 'is_deleted', old_value: bill?.is_deleted ?? false, new_value: true }, // Assuming bill.is_deleted reflects state before deleteBill call
            { field: 'status', old_value: bill?.status, new_value: 'Deleted' } // Conceptual change
        ],
        status: 'SUCCESS',
        context: { original_status: bill?.status }, // Log original status from bill object fetched before deletion
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error(`Audit Log Error (BILL_DELETED, ID: ${id}):`, auditError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[bills/${id}] DELETE error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete bill' },
      { status: 500 }
    );
  }
}

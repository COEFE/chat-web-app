import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { 
  getBills, 
  getBill, 
  createBill, 
  getBillStatuses,
  Bill,
  BillLine
} from '@/lib/accounting/billQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// GET /api/bills - fetch bills with optional filtering
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const vendorId = url.searchParams.get('vendorId') ? parseInt(url.searchParams.get('vendorId') as string, 10) : undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const includeDeletedParam = url.searchParams.get('includeDeleted');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    // Special parameter to get bill statuses
    if (url.searchParams.get('statuses') === 'true') {
      const statuses = await getBillStatuses();
      return NextResponse.json(statuses);
    }
    
    // Special parameter to get a specific bill
    const billId = url.searchParams.get('id');
    if (billId) {
      const includeLines = url.searchParams.get('includeLines') !== 'false';
      const includePayments = url.searchParams.get('includePayments') !== 'false';
      
      const bill = await getBill(
        parseInt(billId, 10),
        includeLines,
        includePayments
      );
      
      if (!bill) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
      }
      
      return NextResponse.json(bill);
    }
    
    // Handle includeDeleted parameter
    const includeDeleted = includeDeletedParam === 'true';
    
    // Get bills with pagination and filters
    const { bills, total } = await getBills(
      page,
      limit,
      vendorId,
      startDate,
      endDate,
      status,
      includeDeleted
    );
    
    return NextResponse.json({
      bills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[bills] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// POST /api/bills - create a new bill
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.bill) {
      return NextResponse.json({ 
        error: 'Bill data is required' 
      }, { status: 400 });
    }
    
    const { bill, lines } = body;
    
    if (!bill.vendor_id) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });
    }
    
    if (!bill.bill_date) {
      return NextResponse.json({ error: 'Bill date is required' }, { status: 400 });
    }
    
    if (!bill.due_date) {
      return NextResponse.json({ error: 'Due date is required' }, { status: 400 });
    }
    
    if (!bill.ap_account_id) {
      return NextResponse.json({ error: 'AP account ID is required' }, { status: 400 });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one bill line is required' }, { status: 400 });
    }
    
    // Calculate total amount if not provided
    if (!bill.total_amount) {
      bill.total_amount = lines.reduce((total, line) => total + (line.amount || 0), 0);
    }
    
    // Validate line items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line.expense_account_id) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Expense account ID is required` 
        }, { status: 400 });
      }
      
      if (!line.quantity || line.quantity <= 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Quantity must be greater than 0` 
        }, { status: 400 });
      }
      
      if (!line.unit_price || line.unit_price < 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Unit price must be non-negative` 
        }, { status: 400 });
      }
      
      if (!line.amount || line.amount < 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Amount must be non-negative` 
        }, { status: 400 });
      }
      
      // Validate that amount = quantity * unit_price (with small rounding tolerance)
      const calculatedAmount = line.quantity * line.unit_price;
      if (Math.abs(calculatedAmount - line.amount) > 0.01) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Amount (${line.amount}) does not match quantity (${line.quantity}) * unit_price (${line.unit_price}) = ${calculatedAmount}` 
        }, { status: 400 });
      }
    }
    
    // Set default status if not specified
    if (!bill.status) {
      bill.status = 'Draft';
    }
    
    const billData: Bill = {
      vendor_id: bill.vendor_id,
      bill_number: bill.bill_number,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      total_amount: bill.total_amount,
      amount_paid: bill.amount_paid || 0,
      status: bill.status,
      terms: bill.terms,
      memo: bill.memo,
      ap_account_id: bill.ap_account_id
    };
    
    const lineItems: BillLine[] = lines.map(line => ({
      expense_account_id: line.expense_account_id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      amount: line.amount
    }));
    
    const newBill = await createBill(billData, lineItems);

    // Audit Log for Bill Creation
    if (userId && newBill && typeof newBill.id !== 'undefined') {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        // user_name: // Optional: consider fetching user details if needed for logs
        action_type: 'BILL_CREATED',
        entity_type: 'Bill',
        entity_id: newBill.id,
        changes_made: [
          { field: 'vendor_id', old_value: null, new_value: newBill.vendor_id },
          { field: 'bill_number', old_value: null, new_value: newBill.bill_number },
          { field: 'bill_date', old_value: null, new_value: newBill.bill_date },
          { field: 'due_date', old_value: null, new_value: newBill.due_date },
          { field: 'total_amount', old_value: null, new_value: newBill.total_amount },
          { field: 'status', old_value: null, new_value: newBill.status },
          { field: 'ap_account_id', old_value: null, new_value: newBill.ap_account_id },
        ].filter(change => typeof change.new_value !== 'undefined'), // Ensure only defined values are logged
        status: 'SUCCESS',
        // context: { // Optional: for additional details if required
        //   lineItemsCount: lineItems.length,
        //   memo: newBill.memo
        // }
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (BILL_CREATED):", auditError);
        // Non-critical error: a failure to log should not break the main operation.
      }
    }
    
    return NextResponse.json({
      success: true,
      bill: newBill
    }, { status: 201 });
  } catch (err: any) {
    console.error('[bills] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create bill' },
      { status: 500 }
    );
  }
}

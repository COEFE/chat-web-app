import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { 
  createBillPayment,
  deleteBillPayment,
  getBill,
  BillPayment
} from '@/lib/accounting/billQueries';
import { createJournal, Journal, JournalLine } from '@/lib/accounting/journalQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// POST /api/bill-payments - create a new bill payment
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    
    // Handle both formats: { payment: {...} } or direct payment object
    let payment;
    if (body.payment) {
      payment = body.payment;
    } else if (body.bill_id) {
      // If the body itself has bill_id, treat it as the payment object
      payment = body;
    } else {
      return NextResponse.json({ 
        error: 'Payment data is required' 
      }, { status: 400 });
    }
    
    if (!payment.bill_id) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }
    
    if (!payment.payment_date) {
      return NextResponse.json({ error: 'Payment date is required' }, { status: 400 });
    }
    
    if (!payment.amount_paid || payment.amount_paid <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than 0' }, { status: 400 });
    }
    
    if (!payment.payment_account_id) {
      return NextResponse.json({ error: 'Payment account ID is required' }, { status: 400 });
    }
    
    // Check if bill exists and belongs to the current user
    const billId = typeof payment.bill_id === 'number' ? payment.bill_id : parseInt(payment.bill_id.toString());
    const bill = await getBill(billId, true, true, userId); // Pass correct parameters: id, includeLines, includePayments, userId
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found or you do not have permission to access it' }, { status: 404 });
    }
    
    // Check if bill is already fully paid
    if ((bill.amount_paid || 0) >= (bill.total_amount || 0)) {
      return NextResponse.json({ error: 'Bill is already fully paid' }, { status: 400 });
    }
    
    // Check if payment amount exceeds remaining amount
    const remainingAmount = (bill.total_amount || 0) - (bill.amount_paid || 0);
    if (payment.amount_paid > remainingAmount) {
      return NextResponse.json({ 
        error: `Payment amount ${payment.amount_paid} exceeds remaining bill amount ${remainingAmount}` 
      }, { status: 400 });
    }
    
    // Ensure payment amount is a valid number
    let amountPaidNum: number;
    try {
      // Handle both string and number inputs
      amountPaidNum = typeof payment.amount_paid === 'number' ? 
        payment.amount_paid : 
        parseFloat(payment.amount_paid);
      
      // Validate the number
      if (isNaN(amountPaidNum) || amountPaidNum <= 0) {
        return NextResponse.json({ error: 'Payment amount must be a valid positive number' }, { status: 400 });
      }
      
      // Round to 2 decimal places to avoid floating point issues
      amountPaidNum = Math.round(amountPaidNum * 100) / 100;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid payment amount format' }, { status: 400 });
    }

    // Journal entry description
    // Handle vendor_name which might come from the payment object or need to be fetched
    const vendorName = payment.vendor_name || (bill as any).vendor_name || 'vendor';
    const journalMemo = `Payment for Bill ${bill.bill_number || bill.id} to ${vendorName}`;
    const debitDescription = `Payment to ${vendorName} for bill #${bill.bill_number || bill.id}`;
    const creditDescription = payment.reference_number ? 
      `Ref: ${payment.reference_number}` : 
      `Payment for Bill ${bill.bill_number || bill.id}`;

    // Create journal entry via GL agent instead of directly
    // This routes the GL posting for paid invoices to the GL agent as requested
    let journalId: number;
    try {
      console.log(`[Bill Payments] Creating journal entry via GL agent for bill ${billId} with amount ${amountPaidNum}...`);
      
      // Route the journal creation to the GL agent via the API
      const host = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const baseUrl = host.startsWith('http') ? host : `${protocol}://${host}`;
      
      // Prepare the journal entry data in AI format expected by GL agent
      // Use proper typing for the journal entry lines
      type JournalEntryLine = {
        account_code_or_name?: string;
        account_id?: number;
        description: string;
        debit: number;
        credit: number;
        vendor?: string;
      };

      const journalEntry = {
        memo: journalMemo,
        transaction_date: payment.payment_date,
        journal_type: 'BP', // BP = Bill Payment
        reference_number: payment.reference_number || `AUTO-PAY-${billId}-${Date.now()}`,
        lines: [
          {
            // For GL agent, we need to fetch the account code/name
            account_id: bill.ap_account_id,
            description: debitDescription,
            debit: amountPaidNum,
            credit: 0,
            vendor: vendorName
          } as JournalEntryLine,
          {
            // For GL agent, we need to fetch the account code/name
            account_id: payment.payment_account_id,
            description: creditDescription,
            debit: 0,
            credit: amountPaidNum
          } as JournalEntryLine
        ]
      };
      
      // We need to fetch account codes/names for the GL agent
      const accountsQuery = `
        SELECT id, name, code 
        FROM accounts 
        WHERE id IN ($1, $2) AND user_id = $3
      `;
      
      const accountsResult = await sql.query(accountsQuery, [bill.ap_account_id, payment.payment_account_id, userId]);
      
      if (accountsResult.rows.length !== 2) {
        throw new Error('Failed to find required accounts for journal entry');
      }
      
      // Find the AP and payment accounts
      const apAccount = accountsResult.rows.find(a => a.id === bill.ap_account_id);
      const paymentAccount = accountsResult.rows.find(a => a.id === payment.payment_account_id);
      
      if (!apAccount || !paymentAccount) {
        throw new Error('Missing required account information for journal entry');
      }
      
      // Update the journal entry with account codes/names
      journalEntry.lines[0].account_code_or_name = apAccount.code || apAccount.name;
      delete journalEntry.lines[0].account_id;
      
      journalEntry.lines[1].account_code_or_name = paymentAccount.code || paymentAccount.name;
      delete journalEntry.lines[1].account_id;
      
      // Call the GL agent journal API
      const response = await fetch(`${baseUrl}/api/gl-agent/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userId}`
        },
        body: JSON.stringify({
          journalEntry,
          userId,
          originator: 'AP_BILL_PAYMENT'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Bill Payments] Error from GL agent when creating journal: ${response.status} - ${errorText}`);
        throw new Error(`Failed to create journal entry through GL agent: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Unknown error from GL agent');
      }
      
      journalId = result.journalId;
      console.log(`[Bill Payments] Successfully created journal entry ${journalId} via GL agent for bill ${billId}`);
    } catch (err) {
      console.error('Error creating journal with direct SQL:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({
        error: `Failed to create journal entry: ${errorMessage}`
      }, { status: 500 });
    }
    
    // Now create the bill payment with the journal ID
    const paymentData: BillPayment = {
      bill_id: payment.bill_id,
      payment_date: payment.payment_date,
      amount_paid: payment.amount_paid,
      payment_account_id: payment.payment_account_id,
      payment_method: payment.payment_method,
      reference_number: payment.reference_number,
      journal_id: journalId // Link to the created journal entry
    };
    
    // Create the bill payment - make sure to pass the userId for proper data isolation
    const newPayment = await createBillPayment(paymentData, userId);

    // Audit Log for Bill Payment Creation
    if (userId && newPayment && typeof newPayment.id !== 'undefined') {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_PAYMENT_CREATED',
        entity_type: 'BillPayment',
        entity_id: newPayment.id,
        changes_made: [
          { field: 'bill_id', old_value: null, new_value: newPayment.bill_id },
          { field: 'payment_date', old_value: null, new_value: newPayment.payment_date },
          { field: 'amount_paid', old_value: null, new_value: newPayment.amount_paid },
          { field: 'payment_account_id', old_value: null, new_value: newPayment.payment_account_id },
          { field: 'journal_id', old_value: null, new_value: newPayment.journal_id },
        ],
        status: 'SUCCESS',
        context: { 
          related_bill_id: bill.id, // From the bill object fetched earlier
          related_bill_number: bill.bill_number 
        }
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (BILL_PAYMENT_CREATED):", auditError);
      }
    }
    
    return NextResponse.json({
      success: true,
      payment: newPayment,
      journal_id: journalId
    }, { status: 201 });
  } catch (err: any) {
    console.error('[bill-payments] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create payment' },
      { status: 500 }
    );
  }
}

// DELETE /api/bill-payments?id=X - delete a bill payment
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get payment ID from query parameter
    const url = new URL(req.url);
    const paymentId = url.searchParams.get('id');
    
    if (!paymentId) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }
    
    const id = parseInt(paymentId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid payment ID' }, { status: 400 });
    }
    
    // TODO: Consider fetching the bill payment details here before deletion
    // to provide more context in the audit log (e.g., amount, bill_id).
    // For now, we proceed without it if getBillPayment(id) is not readily available.

    const result = await deleteBillPayment(id);
    if (!result) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    // Audit Log for Bill Payment Deletion
    if (userId) {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_PAYMENT_DELETED',
        entity_type: 'BillPayment',
        entity_id: id,
        // changes_made: null, // Or log what was known, e.g., just the ID
        status: 'SUCCESS',
        context: { note: 'Bill payment record deleted. Associated journal entry may need manual review/reversal if not handled by deleteBillPayment.' }
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error(`Audit Log Error (BILL_PAYMENT_DELETED, ID: ${id}):`, auditError);
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Payment deleted successfully'
    });
  } catch (err: any) {
    console.error('[bill-payments] DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete payment' },
      { status: 500 }
    );
  }
}

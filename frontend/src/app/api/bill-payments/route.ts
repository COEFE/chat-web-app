import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { 
  createBillPayment,
  deleteBillPayment,
  getBill,
  BillPayment,
  Bill
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
    
    // For internal API calls, we skip the user ID check since it's a system operation
    // This allows the update-status API to create payments for any bill
    const isInternalApiCall = userId === 'internal-api';
    console.log(`[Bill Payments] Processing request for bill ${billId}, isInternalApiCall: ${isInternalApiCall}`);
    
    // Skip user ID check for internal API calls
    const bill = await getBill(billId, true, true, isInternalApiCall ? undefined : userId);
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

    // Extract the user_id from the bill object (it's added by the getBill function)
    const billUserId = (bill as any).user_id || userId;
    
    // We need to fetch account codes/names for the GL agent
    // First try to get the accounts with the bill's user ID
    const accountsQuery = `
      SELECT id, name, code 
      FROM accounts 
      WHERE id IN ($1, $2) AND user_id = $3
    `;
    
    let accounts;
    try {
      const accountsResult = await sql.query(accountsQuery, [bill.ap_account_id, payment.payment_account_id, billUserId]);
      
      if (accountsResult.rows.length !== 2) {
        // If we couldn't find both accounts, try without the user_id filter as a fallback
        console.log(`[Bill Payments] Could not find both accounts with user ID ${billUserId}, trying without user filter`);
        const fallbackQuery = `
          SELECT id, name, code 
          FROM accounts 
          WHERE id IN ($1, $2)
        `;
        
        const fallbackResult = await sql.query(fallbackQuery, [bill.ap_account_id, payment.payment_account_id]);
        
        if (fallbackResult.rows.length !== 2) {
          throw new Error('Failed to find required accounts for journal entry');
        }
        
        console.log(`[Bill Payments] Found accounts using fallback query without user filter`);
        accounts = fallbackResult.rows;
      } else {
        accounts = accountsResult.rows;
      }
    } catch (error) {
      console.error('[Bill Payments] Error fetching accounts:', error);
      throw new Error('Failed to find required accounts for journal entry');
    }
    
    // Find the AP and payment accounts
    const apAccount = accounts.find((a: any) => a.id === bill.ap_account_id);
    const paymentAccount = accounts.find((a: any) => a.id === payment.payment_account_id);
    
    if (!apAccount || !paymentAccount) {
      throw new Error('Missing required account information for journal entry');
    }
    
    // Create journal entry via GL agent
    let journalId: number | undefined;
    
    try {
      // Get vendor name from payment data or bill object
      const vendorName = payment.vendor_name || (bill as any).vendor_name || 'Unknown Vendor';
      
      // Prepare journal entry data
      const journalEntry = {
        memo: `Payment for Bill ${bill.bill_number} to ${vendorName}`,
        transaction_date: payment.payment_date,
        journal_type: 'BP', // Bill Payment
        reference_number: payment.reference_number || `AUTO-PAY-${Date.now()}`,
        lines: [
          // Credit the payment account (cash/bank)
          {
            account_code_or_name: paymentAccount.code || paymentAccount.name,
            description: `Payment for bill ${bill.bill_number}`,
            credit: payment.amount_paid,
            debit: 0
          },
          // Debit the AP account
          {
            account_code_or_name: apAccount.code || apAccount.name,
            description: `Payment for bill ${bill.bill_number} to ${vendorName}`,
            debit: payment.amount_paid,
            credit: 0
          }
        ]
      };
      
      // Determine the base URL for the GL agent API call
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      console.log(`[Bill Payments] Base URL for GL agent: ${baseUrl}`);
      
      // Call the GL agent API to create the journal entry
      const glAgentUrl = `${baseUrl}/api/gl_agent/journal`;
      console.log(`[Bill Payments] Calling GL agent journal API at ${glAgentUrl}`);
      
      // For bill payments, we need to use the bill's user ID, not the internal-api user ID
      // This ensures proper data isolation and ownership
      const effectiveUserId = billUserId !== 'internal-api' ? billUserId : (bill as any).user_id || 'system-bill-payment';
      console.log(`[Bill Payments] Using userId for journal creation: ${effectiveUserId}`);
      
      // Get the authorization token from the request or use a default for internal API calls
      const authHeader = req.headers.get('Authorization') || '';
      const token = authHeader.replace('Bearer ', '') || 'internal-api-call';
      
      // Log the full journal entry for debugging
      console.log('[Bill Payments] Journal entry data:', {
        memo: journalEntry.memo,
        date: journalEntry.transaction_date,
        type: journalEntry.journal_type,
        reference: journalEntry.reference_number,
        lineCount: journalEntry.lines.length,
        lines: journalEntry.lines.map(l => ({
          account: l.account_code_or_name,
          debit: l.debit,
          credit: l.credit
        }))
      });
      
      const response = await fetch(glAgentUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          journalEntry,
          userId: effectiveUserId, // Use the bill's user ID instead of internal-api
          originator: 'AP_BILL_PAYMENT'
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Bill Payments] Error from GL agent when creating journal: ${response.status} - ${errorText}`);
        throw new Error(`Failed to create journal entry through GL agent: ${errorText}`);
      }
      
      const result = await response.json();
      
      if (!result || !result.success) {
        throw new Error(result?.message || 'Unknown error from GL agent');
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
      reference_number: payment.reference_number || undefined, // Convert null to undefined if needed
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
        entity_id: String(newPayment.id),
        changes_made: [
          { field: 'bill_id', old_value: null, new_value: String(newPayment.bill_id) },
          { field: 'payment_date', old_value: null, new_value: newPayment.payment_date },
          { field: 'amount_paid', old_value: null, new_value: String(newPayment.amount_paid) },
          { field: 'payment_account_id', old_value: null, new_value: String(newPayment.payment_account_id) },
          { field: 'journal_id', old_value: null, new_value: newPayment.journal_id ? String(newPayment.journal_id) : null },
        ],
        status: 'SUCCESS',
        context: { 
          related_bill_id: String(bill.id), 
          related_bill_number: bill.bill_number 
        }
      };
      
      try {
        await logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (BILL_PAYMENT_CREATED):", auditError);
      }
    }
    
    return NextResponse.json({
      success: true,
      payment: newPayment,
      journal_id: journalId,
      message: 'Payment created successfully'
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
    // Get payment ID from query params
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'Payment ID is required' }, { status: 400 });
    }
    
    const paymentId = parseInt(id);
    if (isNaN(paymentId)) {
      return NextResponse.json({ error: 'Invalid payment ID format' }, { status: 400 });
    }
    
    // Delete the payment
    const success = await deleteBillPayment(paymentId);
    
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 });
    }
    
    // Audit Log for Bill Payment Deletion
    if (userId) {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_PAYMENT_DELETED',
        entity_type: 'BillPayment',
        entity_id: String(paymentId),
        changes_made: [],
        status: 'SUCCESS',
        context: { payment_id: String(paymentId) }
      };
      
      try {
        await logAuditEvent(auditEntry);
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

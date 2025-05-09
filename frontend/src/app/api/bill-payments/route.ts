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
    
    // Validate required fields
    if (!body.payment) {
      return NextResponse.json({ 
        error: 'Payment data is required' 
      }, { status: 400 });
    }
    
    const { payment } = body;
    
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
    
    // Check if bill exists
    const bill = await getBill(payment.bill_id);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
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
    const journalMemo = `Payment for Bill ${bill.bill_number || bill.id}`;
    const debitDescription = `Payment to vendor for bill #${bill.bill_number || bill.id}`;
    const creditDescription = payment.reference_number ? 
      `Ref: ${payment.reference_number}` : 
      `Payment for Bill ${bill.bill_number || bill.id}`;

    // Create journal entry directly using SQL to avoid trigger issues
    let journalId: number;
    try {
      console.log('Creating journal entry with direct SQL...');
      
      // Use a client from the pool for transaction
      const client = await sql.connect();
      
      try {
        // Start transaction
        await client.query('BEGIN');
        
        // Check which date column exists in the journals table
        const schemaCheck = await client.query(`
          SELECT 
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
        `);
        
        const schema = schemaCheck.rows[0];
        console.log('Journal table schema check:', schema);
        
        // Use the appropriate date column based on schema
        let dateColumnName = schema.has_transaction_date ? 'transaction_date' : 'date';
        
        // Insert journal header with dynamic column name
        const journalResult = await client.query(
          `INSERT INTO journals 
            (${dateColumnName}, memo, source, journal_type, is_posted, created_by) 
          VALUES 
            ($1, $2, $3, $4, $5, $6) 
          RETURNING id`,
          [payment.payment_date, journalMemo, 'AP', 'BP', true, userId]
        );
        
        journalId = journalResult.rows[0].id;
        console.log(`Journal created with ID: ${journalId}`);
        
        // Check if journal_lines table has line_number column
        const lineNumberCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'journal_lines' AND column_name = 'line_number'
          ) as has_line_number
        `);
        
        const hasLineNumber = lineNumberCheck.rows[0].has_line_number;
        console.log('Journal lines has line_number column:', hasLineNumber);
        
        // Insert both journal lines at once to avoid trigger validation issues
        let query, lineValues;
        
        if (hasLineNumber) {
          // If line_number column exists, use it
          lineValues = [
            journalId, 1, bill.ap_account_id, debitDescription, amountPaidNum, 0, null, null, null, null,
            journalId, 2, payment.payment_account_id, creditDescription, 0, amountPaidNum, null, null, null, null
          ];
          
          query = `
            INSERT INTO journal_lines 
              (journal_id, line_number, account_id, description, debit, credit, category, location, vendor, funder) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10),
              ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          `;
        } else {
          // If line_number column doesn't exist, omit it
          lineValues = [
            journalId, bill.ap_account_id, debitDescription, amountPaidNum, 0, null, null, null, null,
            journalId, payment.payment_account_id, creditDescription, 0, amountPaidNum, null, null, null, null
          ];
          
          query = `
            INSERT INTO journal_lines 
              (journal_id, account_id, description, debit, credit, category, location, vendor, funder) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9),
              ($10, $11, $12, $13, $14, $15, $16, $17, $18)
          `;
        }
        
        // Insert both lines using a single query with multiple value sets
        await client.query(query, lineValues);
        
        console.log('Journal lines inserted successfully');
        
        // Commit the transaction
        await client.query('COMMIT');
      } catch (err) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('Error in journal creation transaction:', err);
        throw err;
      } finally {
        // Release the client back to the pool
        client.release();
      }
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
    
    const newPayment = await createBillPayment(paymentData);

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

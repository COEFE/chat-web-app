import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/invoices/[id]/payments - List all payments for an invoice
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const urlParts = req.nextUrl.pathname.split('/');
  const invoiceId = parseInt(urlParts[urlParts.length - 2], 10);
  
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    // Check if invoice exists
    const invoiceQuery = `
      SELECT id FROM invoices 
      WHERE id = $1 AND is_deleted = false
    `;
    
    const invoiceResult = await query(invoiceQuery, [invoiceId]);
    
    if (invoiceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Get payments for the invoice
    const paymentsQuery = `
      SELECT
        p.*,
        a.name as deposit_account_name
      FROM
        invoice_payments p
        JOIN accounts a ON p.deposit_to_account_id = a.id
      WHERE
        p.invoice_id = $1
      ORDER BY
        p.payment_date DESC, p.id DESC
    `;
    
    const paymentsResult = await query(paymentsQuery, [invoiceId]);
    
    return NextResponse.json({
      payments: paymentsResult.rows
    });
  } catch (err: any) {
    console.error(`[invoices/${invoiceId}/payments] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

// POST /api/invoices/[id]/payments - Record a payment for an invoice
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const urlParts = req.nextUrl.pathname.split('/');
  const invoiceId = parseInt(urlParts[urlParts.length - 2], 10);
  
  if (isNaN(invoiceId)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { payment } = body;
    
    if (!payment) {
      return NextResponse.json({ error: 'Payment data is required' }, { status: 400 });
    }
    
    // Validate required fields
    if (!payment.payment_date) {
      return NextResponse.json({ error: 'Payment date is required' }, { status: 400 });
    }
    
    if (!payment.amount_received || parseFloat(payment.amount_received) <= 0) {
      return NextResponse.json({ error: 'Payment amount must be greater than zero' }, { status: 400 });
    }
    
    if (!payment.deposit_to_account_id) {
      return NextResponse.json({ error: 'Deposit account is required' }, { status: 400 });
    }
    
    // Get invoice details to check amount and update status
    const invoiceQuery = `
      SELECT * FROM invoices 
      WHERE id = $1 AND is_deleted = false
    `;
    
    const invoiceResult = await query(invoiceQuery, [invoiceId]);
    
    if (invoiceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    const invoice = invoiceResult.rows[0];
    const amountReceived = parseFloat(payment.amount_received);
    const remainingAmount = invoice.total_amount - invoice.amount_paid;
    
    // Validate payment amount
    if (amountReceived > remainingAmount) {
      return NextResponse.json(
        { error: `Payment amount (${amountReceived}) exceeds remaining invoice amount (${remainingAmount})` },
        { status: 400 }
      );
    }
    
    // Begin transaction
    await query('BEGIN');
    
    try {
      // Get deposit account name
      const accountQuery = `
        SELECT name FROM accounts WHERE id = $1
      `;
      
      const accountResult = await query(accountQuery, [payment.deposit_to_account_id]);
      
      if (accountResult.rows.length === 0) {
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Deposit account not found' }, { status: 400 });
      }
      
      const depositAccountName = accountResult.rows[0].name;
      
      // Insert payment record
      const insertPaymentQuery = `
        INSERT INTO invoice_payments (
          invoice_id, payment_date, amount_received,
          deposit_to_account_id, deposit_account_name, payment_method, reference_number
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const paymentResult = await query(insertPaymentQuery, [
        invoiceId,
        payment.payment_date,
        amountReceived,
        payment.deposit_to_account_id,
        depositAccountName,
        payment.payment_method || null,
        payment.reference_number || null
      ]);
      
      const newPayment = paymentResult.rows[0];
      
      // Update invoice amount_paid and status
      const newTotalPaid = invoice.amount_paid + amountReceived;
      let newStatus = invoice.status;
      
      if (newTotalPaid >= invoice.total_amount) {
        newStatus = 'Paid';
      } else if (newTotalPaid > 0) {
        newStatus = 'Partially Paid';
      }
      
      const updateInvoiceQuery = `
        UPDATE invoices
        SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING *
      `;
      
      const updatedInvoiceResult = await query(updateInvoiceQuery, [
        newTotalPaid,
        newStatus,
        invoiceId
      ]);
      
      // Create journal entry for the payment if requested
      if (payment.create_journal_entry !== false) {
        // Get account names for description
        const accountsQuery = `
          SELECT id, name FROM accounts WHERE id IN ($1, $2)
        `;
        
        const accountsResult = await query(accountsQuery, [
          payment.deposit_to_account_id,
          invoice.ar_account_id
        ]);
        
        const accounts = accountsResult.rows.reduce((acc: any, row: any) => {
          acc[row.id] = row.name;
          return acc;
        }, {});
        
        // Check which date column exists in the journals table
        const schemaCheck = await query(`
          SELECT 
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
        `);
        
        const schema = schemaCheck.rows[0];
        
        // Use the appropriate date column based on schema
        const dateColumnName = schema.has_transaction_date ? 'transaction_date' : 'date';
        
        // Create journal entry with dynamic column name
        const journalInsertQuery = `
          INSERT INTO journals (
            ${dateColumnName}, memo, is_posted, created_by
          )
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `;
        
        const memo = `Payment received for Invoice #${invoice.invoice_number}`;
        
        const journalResult = await query(journalInsertQuery, [
          payment.payment_date,
          memo,
          true, // is_posted = true
          userId || 'system'
        ]);
        
        const journalId = journalResult.rows[0].id;
        
        // Check if journal_lines table has line_number column
        const lineNumberCheck = await query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'journal_lines' AND column_name = 'line_number'
          ) as has_line_number
        `);
        
        const hasLineNumber = lineNumberCheck.rows[0].has_line_number;
        
        // Create journal line items with the appropriate columns
        let lineItemsInsertQuery;
        let queryParams;
        
        if (hasLineNumber) {
          // With line_number column
          lineItemsInsertQuery = `
            INSERT INTO journal_lines (
              journal_id, line_number, account_id, description, debit, credit
            )
            VALUES
              ($1, $2, $3, $4, $5, $6),
              ($1, $7, $8, $9, $10, $11)
          `;
          
          queryParams = [
            journalId,
            // Line 1: Debit bank/cash account
            1, payment.deposit_to_account_id,
            `Payment received to ${accounts[payment.deposit_to_account_id]}`,
            amountReceived, 0,
            // Line 2: Credit AR account
            2, invoice.ar_account_id,
            `Payment applied to AR - ${accounts[invoice.ar_account_id]}`,
            0, amountReceived
          ];
        } else {
          // Without line_number column
          lineItemsInsertQuery = `
            INSERT INTO journal_lines (
              journal_id, account_id, description, debit, credit
            )
            VALUES
              ($1, $2, $3, $4, $5),
              ($1, $6, $7, $8, $9)
          `;
          
          queryParams = [
            journalId,
            // Debit bank/cash account
            payment.deposit_to_account_id,
            `Payment received to ${accounts[payment.deposit_to_account_id]}`,
            amountReceived, 0,
            // Credit AR account
            invoice.ar_account_id,
            `Payment applied to AR - ${accounts[invoice.ar_account_id]}`,
            0, amountReceived
          ];
        }
        
        await query(lineItemsInsertQuery, queryParams);
        
        // Link payment to journal
        const linkPaymentQuery = `
          UPDATE invoice_payments
          SET journal_id = $1
          WHERE id = $2
        `;
        
        await query(linkPaymentQuery, [journalId, newPayment.id]);
      }
      
      // Commit transaction
      await query('COMMIT');
      
      return NextResponse.json({
        success: true,
        payment: newPayment,
        invoice: updatedInvoiceResult.rows[0]
      }, { status: 201 });
    } catch (txError: any) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw txError;
    }
  } catch (err: any) {
    console.error(`[invoices/${invoiceId}/payments] POST error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to record payment' },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// GET /api/invoices/[id] - fetch a specific invoice with its line items
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    // Get invoice with customer and account info
    const invoiceQuery = `
      SELECT 
        i.*, 
        c.name as customer_name,
        a.name as ar_account_name
      FROM 
        invoices i
        JOIN customers c ON i.customer_id = c.id
        JOIN accounts a ON i.ar_account_id = a.id
      WHERE 
        i.id = $1 AND i.is_deleted = false
    `;
    
    const invoiceResult = await query(invoiceQuery, [id]);
    
    if (invoiceResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Get invoice line items
    const linesQuery = `
      SELECT 
        l.*, 
        a.name as revenue_account_name
      FROM 
        invoice_lines l
        JOIN accounts a ON l.revenue_account_id = a.id
      WHERE 
        l.invoice_id = $1
      ORDER BY 
        l.id
    `;
    
    // Get invoice payments
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
        p.payment_date DESC
    `;
    
    const [linesResult, paymentsResult] = await Promise.all([
      query(linesQuery, [id]),
      query(paymentsQuery, [id])
    ]);
    
    // Return combined result
    return NextResponse.json({
      invoice: invoiceResult.rows[0],
      lines: linesResult.rows,
      payments: paymentsResult.rows
    });
  } catch (err: any) {
    console.error(`[invoices/${id}] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch invoice' },
      { status: 500 }
    );
  }
}

// PUT /api/invoices/[id] - update a specific invoice and its line items
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { invoice, lines } = body;
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice data is required' }, { status: 400 });
    }
    
    // Validate basic fields
    if (!invoice.customer_id || !invoice.invoice_date || !invoice.due_date || !invoice.ar_account_id) {
      return NextResponse.json({ error: 'Required invoice fields are missing' }, { status: 400 });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }
    
    // Get the existing invoice with all fields needed for audit logging and status check
    const checkQuery = `
      SELECT 
        id, customer_id, customer_name, invoice_number, invoice_date, due_date,
        total_amount, amount_paid, status, terms, memo_to_customer, ar_account_id,
        ar_account_name
      FROM invoices 
      WHERE id = $1 AND is_deleted = false
    `;
    
    const checkResult = await query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    const existingInvoice = checkResult.rows[0];
    
    // Prevent editing fully paid invoices
    if (existingInvoice.status === 'Paid' || (existingInvoice.amount_paid > 0 && existingInvoice.amount_paid === invoice.total_amount)) {
      return NextResponse.json(
        { error: 'Paid invoices cannot be modified' },
        { status: 400 }
      );
    }
    
    // Begin transaction
    await query('BEGIN');
    
    try {
      // Get account name for AR account
      const accountQuery = `
        SELECT name FROM accounts WHERE id = $1
      `;
      const accountResult = await query(accountQuery, [invoice.ar_account_id]);
      
      if (accountResult.rows.length === 0) {
        throw new Error('Invalid AR account ID');
      }
      
      const arAccountName = accountResult.rows[0].name;
      
      // Update invoice
      const updateQuery = `
        UPDATE invoices
        SET
          customer_id = $1,
          customer_name = $2,
          invoice_number = $3,
          invoice_date = $4,
          due_date = $5,
          terms = $6,
          memo_to_customer = $7,
          ar_account_id = $8,
          ar_account_name = $9,
          status = $10,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING *
      `;
      
      const updateResult = await query(updateQuery, [
        invoice.customer_id,
        invoice.customer_name, // Add customer_name to satisfy NOT NULL constraint
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.due_date,
        invoice.terms || null,
        invoice.memo_to_customer || null,
        invoice.ar_account_id,
        arAccountName, // Add AR account name
        invoice.status,
        id
      ]);
      
      // Delete existing line items
      await query('DELETE FROM invoice_lines WHERE invoice_id = $1', [id]);
      
      // Insert updated line items and calculate total
      let totalAmount = 0;
      
      for (const line of lines) {
        if (!line.revenue_account_id || !line.quantity || !line.unit_price) {
          throw new Error('Line items must have revenue account, quantity, and unit price');
        }
        
        // Get revenue account name
        const accountQuery = `
          SELECT name FROM accounts WHERE id = $1
        `;
        const accountResult = await query(accountQuery, [line.revenue_account_id]);
        
        if (accountResult.rows.length === 0) {
          throw new Error('Invalid revenue account ID for line item');
        }
        
        const revenueAccountName = accountResult.rows[0].name;
        
        const lineAmount = parseFloat(line.quantity) * parseFloat(line.unit_price);
        totalAmount += lineAmount;
        
        const lineInsertQuery = `
          INSERT INTO invoice_lines (
            invoice_id, revenue_account_id, revenue_account_name, description, 
            quantity, unit_price, amount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        
        await query(lineInsertQuery, [
          id,
          line.revenue_account_id,
          revenueAccountName,
          line.description || '',
          line.quantity,
          line.unit_price,
          lineAmount
        ]);
      }
      
      // Update invoice total amount
      const updateTotalQuery = `
        UPDATE invoices 
        SET total_amount = $1
        WHERE id = $2
        RETURNING *
      `;
      
      const updatedInvoiceResult = await query(updateTotalQuery, [
        totalAmount,
        id
      ]);
      
      // Extract original and updated invoice data for auditing
      const originalInvoice = checkResult.rows[0];
      const updatedInvoice = updatedInvoiceResult.rows[0];
      
      // Create a list of changes for audit log
      const changes = [];
      
      // Track key changes to invoice fields
      if (originalInvoice.customer_id !== updatedInvoice.customer_id) {
        changes.push({
          field: 'customer_id',
          old_value: originalInvoice.customer_id,
          new_value: updatedInvoice.customer_id
        });
      }
      
      if (originalInvoice.invoice_number !== updatedInvoice.invoice_number) {
        changes.push({
          field: 'invoice_number',
          old_value: originalInvoice.invoice_number,
          new_value: updatedInvoice.invoice_number
        });
      }
      
      // Track changes to dates
      if (originalInvoice.invoice_date !== updatedInvoice.invoice_date) {
        changes.push({
          field: 'invoice_date',
          old_value: originalInvoice.invoice_date,
          new_value: updatedInvoice.invoice_date
        });
      }
      
      if (originalInvoice.due_date !== updatedInvoice.due_date) {
        changes.push({
          field: 'due_date',
          old_value: originalInvoice.due_date,
          new_value: updatedInvoice.due_date
        });
      }
      
      // Track financial changes
      if (originalInvoice.total_amount !== updatedInvoice.total_amount) {
        changes.push({
          field: 'total_amount',
          old_value: originalInvoice.total_amount,
          new_value: updatedInvoice.total_amount
        });
      }
      
      // Track status changes
      if (originalInvoice.status !== updatedInvoice.status) {
        changes.push({
          field: 'status',
          old_value: originalInvoice.status,
          new_value: updatedInvoice.status
        });
      }
      
      // Add more tracked fields as needed
      
      // Log the audit event
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'INVOICE_UPDATED',
        entity_type: 'Invoice',
        entity_id: id,
        changes_made: changes,
        status: 'SUCCESS',
        context: {
          invoice_number: updatedInvoice.invoice_number || `Invoice #${id}`,
          total_amount: updatedInvoice.total_amount,
          line_items_count: lines.length
        }
      });
      
      // Commit transaction
      await query('COMMIT');
      
      return NextResponse.json({
        success: true,
        invoice: updatedInvoice
      });
    } catch (txError: any) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw txError;
    }
  } catch (err: any) {
    console.error(`[invoices/${id}] PUT error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

// DELETE /api/invoices/[id] - soft delete an invoice
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
  }

  try {
    // Check if invoice has payments
    const checkPaymentsQuery = `
      SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = $1
    `;
    
    const paymentsResult = await query(checkPaymentsQuery, [id]);
    const paymentCount = parseInt(paymentsResult.rows[0].count);
    
    if (paymentCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete invoice with ID ${id} because it has ${paymentCount} payment record(s)` },
        { status: 409 }
      );
    }
    
    // Begin transaction
    await query('BEGIN');
    
    try {
      // Get the invoice details for audit logging before deleting
      const getInvoiceQuery = `
        SELECT invoice_number, total_amount, customer_name, customer_id
        FROM invoices 
        WHERE id = $1 AND is_deleted = false
      `;
      
      const invoiceResult = await query(getInvoiceQuery, [id]);
      
      if (invoiceResult.rows.length === 0) {
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      
      const invoice = invoiceResult.rows[0];
      
      // Soft delete invoice
      const deleteInvoiceQuery = `
        UPDATE invoices 
        SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP 
        WHERE id = $1 AND is_deleted = false
        RETURNING id
      `;
      
      const deleteResult = await query(deleteInvoiceQuery, [id]);
      
      if (deleteResult.rows.length === 0) {
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      
      // Log the audit event
      await logAuditEvent({
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'INVOICE_DELETED',
        entity_type: 'Invoice',
        entity_id: id,
        changes_made: [
          {
            field: 'is_deleted',
            old_value: false,
            new_value: true
          },
          {
            field: 'deleted_at',
            old_value: null,
            new_value: new Date().toISOString()
          }
        ],
        status: 'SUCCESS',
        context: {
          invoice_number: invoice.invoice_number || `Invoice #${id}`,
          customer_name: invoice.customer_name,
          customer_id: invoice.customer_id,
          total_amount: invoice.total_amount
        }
      });
      
      // Commit transaction
      await query('COMMIT');
      
      return NextResponse.json({
        success: true,
        message: 'Invoice deleted successfully'
      });
    } catch (txError: any) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw txError;
    }
  } catch (err: any) {
    console.error(`[invoices/${id}] DELETE error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete invoice' },
      { status: 500 }
    );
  }
}

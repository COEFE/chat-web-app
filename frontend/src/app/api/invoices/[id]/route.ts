export const dynamic = 'force-dynamic';

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
        i.id = $1 AND i.is_deleted = false AND i.user_id = $2
    `;
    
    const invoiceResult = await query(invoiceQuery, [id, userId]);
    
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
      WHERE id = $1 AND is_deleted = false AND user_id = $2
    `;
    
    const checkResult = await query(checkQuery, [id, userId]);
    
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
      
      // Delete existing line items
      await query('DELETE FROM invoice_lines WHERE invoice_id = $1', [id]);
      
      // First calculate the total from line items before any DB operations to ensure consistency
      let totalAmount = 0;
      
      // Validate and prepare line items
      for (const line of lines) {
        if (!line.revenue_account_id || !line.quantity || !line.unit_price) {
          throw new Error('Line items must have revenue account, quantity, and unit price');
        }
        
        // Calculate line amount and add to total
        const lineAmount = parseFloat(line.quantity) * parseFloat(line.unit_price);
        totalAmount += lineAmount;
      }
      
      // Now update the invoice with all fields including the calculated total amount
      const completeUpdateQuery = `
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
          total_amount = $11,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $12
        RETURNING *
      `;
      
      // Log the calculated total amount to check it's correct
      console.log(`[Invoice Update] Calculated total amount: ${totalAmount} for invoice ${id}`);
      
      const updatedInvoiceResult = await query(completeUpdateQuery, [
        invoice.customer_id,
        invoice.customer_name,
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.due_date,
        invoice.terms || null,
        invoice.memo_to_customer || null,
        invoice.ar_account_id,
        arAccountName,
        invoice.status,
        totalAmount, // Include the calculated total amount in the main update
        id
      ]);
      
      // Delete existing line items only after invoice is updated
      await query('DELETE FROM invoice_lines WHERE invoice_id = $1', [id]);
      
      // Calculate and log the expected total from the input data before inserting lines
      const expectedTotal = lines.reduce((sum, line) => {
        const qty = parseFloat(line.quantity);
        const price = parseFloat(line.unit_price);
        const lineAmount = qty * price;
        return sum + lineAmount;
      }, 0);
      
      console.log(`[Invoice Update] Expected total from input data: ${expectedTotal}`);
      
      // Insert updated line items
      for (const line of lines) {
        // Get revenue account name
        const accountQuery = `
          SELECT name FROM accounts WHERE id = $1
        `;
        const accountResult = await query(accountQuery, [line.revenue_account_id]);
        
        if (accountResult.rows.length === 0) {
          throw new Error('Invalid revenue account ID for line item');
        }
        
        const revenueAccountName = accountResult.rows[0].name;
        
        // Calculate line amount and ensure it's properly formatted
        const quantity = parseFloat(line.quantity);
        const unitPrice = parseFloat(line.unit_price);
        const lineAmount = quantity * unitPrice;
        
        console.log(`[Invoice Update] Inserting line item: qty=${quantity}, price=${unitPrice}, amount=${lineAmount}`);
        
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
          quantity,
          unitPrice,
          lineAmount
        ]);
      }
      
      // Extract original and updated invoice data for auditing
      const originalInvoice = checkResult.rows[0];
      const updatedInvoice = updatedInvoiceResult.rows[0];
      
      // Prepare to get the most up-to-date data after all operations complete
      
      // Re-fetch with a complete query that includes all related data
      const finalCheckQuery = `
        SELECT i.*, c.name as customer_name, a.name as ar_account_name
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        JOIN accounts a ON i.ar_account_id = a.id
        WHERE i.id = $1 AND i.is_deleted = false
      `;
      
      // Use a new connection for this query to avoid any potential stale data
      const finalCheckResult = await query(finalCheckQuery, [id]);
      const finalInvoice = finalCheckResult.rows[0];
      
      // Log the final invoice data for debugging
      console.log('[Invoice Update] Final invoice data after update:', {
        id: finalInvoice.id,
        total_amount: finalInvoice.total_amount,
        amount_paid: finalInvoice.amount_paid,
        status: finalInvoice.status
      });
      
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
      let statusChanged = false;
      let changedFromDraftToSent = false;
        
      if (originalInvoice.status !== updatedInvoice.status) {
        statusChanged = true;
        changedFromDraftToSent = (originalInvoice.status === 'Draft' && updatedInvoice.status === 'Sent');
            
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
      
      // *** CRITICAL FIX: Use the provided lines data to set the total amount ***
      // The issue is that sometimes line items haven't been fully updated in the database
      // when we try to calculate the total, so use the direct input data
      
      // Calculate the final total directly from the line items that were just inserted
      const finalCalculatedTotal = lines.reduce((sum, line) => {
        const qty = parseFloat(line.quantity);
        const price = parseFloat(line.unit_price);
        return sum + (qty * price);
      }, 0);
      
      console.log(`[Invoice Update] Setting total directly from submitted line items: ${finalCalculatedTotal}`);
      
      // Update the invoice with this total amount directly
      const updateTotalQuery = `
        UPDATE invoices SET total_amount = $1 WHERE id = $2 RETURNING *
      `;
      
      const updateTotalResult = await query(updateTotalQuery, [finalCalculatedTotal, id]);
      
      if (updateTotalResult.rows.length === 0) {
        console.error(`[Invoice Update] Failed to update total amount for invoice ${id}`);
        throw new Error('Failed to update invoice total amount');
      }
      
      // Now get the final invoice data after all updates
      const getFinalQuery = `
        SELECT i.*, c.name as customer_name, a.name as ar_account_name
        FROM invoices i
        JOIN customers c ON i.customer_id = c.id
        JOIN accounts a ON i.ar_account_id = a.id
        WHERE i.id = $1 AND i.is_deleted = false
      `;
      
      const getFinalResult = await query(getFinalQuery, [id]);
      const finalInvoiceData = getFinalResult.rows[0];
      
      // Also get the latest line items
      const getLinesQuery = `
        SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY id
      `;
      
      const getLinesResult = await query(getLinesQuery, [id]);
      
      console.log(`[Invoice Update] Final invoice data: id=${finalInvoiceData.id}, total=${finalInvoiceData.total_amount}, lines=${getLinesResult.rows.length}`);
      
      // Verify total matches expected
      if (Math.abs(parseFloat(finalInvoiceData.total_amount) - finalCalculatedTotal) > 0.01) {
        console.warn(`[Invoice Update] Warning: Final total ${finalInvoiceData.total_amount} doesn't match expected ${finalCalculatedTotal}`);
      }
      
      console.log('[Invoice Update] Final response data before journal handling:', {
        id: finalInvoiceData.id,
        total_amount: finalInvoiceData.total_amount,
        status: finalInvoiceData.status,
        line_count: getLinesResult.rows.length
      });
      
      // Check if we're voiding an invoice and identify status changes
      const isVoiding = invoice.status === 'Void' && originalInvoice.status !== 'Void';
      
      // Force update the status to ensure it's set to exactly what we expect
      if (changedFromDraftToSent) {
        // Make sure the status is explicitly set to 'Sent'
        const forceStatusUpdateQuery = `
          UPDATE invoices
          SET status = 'Sent'
          WHERE id = $1
          RETURNING status
        `;
        
        const statusUpdateResult = await query(forceStatusUpdateQuery, [id]);
        console.log(`[Invoice Update] Forced status update result:`, statusUpdateResult.rows[0]);
        
        // Update our local copy of the invoice data
        finalInvoiceData.status = 'Sent';
      } else if (isVoiding) {
        // Make sure the status is explicitly set to 'Void'
        const forceVoidStatusQuery = `
          UPDATE invoices
          SET status = 'Void'
          WHERE id = $1
          RETURNING status
        `;
        
        const voidStatusResult = await query(forceVoidStatusQuery, [id]);
        console.log(`[Invoice Update] Forced void status update result:`, voidStatusResult.rows[0]);
        
        // Update our local copy of the invoice data
        finalInvoiceData.status = 'Void';
      }
      
      // First try finding the journal entry using the journal_id column if it exists
      // We need this for both draft-to-sent updates and for voiding
      let journalId = null;
      
      // Get journal entry for status changes
      if (changedFromDraftToSent || isVoiding) {
        console.log(`[Invoice Update] Getting journal entry for invoice ${id}.`);
        
        // Step 1: Check for journal_id in invoices table if that column exists
        try {
          const checkColumnQuery = `
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'invoices' AND column_name = 'journal_id'
          `;
          
          const columnResult = await query(checkColumnQuery);
          
          if (columnResult.rows.length > 0) {
            // Column exists, check if invoice has an associated journal entry
            const checkJournalQuery = `
              SELECT journal_id FROM invoices WHERE id = $1
            `;
            const journalCheck = await query(checkJournalQuery, [id]);
            
            if (journalCheck.rows.length > 0 && journalCheck.rows[0].journal_id) {
              journalId = journalCheck.rows[0].journal_id;
              console.log(`[Invoice Update] Found journal ID ${journalId} through invoice.journal_id column`);
            }
          } else {
            console.log(`[Invoice Update] Note: journal_id column doesn't exist in invoices table.`);
          }
        } catch (columnErr) {
          console.error(`[Invoice Update] Warning: Failed to check journal reference:`, columnErr);
        }
        
        // Step 2: If not found by journal_id column, try looking it up in the journals table by source reference
        if (!journalId) {
          try {
            // Search for a journal with source = 'invoice_create' and reference to this invoice
            const findJournalQuery = `
              SELECT id FROM journals 
              WHERE source = 'invoice_create' 
              AND memo LIKE $1
              ORDER BY id DESC LIMIT 1
            `;
            
            const journalSearch = await query(findJournalQuery, [`%Invoice #${finalInvoiceData.invoice_number}%`]);
            
            if (journalSearch.rows.length > 0) {
              journalId = journalSearch.rows[0].id;
              console.log(`[Invoice Update] Found journal ID ${journalId} through memo search`);
            } else {
              console.log(`[Invoice Update] No journal found for invoice #${finalInvoiceData.invoice_number} through memo search`);
            }
          } catch (searchErr) {
            console.error(`[Invoice Update] Error searching for journal entry:`, searchErr);
          }
        }
        
        // Process the journal entry based on the status change
        if (journalId) {
          console.log(`[Invoice Update] Using existing journal entry ${journalId} for invoice ${id}`);
          
          // If changing from Draft to Sent, post the journal entry
          if (changedFromDraftToSent) {
            try {
              const postJournalQuery = `
                UPDATE journals SET is_posted = true WHERE id = $1
              `;
              await query(postJournalQuery, [journalId]);
              
              console.log(`[Invoice Update] Posted existing journal entry ${journalId} for invoice ${id}`);
              
              // Verify the journal entry has balanced lines (debits = credits)
              const verifyBalanceQuery = `
                SELECT 
                SUM(debit) as total_debits, 
                SUM(credit) as total_credits 
              FROM journal_lines 
              WHERE journal_id = $1
              `;
              
              const balanceCheck = await query(verifyBalanceQuery, [journalId]);
              
              if (balanceCheck.rows.length > 0) {
                const { total_debits, total_credits } = balanceCheck.rows[0];
                console.log(`[Invoice Update] Journal entry balance check: Debits=${total_debits}, Credits=${total_credits}`);
                
                if (Math.abs(parseFloat(total_debits || '0') - parseFloat(total_credits || '0')) > 0.01) {
                  console.warn(`[Invoice Update] Warning: Journal entry ${journalId} is not balanced. This should be investigated.`);
                }
              }
            } catch (postErr) {
              console.error(`[Invoice Update] Error posting journal entry ${journalId}:`, postErr);
              throw postErr; // Re-throw to ensure transaction is rolled back
            }
          }
        } else if (changedFromDraftToSent) {
          // Only throw an error if we're trying to mark as Sent but can't find the journal
          console.error(`[Invoice Update] No existing journal entry found for invoice ${id}, invoice number ${finalInvoiceData.invoice_number}`);
          throw new Error(`Cannot mark invoice as Sent: No journal entry found for invoice ${finalInvoiceData.invoice_number}`);
        }
      }
      
      // Handle voiding invoice by creating a reversing journal entry
      if (isVoiding && journalId) {
        console.log(`[Invoice Update] Voiding invoice ${id}. Creating reversing journal entry for journal ${journalId}.`);
        
        try {
          // First, get the original journal entry lines
          const getJournalLinesQuery = `
            SELECT * FROM journal_lines WHERE journal_id = $1
          `;
          
          const journalLinesResult = await query(getJournalLinesQuery, [journalId]);
          const originalLines = journalLinesResult.rows;
          
          if (originalLines.length === 0) {
            console.warn(`[Invoice Update] Warning: No journal lines found for journal ${journalId} to reverse.`);
          } else {
            // Check if we have transaction_date or date column
            const checkDateColumnQuery = `
              SELECT column_name 
              FROM information_schema.columns 
              WHERE table_name = 'journals' AND column_name IN ('transaction_date', 'date')
            `;
            
            const dateColumnResult = await query(checkDateColumnQuery, []);
            const hasTransactionDate = dateColumnResult.rows.some(row => row.column_name === 'transaction_date');
            const dateColumnName = hasTransactionDate ? 'transaction_date' : 'date';
            
            console.log(`[Invoice Update] Using ${dateColumnName} for journals table`);            
            
            // Create a new reversing journal entry
            const createReversingJournalQuery = `
              INSERT INTO journals (
                ${dateColumnName}, memo, journal_type, is_posted, created_by, source
              )
              VALUES ($1, $2, $3, $4, $5, $6)
              RETURNING id
            `;
            
            const today = new Date().toISOString().split('T')[0];
            const reversalMemo = `Voided: Invoice #${finalInvoiceData.invoice_number} for ${finalInvoiceData.customer_name}`;
            
            // Use 'ADJ' (Adjusting Entries) journal type for voiding entries
            // This is one of the standard journal types defined in the database
            const journalType = 'ADJ';
            console.log(`[Invoice Update] Using journal_type=${journalType} for reversing entry`);
            
            const reversalJournalResult = await query(createReversingJournalQuery, [
              today,
              reversalMemo,
              journalType, // Must be 3 chars max for varchar(3) column
              true, // Posted immediately
              userId,
              'invoice_void' // This is for the source field which likely has a larger limit
            ]);
            
            const reversalJournalId = reversalJournalResult.rows[0].id;
            console.log(`[Invoice Update] Created reversing journal entry ${reversalJournalId}`);
            
            // Display original journal lines for debugging
            console.log(`[Invoice Update] Original journal lines to reverse:`, originalLines);

            // Create reversed journal lines (swap debits and credits)
            let totalDebits = 0;
            let totalCredits = 0;
            
            // Prepare all journal lines for insertion in a single transaction
            const journalLines = [];
            
            // Prepare all the reversed journal lines
            for (const line of originalLines) {
              // Safely parse debit and credit values, ensuring numbers
              const originalDebit = parseFloat(line.debit || '0') || 0;
              const originalCredit = parseFloat(line.credit || '0') || 0;
              
              // For the reversal, we swap debits and credits
              const newDebit = originalCredit;
              const newCredit = originalDebit;
              
              totalDebits += newDebit;
              totalCredits += newCredit;
              
              console.log(`[Invoice Update] Reversing line - Account: ${line.account_id}, Original Debit: ${originalDebit}, Original Credit: ${originalCredit}`);
              console.log(`[Invoice Update] Creating reversed line with Debit: ${newDebit}, Credit: ${newCredit}`);
              
              journalLines.push({
                journalId: reversalJournalId,
                accountId: line.account_id,
                description: `Reversal: ${line.description || 'No description'}`,
                debit: newDebit,
                credit: newCredit
              });
            }
            
            // Ensure the journal will be balanced
            if (Math.abs(totalDebits - totalCredits) > 0.001) {
              console.error(`[Invoice Update] Cannot create unbalanced reversal. Debits: ${totalDebits}, Credits: ${totalCredits}`);
              throw new Error(`Journal entry must balance: debits (${totalDebits}) must equal credits (${totalCredits})`);
            }
            
            // Insert all journal lines in a single transaction
            await query('BEGIN');
            
            try {
              for (const line of journalLines) {
                const insertReversalLineQuery = `
                  INSERT INTO journal_lines (
                    journal_id, account_id, description, debit, credit
                  )
                  VALUES ($1, $2, $3, $4, $5)
                `;
                
                await query(insertReversalLineQuery, [
                  line.journalId,
                  line.accountId,
                  line.description,
                  line.debit,
                  line.credit
                ]);
              }
              
              await query('COMMIT');
              console.log(`[Invoice Update] Successfully committed all journal lines in a single transaction`);
              console.log(`[Invoice Update] Successfully created balanced reversing journal entry and lines for voided invoice ${id}`);
            } catch (insertError) {
              await query('ROLLBACK');
              console.error(`[Invoice Update] Error inserting journal lines, rolled back transaction:`, insertError);
              throw insertError;
            }
          }
        } catch (voidErr) {
          console.error(`[Invoice Update] Error creating reversing journal entry:`, voidErr);
          throw voidErr; // Re-throw to ensure transaction is rolled back
        }
      }
      
      // Return the final updated invoice with full data
      return NextResponse.json({
        success: true,
        invoice: finalInvoiceData
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
        WHERE id = $1 AND is_deleted = false AND user_id = $2
      `;
      
      const invoiceResult = await query(getInvoiceQuery, [id, userId]);
      
      if (invoiceResult.rows.length === 0) {
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      
      const invoice = invoiceResult.rows[0];
      
      console.log(`[Invoice Delete] About to delete invoice ${id}`);

      // Check for any existing triggers on the invoices table that might revert our changes
      const triggerCheckQuery = `
        SELECT tgname FROM pg_trigger 
        WHERE tgrelid = 'invoices'::regclass AND tgenabled = 'O'
      `;
      const triggerResult = await query(triggerCheckQuery);
      if (triggerResult.rows.length > 0) {
        console.log(`[Invoice Delete] Found triggers on invoices table:`, triggerResult.rows);
      }
      
      // Soft delete invoice using a direct and simpler query with stronger conditions
      // Make sure to set BOTH is_deleted AND deleted_at to guarantee at least one is recognized
      const now = new Date().toISOString();
      console.log(`[Invoice Delete] Using timestamp: ${now}`);
      
      const deleteInvoiceQuery = `
        UPDATE invoices 
        SET 
          is_deleted = true, 
          deleted_at = $2::timestamp
        WHERE id = $1 AND user_id = $3
        RETURNING id, is_deleted, deleted_at
      `;
      
      const deleteResult = await query(deleteInvoiceQuery, [id, now, userId]);
      console.log(`[Invoice Delete] Delete result:`, deleteResult.rows);
      
      if (deleteResult.rows.length === 0) {
        console.error(`[Invoice Delete] No rows affected when deleting invoice ${id}`);
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Invoice not found or already deleted' }, { status: 404 });
      }
      
      // Verify that is_deleted is now true
      const verifyQuery = `SELECT id, is_deleted, deleted_at FROM invoices WHERE id = $1`;
      const verifyResult = await query(verifyQuery, [id]);
      console.log(`[Invoice Delete] Verification result:`, verifyResult.rows);
      
      if (verifyResult.rows.length === 0 || verifyResult.rows[0].is_deleted !== true) {
        console.error(`[Invoice Delete] Verification failed - invoice ${id} was not properly marked as deleted`);
        await query('ROLLBACK');
        return NextResponse.json({ error: 'Failed to mark invoice as deleted' }, { status: 500 });
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
      
      // Commit transaction explicitly
      console.log(`[Invoice Delete] Committing transaction for invoice ${id}`);
      await query('COMMIT');
      
      // Double check after commit
      const finalCheckQuery = `SELECT id, is_deleted FROM invoices WHERE id = $1`;
      const finalCheck = await query(finalCheckQuery, [id]);
      console.log(`[Invoice Delete] Final check after commit:`, finalCheck.rows);
      
      // If the invoice is not marked as deleted after commit, try again outside the transaction
      if (finalCheck.rows.length > 0 && finalCheck.rows[0].is_deleted === false) {
        console.log(`[Invoice Delete] Invoice ${id} reverted to non-deleted state after commit, trying direct update`);
        
        // Try a direct update outside the transaction as a fallback
        // Use a fresh timestamp to ensure it's different from any existing one
        const forceNow = new Date().toISOString();
        console.log(`[Invoice Delete] Force update using timestamp: ${forceNow}`);
        
        const forceDeleteQuery = `
          UPDATE invoices 
          SET is_deleted = true, deleted_at = $2::timestamp 
          WHERE id = $1
          RETURNING id, is_deleted, deleted_at
        `;
        
        const forceResult = await query(forceDeleteQuery, [id, forceNow]);
        console.log(`[Invoice Delete] Force delete result:`, forceResult.rows);
      }
      
      return NextResponse.json({
        success: true,
        message: 'Invoice deleted successfully',
        invoice_id: id,
        is_deleted: true,
        timestamp: new Date().toISOString() // Add timestamp to ensure we get fresh data
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

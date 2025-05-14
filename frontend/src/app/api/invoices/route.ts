export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/invoices - List all invoices with filtering and pagination
export async function GET(req: NextRequest) {
  console.log(`[Invoices API] Received GET request: ${req.url}`);
  
  const { userId, error } = await authenticateRequest(req);
  if (error) {
    console.error(`[Invoices API] Authentication error:`, error);
    return error;
  }
  
  console.log(`[Invoices API] Authenticated user:`, userId);

  try {
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Filtering parameters
    const customerId = searchParams.get('customerId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    
    // For fetching statuses only
    const statusesOnly = searchParams.get('statuses') === 'true';
    if (statusesOnly) {
      const statusesQuery = `
        SELECT DISTINCT status FROM invoices WHERE is_deleted = false AND user_id = $1
      `;
      const statusesResult = await query(statusesQuery, [userId]);
      const statuses = statusesResult.rows.map(row => row.status);
      return NextResponse.json(statuses);
    }
    
    // Build base queries
    let invoicesQuery = `
      SELECT 
        i.*, 
        c.name as customer_name,
        a.name as ar_account_name
      FROM 
        invoices i
        JOIN customers c ON i.customer_id = c.id
        JOIN accounts a ON i.ar_account_id = a.id
      WHERE 
        (i.is_deleted = false OR i.is_deleted IS NULL) AND i.deleted_at IS NULL AND i.user_id = $1
    `;
    
    let countQuery = `
      SELECT COUNT(*) FROM invoices i WHERE (i.is_deleted = false OR i.is_deleted IS NULL) AND i.deleted_at IS NULL AND i.user_id = $1
    `;
    
    const queryParams: any[] = [userId];
    let paramIndex = 2;
    
    // Add filters to queries
    if (customerId) {
      invoicesQuery += ` AND i.customer_id = $${paramIndex}`;
      countQuery += ` AND i.customer_id = $${paramIndex}`;
      queryParams.push(parseInt(customerId));
      paramIndex++;
    }
    
    if (status) {
      invoicesQuery += ` AND i.status = $${paramIndex}`;
      countQuery += ` AND i.status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      invoicesQuery += ` AND i.invoice_date >= $${paramIndex}`;
      countQuery += ` AND i.invoice_date >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      invoicesQuery += ` AND i.invoice_date <= $${paramIndex}`;
      countQuery += ` AND i.invoice_date <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }
    
    // Add sorting
    invoicesQuery += ` ORDER BY i.created_at DESC, i.id DESC`;
    
    // Add pagination
    invoicesQuery += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Log the query for debugging
    console.log(`[Invoices API] Query: ${invoicesQuery.replace(/\s+/g, ' ')}`);
    console.log(`[Invoices API] Params:`, queryParams);
    
    // Execute queries
    const [invoicesResult, countResult] = await Promise.all([
      query(invoicesQuery, queryParams),
      query(countQuery, queryParams.slice(0, -2)) // Remove limit and offset params
    ]);
    
    // Explicitly filter invoices with is_deleted flag and by checking deleted_at
    let invoicesList = invoicesResult.rows.filter(inv => {
      // If is_deleted is true OR deleted_at exists, consider it deleted
      const isDeleted = inv.is_deleted === true || inv.deleted_at !== null;
      // If deleted, log it and filter it out
      if (isDeleted) {
        console.log(`[Invoices API] Filtering out invoice ${inv.id} that appears to be deleted (is_deleted: ${inv.is_deleted}, deleted_at: ${inv.deleted_at})`);
      }
      return !isDeleted;
    });
    
    // Log if any were filtered out
    const filteredCount = invoicesResult.rows.length - invoicesList.length;
    if (filteredCount > 0) {
      console.warn(`[Invoices API] Warning: Filtered out ${filteredCount} deleted invoices based on is_deleted flag or deleted_at timestamp`);
    }
    
    // Get accurate count from database
    const actualTotal = parseInt(countResult.rows[0].count);
    
    // Double-check that our counts match up
    if (invoicesList.length !== actualTotal && filteredCount === 0) {
      console.warn(`[Invoices API] Warning: Invoice count mismatch - DB reports ${actualTotal} but we have ${invoicesList.length} after filtering`);
    }
    
    const totalPages = Math.ceil(actualTotal / limit);
    
    console.log(`[Invoices API] Successfully fetched ${invoicesList.length} invoices. DB Total: ${actualTotal}, Final Total: ${invoicesList.length}`);
    
    // For safety, recalculate the total based on the filtered list length for pagination
    const finalTotal = invoicesList.length;
    
    const response = {
      invoices: invoicesList,
      pagination: {
        page,
        limit,
        total: finalTotal,
        totalPages
      }
    };
    
    // Create a response with cache-control headers to prevent caching
    const nextResponse = NextResponse.json(response);
    
    // Add cache control headers to prevent caching
    nextResponse.headers.set('Cache-Control', 'no-store, max-age=0');
    nextResponse.headers.set('Pragma', 'no-cache');
    nextResponse.headers.set('Expires', '0');
    
    return nextResponse;
  } catch (err: any) {
    console.error('[invoices] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch invoices' },
      { status: 500 }
    );
  }
}

// POST /api/invoices - Create a new invoice with line items
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    const { invoice, lines } = body;
    
    // Validate required fields
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice data is required' }, { status: 400 });
    }
    
    if (!invoice.customer_id) {
      return NextResponse.json({ error: 'Customer ID is required' }, { status: 400 });
    }
    
    if (!invoice.invoice_date || !invoice.due_date) {
      return NextResponse.json({ error: 'Invoice date and due date are required' }, { status: 400 });
    }
    
    if (!invoice.ar_account_id) {
      return NextResponse.json({ error: 'AR account ID is required' }, { status: 400 });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one line item is required' }, { status: 400 });
    }
    
    // Generate invoice number if not provided
    if (!invoice.invoice_number) {
      const nextNumberQuery = `
        SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS INTEGER)), 0) + 1 as next_num 
        FROM invoices 
        WHERE invoice_number ~ '^INV[0-9]+'
      `;
      const nextNumResult = await query(nextNumberQuery);
      const nextNum = nextNumResult.rows[0].next_num;
      invoice.invoice_number = `INV${nextNum.toString().padStart(5, '0')}`;
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
      
      // Insert invoice
      const invoiceInsertQuery = `
        INSERT INTO invoices (
          customer_id, customer_name, invoice_number, invoice_date, due_date, 
          total_amount, status, terms, memo_to_customer, ar_account_id, ar_account_name,
          user_id
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      
      const invoiceResult = await query(invoiceInsertQuery, [
        invoice.customer_id,
        invoice.customer_name, // Add customer_name to satisfy NOT NULL constraint
        invoice.invoice_number,
        invoice.invoice_date,
        invoice.due_date,
        invoice.total_amount || 0, // Will be updated from line items
        invoice.status || 'Draft',
        invoice.terms || null,
        invoice.memo_to_customer || null,
        invoice.ar_account_id,
        arAccountName, // Add AR account name
        userId // Add user_id for proper data isolation
      ]);
      
      const createdInvoice = invoiceResult.rows[0];
      const invoiceId = createdInvoice.id;
      
      // Insert line items and calculate total
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
          invoiceId,
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
        invoiceId
      ]);
      
      // Create a journal entry for the invoice
      // Check if journals table has transaction_date or date column
      const schemaCheck = await query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'journals' AND column_name = 'transaction_date'
        ) as has_transaction_date
      `);
      
      const schema = schemaCheck.rows[0];
      
      // Use the appropriate date column based on schema
      const dateColumnName = schema.has_transaction_date ? 'transaction_date' : 'date';
      
      // Create journal entry with dynamic column name
      const journalInsertQuery = `
        INSERT INTO journals (
          ${dateColumnName}, memo, journal_type, is_posted, created_by, source
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      
      const memo = `Invoice #${invoice.invoice_number} created`;
      
      // Adding journal entry with AR type
      // If the invoice is created with 'Sent' status, the journal should be posted immediately
      const shouldPostJournal = invoice.status === 'Sent';
      console.log(`[Invoice Create] Creating journal entry with is_posted=${shouldPostJournal} for invoice status=${invoice.status}`)
      
      const journalResult = await query(journalInsertQuery, [
        invoice.invoice_date,
        memo,
        'AR',           // journal_type for Accounts Receivable
        shouldPostJournal, // is_posted = true if invoice is sent, false if draft
        userId || 'system',
        'invoice_create'
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
      
      // First insert the main AR line
      let arLineQuery;
      let arLineParams;
      
      if (hasLineNumber) {
        arLineQuery = `
          INSERT INTO journal_lines (
            journal_id, line_number, account_id, description, debit, credit
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        arLineParams = [
          journalId,
          1,                    // line number
          invoice.ar_account_id,
          `AR - ${arAccountName}`,
          totalAmount,         // debit AR account
          0
        ];
      } else {
        arLineQuery = `
          INSERT INTO journal_lines (
            journal_id, account_id, description, debit, credit
          )
          VALUES ($1, $2, $3, $4, $5)
        `;
        
        arLineParams = [
          journalId,
          invoice.ar_account_id,
          `AR - ${arAccountName}`,
          totalAmount,         // debit AR account
          0
        ];
      }
      
      await query(arLineQuery, arLineParams);
      
      // Then insert revenue lines for each invoice line item
      let lineNumber = 2;
      
      for (const line of lines) {
        const lineAmount = parseFloat(line.quantity) * parseFloat(line.unit_price);
        
        let revenueLineQuery;
        let revenueLineParams;
        
        if (hasLineNumber) {
          revenueLineQuery = `
            INSERT INTO journal_lines (
              journal_id, line_number, account_id, description, debit, credit
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `;
          
          revenueLineParams = [
            journalId,
            lineNumber,
            line.revenue_account_id,
            line.description || 'Revenue',
            0,
            lineAmount        // credit revenue account
          ];
        } else {
          revenueLineQuery = `
            INSERT INTO journal_lines (
              journal_id, account_id, description, debit, credit
            )
            VALUES ($1, $2, $3, $4, $5)
          `;
          
          revenueLineParams = [
            journalId,
            line.revenue_account_id,
            line.description || 'Revenue',
            0,
            lineAmount        // credit revenue account
          ];
        }
        
        await query(revenueLineQuery, revenueLineParams);
        lineNumber++;
      }
      
      // Check if journal_id column exists in the invoices table
      try {
        // First check if the column exists
        const checkColumnQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'invoices' AND column_name = 'journal_id'
        `;
        
        const columnResult = await query(checkColumnQuery);
        
        if (columnResult.rows.length > 0) {
          // Column exists, update the invoice with journal reference
          const updateJournalRefQuery = `
            UPDATE invoices 
            SET journal_id = $1
            WHERE id = $2
          `;
          
          await query(updateJournalRefQuery, [journalId, invoiceId]);
          console.log(`[Invoice Create] Updated invoice ${invoiceId} with journal reference ${journalId}`);
        } else {
          // Column doesn't exist, just log it and continue
          console.log(`[Invoice Create] Note: journal_id column doesn't exist in invoices table. Created journal ${journalId} for invoice ${invoiceId} without reference.`);
        }
      } catch (columnErr) {
        // Even if this fails, we don't want to fail the whole transaction
        console.error(`[Invoice Create] Warning: Failed to update journal reference:`, columnErr);
        // Continue with the transaction - the journal was still created
      }
      
      console.log(`[Invoice Create] Created journal entry ${journalId} for invoice ${invoiceId}`);
      
      // Commit transaction
      await query('COMMIT');
      // Force update the status if it's supposed to be 'Sent'
      // This ensures the status is properly reflected in the database
      if (invoice.status === 'Sent') {
        const forceStatusUpdateQuery = `
          UPDATE invoices
          SET status = 'Sent'
          WHERE id = $1
          RETURNING status
        `;
        
        const statusUpdateResult = await query(forceStatusUpdateQuery, [invoiceId]);
        console.log(`[Invoice Create] Forced status update result:`, statusUpdateResult.rows[0]);
      }

      // Return the result
      return NextResponse.json({
        success: true,
        invoice: updatedInvoiceResult.rows[0]
      }, { status: 201 });
    } catch (txError: any) {
      // Rollback transaction on error
      await query('ROLLBACK');
      throw txError;
    }
  } catch (err: any) {
    console.error('[invoices] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

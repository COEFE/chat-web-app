import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/invoices - List all invoices with filtering and pagination
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

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
        SELECT DISTINCT status FROM invoices WHERE is_deleted = false
      `;
      const statusesResult = await query(statusesQuery);
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
        i.is_deleted = false
    `;
    
    let countQuery = `
      SELECT COUNT(*) FROM invoices i WHERE i.is_deleted = false
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;
    
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
    
    // Add pagination and sorting
    invoicesQuery += ` ORDER BY i.invoice_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Execute queries
    const [invoicesResult, countResult] = await Promise.all([
      query(invoicesQuery, queryParams),
      query(countQuery, queryParams.slice(0, paramIndex - 1))
    ]);
    
    const invoices = invoicesResult.rows;
    const totalCount = parseInt(countResult.rows[0].count);
    
    return NextResponse.json({
      invoices,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });
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
          total_amount, status, terms, memo_to_customer, ar_account_id, ar_account_name
        ) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        arAccountName // Add AR account name
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
      
      // Commit transaction
      await query('COMMIT');
      
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

import * as db from '@/lib/db';
import { Customer } from './customerQueries';
import { getAccountById } from './accountQueries';

export interface Invoice {
  id: number;
  customer_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  terms?: string;
  memo_to_customer?: string;
  ar_account_id: number;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  deleted_at?: string;
}

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  product_or_service_id?: number;
  revenue_account_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface InvoicePayment {
  id: number;
  invoice_id: number;
  payment_date: string;
  amount_received: number;
  deposit_to_account_id: number;
  payment_method?: string;
  reference_number?: string;
  journal_id?: number;
  created_at: string;
  // updated_at: string; - removed as it doesn't exist in the database schema
  // Note: 'notes' field was removed as it doesn't exist in the database schema
}

export interface InvoiceWithCustomer extends Invoice {
  customer_name: string;
  ar_account_name: string;
  lines?: InvoiceLine[];
  payments?: InvoicePayment[];
}

/**
 * Get all invoices with optional filtering and sorting
 */
export async function getInvoices(options: {
  customerId?: number; 
  status?: string; 
  limit?: number;
  includeDetails?: boolean;
  fromDate?: string;
  toDate?: string;
}): Promise<Invoice[]> {
  try {
    const { customerId, status, limit = 100, fromDate, toDate } = options;
    
    let query = `
      SELECT * FROM invoices
      WHERE is_deleted = false
    `;
    
    const params: any[] = [];
    
    if (customerId) {
      query += ` AND customer_id = $${params.length + 1}`;
      params.push(customerId);
    }
    
    if (status) {
      query += ` AND status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (fromDate) {
      query += ` AND invoice_date >= $${params.length + 1}`;
      params.push(fromDate);
    }
    
    if (toDate) {
      query += ` AND invoice_date <= $${params.length + 1}`;
      params.push(toDate);
    }
    
    query += ` ORDER BY invoice_date DESC, id DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    return result.rows as Invoice[];
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching invoices:", error);
    return [];
  }
}

/**
 * Get invoices with customer information and optional line items and payments
 */
export async function getInvoicesWithDetails(options: {
  customerId?: number;
  invoiceId?: number;
  status?: string;
  limit?: number;
  includeLines?: boolean;
  includePayments?: boolean;
  fromDate?: string;
  toDate?: string;
}): Promise<InvoiceWithCustomer[]> {
  try {
    const { 
      customerId, 
      invoiceId,
      status, 
      limit = 20, 
      includeLines = false,
      includePayments = false,
      fromDate,
      toDate
    } = options;
    
    let query = `
      SELECT 
        i.*,
        c.name as customer_name,
        a.name as ar_account_name
      FROM invoices i
      LEFT JOIN customers c ON i.customer_id = c.id
      LEFT JOIN accounts a ON i.ar_account_id = a.id
      WHERE i.is_deleted = false
    `;
    
    const params: any[] = [];
    
    if (invoiceId) {
      query += ` AND i.id = $${params.length + 1}`;
      params.push(invoiceId);
    } else if (customerId) {
      query += ` AND i.customer_id = $${params.length + 1}`;
      params.push(customerId);
    }
    
    if (status) {
      query += ` AND i.status = $${params.length + 1}`;
      params.push(status);
    }
    
    if (fromDate) {
      query += ` AND i.invoice_date >= $${params.length + 1}`;
      params.push(fromDate);
    }
    
    if (toDate) {
      query += ` AND i.invoice_date <= $${params.length + 1}`;
      params.push(toDate);
    }
    
    query += ` ORDER BY i.invoice_date DESC, i.id DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await db.query(query, params);
    const invoices = result.rows as InvoiceWithCustomer[];
    
    // Fetch line items if requested
    if (includeLines && invoices.length > 0) {
      const invoiceIds = invoices.map(invoice => invoice.id).join(',');
      
      if (invoiceIds) {
        const linesQuery = `
          SELECT 
            il.*,
            a.name as revenue_account_name
          FROM invoice_lines il
          LEFT JOIN accounts a ON il.revenue_account_id = a.id
          WHERE il.invoice_id IN (${invoiceIds})
          ORDER BY il.invoice_id, il.id
        `;
        
        try {
          const linesResult = await db.query(linesQuery);
          
          // Attach lines to corresponding invoices
          invoices.forEach(invoice => {
            invoice.lines = linesResult.rows.filter((line: any) => 
              Number(line.invoice_id) === Number(invoice.id)
            );
          });
        } catch (error) {
          console.error("[InvoiceQueries] Error fetching invoice lines:", error);
        }
      }
    }
    
    // Fetch payments if requested
    if (includePayments && invoices.length > 0) {
      const invoiceIds = invoices.map(invoice => invoice.id).join(',');
      
      if (invoiceIds) {
        const paymentsQuery = `
          SELECT 
            ip.*,
            a.name as deposit_account_name
          FROM invoice_payments ip
          LEFT JOIN accounts a ON ip.deposit_to_account_id = a.id
          WHERE ip.invoice_id IN (${invoiceIds})
          ORDER BY ip.payment_date DESC, ip.id DESC
        `;
        
        try {
          const paymentsResult = await db.query(paymentsQuery);
          
          // Attach payments to corresponding invoices
          invoices.forEach(invoice => {
            invoice.payments = paymentsResult.rows.filter((payment: any) => 
              Number(payment.invoice_id) === Number(invoice.id)
            );
          });
        } catch (error) {
          console.error("[InvoiceQueries] Error fetching invoice payments:", error);
        }
      }
    }
    
    return invoices;
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching invoices with details:", error);
    return [];
  }
}

/**
 * Get an invoice by ID with optional line items and payments
 */
export async function getInvoiceById(invoiceId: number, options: { includeLines?: boolean; includePayments?: boolean } = {}): Promise<InvoiceWithCustomer | null> {
  try {
    const result = await getInvoicesWithDetails({
      invoiceId,
      includeLines: options.includeLines ?? true,
      includePayments: options.includePayments ?? false
    });
    
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching invoice by ID:", error);
    return null;
  }
}

/**
 * Get an invoice by invoice number with optional line items and payments
 */
export async function getInvoiceByNumber(invoiceNumber: string, options: { includeLines?: boolean; includePayments?: boolean } = {}): Promise<InvoiceWithCustomer | null> {
  try {
    const query = `
      SELECT 
        i.*,
        c.name as customer_name,
        c.email as customer_email
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.invoice_number = $1
      LIMIT 1
    `;
    
    const result = await db.query(query, [invoiceNumber]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Format the base invoice
    const invoice: InvoiceWithCustomer = {
      ...result.rows[0],
      total_amount: parseFloat(result.rows[0].total_amount),
      customer: {
        id: result.rows[0].customer_id,
        name: result.rows[0].customer_name,
        email: result.rows[0].customer_email
      }
    };
    
    // Add line items if requested
    if (options.includeLines) {
      const linesQuery = `
        SELECT * FROM invoice_lines
        WHERE invoice_id = $1
        ORDER BY line_number ASC
      `;
      
      const linesResult = await db.query(linesQuery, [invoice.id]);
      invoice.lines = linesResult.rows.map((line: any) => ({
        ...line,
        unit_price: parseFloat(line.unit_price),
        quantity: parseFloat(line.quantity),
        amount: parseFloat(line.amount)
      }));
    }
    
    // Add payments if requested
    if (options.includePayments) {
      const paymentsQuery = `
        SELECT * FROM invoice_payments
        WHERE invoice_id = $1
        ORDER BY payment_date DESC, id DESC
      `;
      
      const paymentsResult = await db.query(paymentsQuery, [invoice.id]);
      invoice.payments = paymentsResult.rows.map((payment: any) => ({
        ...payment,
        amount_received: parseFloat(payment.amount_received)
      }));
    }
    
    return invoice;
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching invoice by number:", error);
    return null;
  }
}

/**
 * Get overdue invoices 
 */
export async function getOverdueInvoices(limit: number = 10): Promise<InvoiceWithCustomer[]> {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    
    return getInvoicesWithDetails({
      status: 'Sent',
      limit,
      toDate: currentDate,
      includeLines: false,
      includePayments: false
    });
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching overdue invoices:", error);
    return [];
  }
}

/**
 * Get recent invoice payments
 */
export async function getRecentInvoicePayments(limit: number = 5): Promise<any[]> {
  try {
    const query = `
      SELECT 
        ip.*,
        i.invoice_number,
        c.name as customer_name,
        a.name as deposit_account_name
      FROM invoice_payments ip
      JOIN invoices i ON ip.invoice_id = i.id
      JOIN customers c ON i.customer_id = c.id
      JOIN accounts a ON ip.deposit_to_account_id = a.id
      ORDER BY ip.payment_date DESC, ip.id DESC
      LIMIT $1
    `;
    
    const result = await db.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error("[InvoiceQueries] Error fetching recent invoice payments:", error);
    return [];
  }
}

/**
 * Create a new invoice payment record
 * @param payment Payment data to create
 * @returns Created payment record or null if failed
 */
export async function createInvoicePayment(payment: { 
  invoice_id: number; 
  payment_date: string; 
  amount_received: number; 
  deposit_to_account_id: number; 
  payment_method?: string; 
  reference_number?: string; 
}): Promise<InvoicePayment | null> {
  try {
    // Get the deposit account name - this is required by the database schema
    const depositAccount = await getAccountById(payment.deposit_to_account_id);
    
    if (!depositAccount) {
      console.error(`[InvoiceQueries] Deposit account with ID ${payment.deposit_to_account_id} not found`);
      throw new Error(`Deposit account with ID ${payment.deposit_to_account_id} not found`);
    }
    
    // First, let's inspect the actual table structure to ensure our query matches the schema
    const tableInfoQuery = `
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'invoice_payments'
    `;
    
    const tableInfo = await db.query(tableInfoQuery);
    const columns = tableInfo.rows.map((row: any) => row.column_name);
    console.log('[InvoiceQueries] Available columns in invoice_payments table:', columns);
    
    // Build a dynamic query based on available columns
    let columnNames = [];
    let placeholders = [];
    let paramValues = [];
    let paramCounter = 1;
    
    // Always include required fields
    if (columns.includes('invoice_id')) {
      columnNames.push('invoice_id');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.invoice_id);
    }
    
    if (columns.includes('payment_date')) {
      columnNames.push('payment_date');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.payment_date);
    }
    
    if (columns.includes('amount_received')) {
      columnNames.push('amount_received');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.amount_received);
    }
    
    if (columns.includes('deposit_to_account_id')) {
      columnNames.push('deposit_to_account_id');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.deposit_to_account_id);
    }
    
    // Add deposit_account_name which is required (NOT NULL constraint)
    if (columns.includes('deposit_account_name')) {
      columnNames.push('deposit_account_name');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(depositAccount.name);
    }
    
    // Include optional fields if they exist in the schema
    if (columns.includes('payment_method') && payment.payment_method) {
      columnNames.push('payment_method');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.payment_method);
    }
    
    if (columns.includes('reference_number') && payment.reference_number) {
      columnNames.push('reference_number');
      placeholders.push(`$${paramCounter++}`);
      paramValues.push(payment.reference_number);
    }
    
    // Add created_at if it exists
    if (columns.includes('created_at')) {
      columnNames.push('created_at');
      placeholders.push('NOW()');
    }
    
    // Ensure amount_received is a number (handle possible string conversion)
    if (typeof payment.amount_received === 'string') {
      payment.amount_received = parseFloat(payment.amount_received);
    }
    
    // Build the final query
    const query = `
      INSERT INTO invoice_payments (
        ${columnNames.join(', ')}
      ) VALUES (
        ${placeholders.join(', ')}
      ) RETURNING *
    `;
    
    console.log('[InvoiceQueries] Executing dynamic payment creation query:', query);
    console.log('[InvoiceQueries] With parameters:', paramValues);
    
    const result = await db.query(query, paramValues);
    
    if (result.rows.length > 0) {
      console.log(`[InvoiceQueries] Created payment for invoice #${payment.invoice_id}:`, result.rows[0]);
      
      // First get current invoice data to calculate new amount_paid and determine status
      try {
        const getInvoiceQuery = `
          SELECT total_amount, COALESCE(amount_paid, 0) as amount_paid 
          FROM invoices 
          WHERE id = $1
        `;
        const invoiceResult = await db.query(getInvoiceQuery, [payment.invoice_id]);
        
        if (invoiceResult.rows.length > 0) {
          const invoice = invoiceResult.rows[0];
          const currentAmountPaid = parseFloat(invoice.amount_paid) || 0;
          const newAmountPaid = currentAmountPaid + payment.amount_received;
          const totalAmount = parseFloat(invoice.total_amount);
          
          // Determine if invoice is fully paid or partially paid
          const status = Math.abs(newAmountPaid - totalAmount) < 0.01 ? 'Paid' : 'Partially Paid';
          
          const updateInvoiceQuery = `
            UPDATE invoices
            SET status = $1, amount_paid = $2, updated_at = NOW()
            WHERE id = $3
          `;
          
          await db.query(updateInvoiceQuery, [status, newAmountPaid, payment.invoice_id]);
          console.log(`[InvoiceQueries] Updated invoice #${payment.invoice_id} status to ${status}, amount paid: ${newAmountPaid}`);
        }
      } catch (updateError) {
        console.error('[InvoiceQueries] Error updating invoice status:', updateError);
        // Continue anyway, the payment was recorded successfully
      }
      
      return result.rows[0];
    }
    
    return null;
  } catch (error) {
    console.error("[InvoiceQueries] Error creating invoice payment:", error);
    throw error;
  }
}

/**
 * Get statistics about invoices grouped by status
 * @returns Object with counts of invoices by status
 */
export async function getInvoiceStatistics(): Promise<{ 
  totalCount: number; 
  statusBreakdown: { [status: string]: number };
}> {
  try {
    // First get the total invoice count
    const totalCountQuery = `
      SELECT COUNT(*) as total 
      FROM invoices 
      WHERE (is_deleted = false OR is_deleted IS NULL) AND deleted_at IS NULL
    `;
    
    const totalResult = await db.query(totalCountQuery);
    const totalCount = parseInt(totalResult.rows[0].total, 10) || 0;
    
    // Then get the breakdown by status
    const breakdownQuery = `
      SELECT status, COUNT(*) as count 
      FROM invoices 
      WHERE (is_deleted = false OR is_deleted IS NULL) AND deleted_at IS NULL
      GROUP BY status
    `;
    
    const breakdownResult = await db.query(breakdownQuery);
    
    // Format the results into an object
    const statusBreakdown: { [status: string]: number } = {};
    
    breakdownResult.rows.forEach((row: { status: string; count: string }) => {
      statusBreakdown[row.status] = parseInt(row.count, 10);
    });
    
    return { totalCount, statusBreakdown };
  } catch (error) {
    console.error('[InvoiceQueries] Error getting invoice statistics:', error);
    return { totalCount: 0, statusBreakdown: {} };
  }
}

/**
 * Interface for creating a new invoice
 */
export interface CreateInvoiceData {
  customer_id: number;
  customer_name: string; // Customer name is required
  invoice_date: string;
  due_date?: string;
  terms?: string;
  memo_to_customer?: string;
  ar_account_id: number;
  ar_account_name: string; // AR account name is required
  lines: {
    description: string;
    quantity: number;
    unit_price: number;
    revenue_account_id: number;
    revenue_account_name: string; // Revenue account name is required
  }[];
}

/**
 * Create a new invoice with line items
 * @param invoiceData Invoice data including line items
 * @returns The ID of the created invoice or null if failed
 */
export async function createInvoice(invoiceData: CreateInvoiceData): Promise<number | null> {
  try {
    // Validate required fields
    if (!invoiceData.customer_id) {
      throw new Error('Customer ID is required');
    }
    
    if (!invoiceData.ar_account_id) {
      throw new Error('AR account ID is required');
    }
    
    if (!invoiceData.lines || invoiceData.lines.length === 0) {
      throw new Error('At least one invoice line is required');
    }
    
    // Generate invoice number - format INV-YYYYMMDD-XX
    const today = new Date();
    const dateString = today.toISOString().split('T')[0].replace(/-/g, '');
    
    // Get the count of invoices created today to generate a unique suffix
    const countQuery = await db.query(`
      SELECT COUNT(*) as count FROM invoices 
      WHERE invoice_number LIKE $1
    `, [`INV-${dateString}-%`]);
    
    const count = parseInt(countQuery.rows[0].count) + 1;
    const invoiceNumber = `INV-${dateString}-${count.toString().padStart(2, '0')}`;
    
    // Set due date if not provided (default: 30 days from invoice date)
    const invoiceDate = invoiceData.invoice_date || today.toISOString().split('T')[0];
    let dueDate = invoiceData.due_date;
    
    if (!dueDate) {
      const dueDateObj = new Date(invoiceDate);
      dueDateObj.setDate(dueDateObj.getDate() + 30); // 30 days from invoice date
      dueDate = dueDateObj.toISOString().split('T')[0];
    }
    
    // Calculate total amount from line items
    const totalAmount = invoiceData.lines.reduce((total, line) => {
      return total + (line.quantity * line.unit_price);
    }, 0);
    
    // Prepare transaction queries
    const queries = [];
    
    // Add invoice creation query
    queries.push({
      text: `
        INSERT INTO invoices (
          customer_id,
          customer_name,
          invoice_number,
          invoice_date,
          due_date,
          total_amount,
          amount_paid,
          status,
          terms,
          memo_to_customer,
          ar_account_id,
          ar_account_name,
          created_at,
          updated_at,
          is_deleted
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), false)
        RETURNING id
      `,
      params: [
        invoiceData.customer_id,
        invoiceData.customer_name,
        invoiceNumber,
        invoiceDate,
        dueDate,
        totalAmount,
        0, // amount_paid starts at 0
        'Draft', // Initial status
        invoiceData.terms || null,
        invoiceData.memo_to_customer || null,
        invoiceData.ar_account_id,
        invoiceData.ar_account_name // Add the AR account name
      ]
    });
    
    // Execute the transaction
    const results = await db.transaction(queries);
    const invoiceId = results[0].rows[0].id;
    
    // Insert line items (needs to be done after getting the invoice ID)
    const lineQueries = [];
    
    for (const line of invoiceData.lines) {
      const lineAmount = line.quantity * line.unit_price;
      
      lineQueries.push({
        text: `
          INSERT INTO invoice_lines (
            invoice_id,
            revenue_account_id,
            revenue_account_name,
            description,
            quantity,
            unit_price,
            amount,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `,
        params: [
          invoiceId,
          line.revenue_account_id,
          line.revenue_account_name,
          line.description,
          line.quantity,
          line.unit_price,
          lineAmount
        ]
      });
    }
    
    // Execute line item insertions
    await db.transaction(lineQueries);
    
    return invoiceId;
  } catch (error) {
    console.error('[InvoiceQueries] Error creating invoice:', error);
    return null;
  }
}

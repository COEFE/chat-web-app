import * as db from '@/lib/db';
import { Customer } from './customerQueries';

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
  updated_at: string;
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
    
    if (customerId) {
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

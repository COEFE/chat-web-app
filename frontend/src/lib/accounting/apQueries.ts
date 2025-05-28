import { sql } from '@vercel/postgres';
import { Bill, BillWithVendor } from './billQueries';
import { Vendor } from './vendorQueries';

/**
 * Get bills with their associated vendor information
 * This is specifically designed for the AP Agent to provide more complete information
 */
export interface BillLineDetail {
  id?: number;
  bill_id?: string;
  account_id: string;
  expense_account_id?: number;
  description?: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  amount?: number;
  category?: string;
  location?: string;
  funder?: string;
  expense_account_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BillWithDetails extends BillWithVendor {
  lines?: BillLineDetail[];
}





export async function getBillsWithVendors(
  limit: number = 5,
  status?: string,
  vendorId?: number,
  includeLines: boolean = true
): Promise<BillWithDetails[]> {
  try {
    // Build the query with options for filtering
    let query = `
      SELECT 
        b.*,
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bills b
      LEFT JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON b.ap_account_id = a.id
      WHERE b.is_deleted = false
    `;
    
    const params: any[] = [];
    
    // Add vendor filter if provided
    if (vendorId) {
      query += ` AND b.vendor_id = $${params.length + 1}`;
      params.push(vendorId);
    }
    
    // Add status filter if provided
    if (status) {
      query += ` AND LOWER(b.status) = LOWER($${params.length + 1})`;
      params.push(status);
    }
    
    // Order by most recent first (for finding latest paid bills)
    query += ` ORDER BY b.bill_date DESC, b.id DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await sql.query(query, params);
    const bills = result.rows as BillWithDetails[];
    
    // Get bill lines if requested
    if (includeLines && bills.length > 0) {
      // Construct query to get lines for all the bills at once
      const billIds = bills.map(bill => bill.id).join(',');
      
      if (billIds) {
        const linesQuery = `
          SELECT 
            bl.*,
            a.name as expense_account_name
          FROM bill_lines bl
          LEFT JOIN accounts a ON bl.expense_account_id = a.id
          WHERE bl.bill_id IN (${billIds})
          ORDER BY bl.bill_id, bl.id
        `;
        
        try {
          const linesResult = await sql.query(linesQuery);
          
          // Attach lines to corresponding bills
          bills.forEach(bill => {
            bill.lines = linesResult.rows.filter(
              line => Number(line.bill_id) === Number(bill.id)
            );
          });
        } catch (error) {
          console.error("[APQueries] Error fetching bill lines:", error);
          // Continue without lines if there's an error
        }
      }
    }
    
    return bills;
  } catch (error) {
    console.error("[APQueries] Error fetching bills with vendors:", error);
    return [];
  }
}

/**
 * Get the last paid bill including vendor information
 */
export async function getLastPaidBill(): Promise<BillWithVendor | null> {
  try {
    const query = `
      SELECT 
        b.*,
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bills b
      LEFT JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON b.ap_account_id = a.id
      WHERE b.is_deleted = false 
      AND (b.status = 'Paid' OR b.amount_paid > 0)
      ORDER BY 
        CASE 
          WHEN b.status = 'Paid' THEN 0 
          ELSE 1 
        END,
        b.updated_at DESC, 
        b.id DESC
      LIMIT 1
    `;
    
    const result = await sql.query(query);
    return result.rows.length > 0 ? result.rows[0] as BillWithVendor : null;
  } catch (error) {
    console.error("[APQueries] Error fetching last paid bill:", error);
    return null;
  }
}

/**
 * Get vendors associated with paid bills
 */
export async function getVendorsWithPaidBills(limit: number = 5): Promise<(Vendor & { total_paid?: number })[]> {
  try {
    const query = `
      SELECT 
        v.*,
        SUM(CASE WHEN b.amount_paid IS NOT NULL THEN CAST(b.amount_paid as FLOAT) ELSE 0 END) as total_paid
      FROM vendors v
      JOIN bills b ON v.id = b.vendor_id
      WHERE v.is_deleted = false AND b.is_deleted = false
      AND (b.status = 'Paid' OR b.amount_paid > 0)
      GROUP BY v.id
      ORDER BY total_paid DESC
      LIMIT $1
    `;
    
    const result = await sql.query(query, [limit]);
    return result.rows as (Vendor & { total_paid?: number })[];
  } catch (error) {
    console.error("[APQueries] Error fetching vendors with paid bills:", error);
    return [];
  }
}

/**
 * Get recent bill payments
 */
export async function getRecentBillPayments(limit: number = 5): Promise<any[]> {
  try {
    const query = `
      SELECT 
        bp.*,
        b.bill_number,
        v.name as vendor_name,
        a.name as payment_account_name
      FROM bill_payments bp
      JOIN bills b ON bp.bill_id = b.id
      JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON bp.payment_account_id = a.id
      ORDER BY bp.payment_date DESC
      LIMIT $1
    `;
    
    const result = await sql.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error("[APQueries] Error fetching recent bill payments:", error);
    
    // Handle case where bill_payments table doesn't exist yet
    if (error instanceof Error && error.message.includes('relation "bill_payments" does not exist')) {
      return [];
    }
    
    return [];
  }
}

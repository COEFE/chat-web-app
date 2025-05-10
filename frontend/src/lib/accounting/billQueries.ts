import { sql } from '@vercel/postgres';

/**
 * Interface for Bill objects
 */
export interface Bill {
  id?: number;
  vendor_id: number;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid?: number;
  status?: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
}

/**
 * Interface for Bill Line objects
 */
export interface BillLine {
  id?: number;
  bill_id?: string;
  expense_account_id: string;
  description?: string;
  quantity: string;
  unit_price: string;
  amount: string;
  category?: string;
  location?: string;
  funder?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface for Bill Payment objects
 */
export interface BillPayment {
  id?: number;
  bill_id: number;
  payment_date: string;
  amount_paid: number;
  payment_account_id: number;
  payment_method?: string;
  reference_number?: string;
  journal_id?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get a list of bills with optional filtering and pagination
 */
export interface BillWithVendor extends Bill {
  vendor_name?: string; 
  ap_account_name?: string;
}

export async function getBills(
  page: number = 1,
  limit: number = 50,
  vendorId?: number,
  startDate?: string,
  endDate?: string,
  status?: string,
  includeDeleted: boolean = false
): Promise<{ bills: Bill[], total: number }> {
  try {
    // Build the query dynamically based on filters
    let whereClause = includeDeleted ? '' : 'WHERE b.is_deleted = false';
    const values: any[] = [];
    let paramIndex = 1;
    
    if (vendorId) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` vendor_id = $${paramIndex++}`;
      values.push(vendorId);
    }
    
    if (startDate) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` bill_date >= $${paramIndex++}`;
      values.push(startDate);
    }
    
    if (endDate) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` bill_date <= $${paramIndex++}`;
      values.push(endDate);
    }
    
    if (status) {
      whereClause += whereClause ? ' AND' : ' WHERE';
      whereClause += ` status = $${paramIndex++}`;
      values.push(status);
    }
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) FROM bills b ${whereClause}
    `;
    
    const countResult = await sql.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);
    
    // Get bills with pagination
    const offset = (page - 1) * limit;
    const billsQuery = `
      SELECT 
        b.*,
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bills b
      LEFT JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON b.ap_account_id = a.id
      ${whereClause}
      ORDER BY b.bill_date DESC, b.id DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    
    values.push(limit);
    values.push(offset);
    
    const billsResult = await sql.query(billsQuery, values);
    
    const bills = billsResult.rows;
    
    return {
      bills,
      total
    };
  } catch (error) {
    console.error('Error getting bills:', error);
    throw error;
  }
}

/**
 * Get bill statuses for filtering
 */
export async function getBillStatuses(): Promise<string[]> {
  try {
    const result = await sql.query(`
      SELECT DISTINCT status FROM bills b WHERE b.is_deleted = false ORDER BY status
    `);
    return result.rows.map((row: any) => row.status);
  } catch (error) {
    console.error('Error getting bill statuses:', error);
    return ['Open', 'Partially Paid', 'Paid', 'Overdue'];
  }
}

/**
 * Get a specific bill by ID including its line items
 */
export async function getBill(id: number, includeLines: boolean = true, includePayments: boolean = true): Promise<Bill | null> {
  try {
    // Get the bill
    const billQuery = `
      SELECT 
        b.*,
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bills b
      LEFT JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON b.ap_account_id = a.id
      WHERE b.id = $1 AND b.is_deleted = false
    `;
    
    const billResult = await sql.query(billQuery, [id]);
    
    if (billResult.rows.length === 0) {
      return null;
    }
    
    const bill = billResult.rows[0];
    
    // Get bill lines if requested
    if (includeLines) {
      const linesQuery = `
        SELECT 
          bl.*,
          a.name as expense_account_name
        FROM bill_lines bl
        LEFT JOIN accounts a ON bl.expense_account_id = a.id
        WHERE bl.bill_id = $1
        ORDER BY bl.id
      `;
      
      const linesResult = await sql.query(linesQuery, [id]);
      console.log('Bill lines raw result:', linesResult.rows);
      
      // Attach lines to bill object
      bill.lines = linesResult.rows;
    }
    
    // Get bill payments if requested
    if (includePayments) {
      // Check if bill_payments table exists
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = 'bill_payments'
        ) as exists;
      `;
      
      if (tableCheck.rows[0].exists) {
        const paymentsQuery = `
          SELECT 
            bp.*,
            a.name as payment_account_name
          FROM bill_payments bp
          LEFT JOIN accounts a ON bp.payment_account_id = a.id
          WHERE bp.bill_id = $1
          ORDER BY bp.payment_date, bp.id
        `;
        
        const paymentsResult = await sql.query(paymentsQuery, [id]);
        
        // Attach payments to bill object
        bill.payments = paymentsResult.rows;
      }
    }
    
    console.log('Bill object with lines:', bill);
    return bill;
  } catch (error) {
    console.error('Error getting bill:', error);
    throw error;
  }
}

/**
 * Create a new bill with its line items
 */
export async function createBill(bill: Bill, lines: BillLine[]): Promise<Bill> {
  // Start a transaction
  await sql.query('BEGIN');
  
  try {
    // Insert the bill
    const billQuery = `
      INSERT INTO bills (
        vendor_id,
        bill_number,
        bill_date,
        due_date,
        total_amount,
        amount_paid,
        status,
        terms,
        memo,
        ap_account_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    // Calculate total from line items
    const totalAmount = lines.reduce((sum, line) => sum + parseFloat(line.amount), 0);
    
    const billResult = await sql.query(billQuery, [
      bill.vendor_id,
      bill.bill_number || null,
      bill.bill_date,
      bill.due_date,
      totalAmount,
      0, // Initial amount_paid is 0
      'Open', // Initial status is Open
      bill.terms || null,
      bill.memo || null,
      bill.ap_account_id
    ]);
    
    const newBill = billResult.rows[0];
    
    // Insert the bill lines
    for (const line of lines) {
      const lineQuery = `
        INSERT INTO bill_lines (
          bill_id,
          expense_account_id,
          description,
          quantity,
          unit_price,
          amount,
          category,
          location,
          funder
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;
      
      await sql.query(lineQuery, [
        newBill.id,
        line.expense_account_id,
        line.description || null,
        line.quantity,
        line.unit_price,
        line.amount,
        line.category || null,
        line.location || null,
        line.funder || null
      ]);
    }
    
    // Commit the transaction
    await sql.query('COMMIT');
    
    return newBill;
  } catch (error) {
    // Rollback in case of error
    await sql.query('ROLLBACK');
    throw error;
  }
}

/**
 * Update an existing bill
 */
export async function updateBill(id: number, bill: Partial<Bill>, lines?: BillLine[]): Promise<Bill | null> {
  // Start a transaction
  await sql.query('BEGIN');
  
  try {
    // Get the current bill to check status
    const currentBillQuery = `
      SELECT * FROM bills WHERE id = $1 AND is_deleted = false
    `;
    
    const currentBillResult = await sql.query(currentBillQuery, [id]);
    
    if (currentBillResult.rows.length === 0) {
      await sql.query('ROLLBACK');
      return null;
    }
    
    const currentBill = currentBillResult.rows[0];
    
    // Don't allow updates to fully paid bills
    if (currentBill.status === 'Paid') {
      throw new Error('Cannot update a paid bill');
    }
    
    // Build the update query dynamically
    let setClause = '';
    const values: any[] = [];
    let paramIndex = 1;
    
    if (bill.vendor_id !== undefined) {
      setClause += `vendor_id = $${paramIndex++}, `;
      values.push(bill.vendor_id);
    }
    
    if (bill.bill_number !== undefined) {
      setClause += `bill_number = $${paramIndex++}, `;
      values.push(bill.bill_number || null);
    }
    
    if (bill.bill_date !== undefined) {
      setClause += `bill_date = $${paramIndex++}, `;
      values.push(bill.bill_date);
    }
    
    if (bill.due_date !== undefined) {
      setClause += `due_date = $${paramIndex++}, `;
      values.push(bill.due_date);
    }
    
    if (bill.terms !== undefined) {
      setClause += `terms = $${paramIndex++}, `;
      values.push(bill.terms || null);
    }
    
    if (bill.memo !== undefined) {
      setClause += `memo = $${paramIndex++}, `;
      values.push(bill.memo || null);
    }
    
    if (bill.ap_account_id !== undefined) {
      setClause += `ap_account_id = $${paramIndex++}, `;
      values.push(bill.ap_account_id);
    }
    
    // Update line items if provided
    if (lines && lines.length > 0) {
      // Calculate new total amount from line items
      const totalAmount = lines.reduce((sum, line) => sum + parseFloat(line.amount), 0);
      
      setClause += `total_amount = $${paramIndex++}, `;
      values.push(totalAmount);
      
      // Delete existing line items
      await sql.query(`DELETE FROM bill_lines WHERE bill_id = $1`, [id]);
      
      // Insert new line items
      for (const line of lines) {
        const lineQuery = `
          INSERT INTO bill_lines (
            bill_id,
            expense_account_id,
            description,
            quantity,
            unit_price,
            amount,
            category,
            location,
            funder
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        
        await sql.query(lineQuery, [
          id,
          line.expense_account_id,
          line.description || null,
          line.quantity,
          line.unit_price,
          line.amount,
          line.category || null,
          line.location || null,
          line.funder || null
        ]);
      }
    }
    
    // Only update if there are changes
    if (setClause) {
      // Add updated_at timestamp
      setClause += `updated_at = CURRENT_TIMESTAMP`;
      
      // Add ID to values
      values.push(id);
      
      const updateQuery = `
        UPDATE bills
        SET ${setClause}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      
      await sql.query(updateQuery, values);
    }
    
    // Commit the transaction
    await sql.query('COMMIT');
    
    // Return the updated bill
    return getBill(id);
  } catch (error) {
    // Rollback in case of error
    await sql.query('ROLLBACK');
    throw error;
  }
}

/**
 * Soft delete a bill
 */
export async function deleteBill(id: number): Promise<boolean> {
  try {
    // Check if the bill exists and is not already deleted
    const checkQuery = `
      SELECT * FROM bills WHERE id = $1 AND is_deleted = false
    `;
    
    const checkResult = await sql.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return false;
    }
    
    // Soft delete the bill
    const deleteQuery = `
      UPDATE bills
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    await sql.query(deleteQuery, [id]);
    
    return true;
  } catch (error) {
    console.error('Error deleting bill:', error);
    throw error;
  }
}

/**
 * Create a bill payment
 */
export async function createBillPayment(payment: BillPayment): Promise<BillPayment> {
  // Start a transaction
  await sql.query('BEGIN');
  
  try {
    // Get the bill to check status and remaining amount
    const billQuery = `
      SELECT * FROM bills WHERE id = $1 AND is_deleted = false
    `;
    
    const billResult = await sql.query(billQuery, [payment.bill_id]);
    
    if (billResult.rows.length === 0) {
      throw new Error(`Bill with ID ${payment.bill_id} not found`);
    }
    
    const bill = billResult.rows[0];
    const remainingAmount = bill.total_amount - bill.amount_paid;
    
    if (payment.amount_paid > remainingAmount) {
      throw new Error(`Payment amount ${payment.amount_paid} exceeds remaining bill amount ${remainingAmount}`);
    }
    
    // Insert the payment
    const paymentQuery = `
      INSERT INTO bill_payments (
        bill_id,
        payment_date,
        amount_paid,
        payment_account_id,
        payment_method,
        reference_number,
        journal_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const paymentResult = await sql.query(paymentQuery, [
      payment.bill_id,
      payment.payment_date,
      payment.amount_paid,
      payment.payment_account_id,
      payment.payment_method || null,
      payment.reference_number || null,
      payment.journal_id || null
    ]);
    
    const newPayment = paymentResult.rows[0];
    
    // Update the bill's amount_paid and status
    // Ensure both values are converted to numbers to avoid string concatenation
    const currentAmountPaid = typeof bill.amount_paid === 'string' ? parseFloat(bill.amount_paid) : Number(bill.amount_paid) || 0;
    const paymentAmount = typeof payment.amount_paid === 'number' ? payment.amount_paid : parseFloat(String(payment.amount_paid)) || 0;
    const totalAmount = typeof bill.total_amount === 'string' ? parseFloat(bill.total_amount) : Number(bill.total_amount) || 0;
    
    // Round to 2 decimal places to avoid floating point issues
    const newAmountPaid = Math.round((currentAmountPaid + paymentAmount) * 100) / 100;
    let newStatus = bill.status;
    
    console.log(`Updating bill payment: Current: ${currentAmountPaid}, Payment: ${paymentAmount}, New Total: ${newAmountPaid}, Bill Total: ${totalAmount}`);
    
    if (newAmountPaid >= totalAmount || Math.abs(newAmountPaid - totalAmount) < 0.01) {
      newStatus = 'Paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'Partially Paid';
    }
    
    // Convert amount to string for PostgreSQL
    await sql.query(`
      UPDATE bills
      SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newAmountPaid.toString(), newStatus, payment.bill_id]);
    
    // Commit the transaction
    await sql.query('COMMIT');
    
    return newPayment;
  } catch (error) {
    // Rollback in case of error
    await sql.query('ROLLBACK');
    throw error;
  }
}

/**
 * Delete a bill payment
 */
export async function deleteBillPayment(id: number): Promise<boolean> {
  // Start a transaction
  await sql.query('BEGIN');
  
  try {
    // Get the payment info
    const paymentQuery = `
      SELECT * FROM bill_payments WHERE id = $1
    `;
    
    const paymentResult = await sql.query(paymentQuery, [id]);
    
    if (paymentResult.rows.length === 0) {
      await sql.query('ROLLBACK');
      return false;
    }
    
    const payment = paymentResult.rows[0];
    
    // Get the bill
    const billQuery = `
      SELECT * FROM bills WHERE id = $1
    `;
    
    const billResult = await sql.query(billQuery, [payment.bill_id]);
    
    if (billResult.rows.length === 0) {
      await sql.query('ROLLBACK');
      return false;
    }
    
    const bill = billResult.rows[0];
    
    // Calculate new amount paid
    // Ensure both values are parsed as numbers to avoid string concatenation
    const currentAmountPaid = parseFloat(bill.amount_paid) || 0;
    const paymentAmount = parseFloat(payment.amount_paid) || 0;
    
    // Round to 2 decimal places to avoid floating point issues
    const newAmountPaid = Math.round((currentAmountPaid - paymentAmount) * 100) / 100;
    
    let newStatus = bill.status;
    
    if (newAmountPaid <= 0) {
      newStatus = 'Open';
    } else if (newAmountPaid < bill.total_amount) {
      newStatus = 'Partially Paid';
    }
    
    // Update the bill
    await sql.query(`
      UPDATE bills
      SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `, [newAmountPaid.toString(), newStatus, payment.bill_id]);
    
    // Delete associated journal entry if it exists
    if (payment.journal_id) {
      await sql.query(`
        DELETE FROM journal_lines WHERE journal_id = $1
      `, [payment.journal_id]);
      
      await sql.query(`
        DELETE FROM journals WHERE id = $1
      `, [payment.journal_id]);
    }
    
    // Delete the payment
    await sql.query(`
      DELETE FROM bill_payments WHERE id = $1
    `, [id]);
    
    // Commit the transaction
    await sql.query('COMMIT');
    
    return true;
  } catch (error) {
    // Rollback in case of error
    await sql.query('ROLLBACK');
    throw error;
  }
}

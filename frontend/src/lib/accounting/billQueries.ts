import { sql } from "@vercel/postgres";

/**
 * Interface for Bill objects
 */
export interface Bill {
  id?: number;
  vendor_id: number;
  vendor_name?: string;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  paid_amount?: number;
  amount_paid?: number; // Alias for paid_amount for compatibility
  status?: string;
  payment_terms?: string;
  terms?: string; // Alias for payment_terms for compatibility
  description?: string;
  memo?: string; // Alias for description for compatibility
  ap_account_id: number;
  ap_account_name?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  journal_type?: string; // Add journal_type to the Bill interface
  journal_id?: number; // Add journal_id to track associated journal entry
  user_receipt_context?: string; // User-provided context for receipt processing
  lines?: BillLine[];
  payments?: BillPayment[];
}

/**
 * Interface for Bill Line objects
 */
export interface BillLine {
  id?: number;
  bill_id?: string;
  account_id: string;
  expense_account_id?: number;
  expense_account_name?: string;
  description?: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  amount?: number; // Alias for line_total as number
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
  payment_account_name?: string; // Added from JOIN with accounts table
  payment_method?: string;
  reference_number?: string;
  journal_id?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Interface for Bill Refund objects
 */
export interface BillRefund {
  id?: number;
  bill_id: number;
  refund_date: string;
  amount: number;
  refund_account_id: number;
  refund_method?: string;
  reference_number?: string;
  journal_id?: number;
  reason?: string;
  created_at?: string;
  updated_at?: string;
  account_name?: string; // From join with accounts table
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
  status?: string | string[],
  includeDeleted: boolean = false,
  userId?: string
): Promise<{ bills: Bill[]; total: number }> {
  try {
    // Build the query dynamically based on filters
    let whereClause = includeDeleted ? "" : "WHERE b.is_deleted = false";
    const values: any[] = [];
    let paramIndex = 1;

    if (vendorId) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` vendor_id = $${paramIndex++}`;
      values.push(vendorId);
    }

    if (startDate) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` bill_date >= $${paramIndex++}`;
      values.push(startDate);
    }

    if (endDate) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` bill_date <= $${paramIndex++}`;
      values.push(endDate);
    }

    if (status) {
      if (Array.isArray(status) && status.length > 0) {
        // Handle multiple status values
        whereClause += whereClause ? " AND" : " WHERE";
        const statusPlaceholders = status
          .map((_, i) => `$${paramIndex + i}`)
          .join(", ");
        whereClause += ` status IN (${statusPlaceholders})`;
        values.push(...status);
        paramIndex += status.length;
      } else if (typeof status === "string") {
        // Handle single status value
        whereClause += whereClause ? " AND" : " WHERE";
        whereClause += ` status = $${paramIndex++}`;
        values.push(status);
      }
    }

    // Filter by user_id if provided (for proper data isolation)
    if (userId) {
      whereClause += whereClause ? " AND" : " WHERE";
      whereClause += ` b.user_id = $${paramIndex++}`;
      values.push(userId);
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
        b.paid_amount as amount_paid,
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
      total,
    };
  } catch (error) {
    console.error("Error getting bills:", error);
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
    console.error("Error getting bill statuses:", error);
    return ["Open", "Partially Paid", "Paid", "Overdue"];
  }
}

/**
 * Get a specific bill by ID including its line items
 */
export async function getBill(
  id: number,
  includeLines: boolean = true,
  includePayments: boolean = true,
  userId?: string
): Promise<Bill | null> {
  try {
    // Get the bill
    let billQuery = `
      SELECT 
        b.*,
        b.paid_amount as amount_paid,
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bills b
      LEFT JOIN vendors v ON b.vendor_id = v.id
      LEFT JOIN accounts a ON b.ap_account_id = a.id
      WHERE b.id = $1 AND b.is_deleted = false
    `;

    // Add user_id filter if provided (for proper data isolation)
    if (userId) {
      billQuery = billQuery.replace(
        "WHERE b.id = $1",
        "WHERE b.id = $1 AND b.user_id = $2"
      );
    }

    const queryParams: (number | string)[] = [id];
    if (userId) queryParams.push(userId);

    const billResult = await sql.query(billQuery, queryParams);

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
        LEFT JOIN accounts a ON bl.account_id = a.id
        WHERE bl.bill_id = $1
        ORDER BY bl.id
      `;

      const linesResult = await sql.query(linesQuery, [id]);
      console.log("Bill lines raw result:", linesResult.rows);

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

    console.log("Bill object with lines:", bill);
    return bill;
  } catch (error) {
    console.error("Error getting bill:", error);
    throw error;
  }
}

/**
 * Create a new bill with its line items
 */
export async function createBill(
  bill: Bill,
  lines: BillLine[],
  userId?: string
): Promise<Bill> {
  // Start a transaction
  await sql.query("BEGIN");

  try {
    // Insert the bill
    const billQuery = `
      INSERT INTO bills (
        vendor_id,
        bill_number,
        bill_date,
        due_date,
        total_amount,
        paid_amount,
        status,
        payment_terms,
        description,
        ap_account_id,
        user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;

    // Calculate total from line items
    const totalAmount = lines.reduce(
      (sum, line) => sum + parseFloat(line.line_total),
      0
    );

    // Determine the bill status - use the provided status or default to 'Open'
    // This ensures we use the same status value for both the bill and journal entry
    const billStatus = bill.status || "Open";
    console.log(`[Bill Create] Creating bill with status: ${billStatus}`);

    // Determine journal type - use AI-generated type or fallback to 'AP'
    const journalType = bill.journal_type || "AP";
    console.log(`[Bill Create] Using journal type: ${journalType}`);

    // For credit card transactions that are already paid, we need to set amount_paid correctly
    // If the bill status is 'Paid', set amount_paid to the total amount
    // Otherwise, use the provided amount_paid or default to 0
    const amountPaid =
      billStatus === "Paid" ? totalAmount : bill.paid_amount || 0;
    console.log(
      `[Bill Create] Setting amount_paid to ${amountPaid} for bill with status: ${billStatus}`
    );

    const billResult = await sql.query(billQuery, [
      bill.vendor_id,
      bill.bill_number || null,
      bill.bill_date,
      bill.due_date,
      totalAmount,
      amountPaid, // Use the calculated amount_paid value
      billStatus, // Use the determined status
      bill.payment_terms || null,
      bill.description || null,
      bill.ap_account_id,
      userId || null, // Include user_id for proper data isolation
    ]);

    const newBill = billResult.rows[0];

    // Insert the bill lines
    for (const line of lines) {
      const lineQuery = `
        INSERT INTO bill_lines (
          bill_id,
          account_id,
          description,
          quantity,
          unit_price,
          line_total,
          category,
          location,
          funder,
          user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await sql.query(lineQuery, [
        newBill.id,
        line.account_id,
        line.description || null,
        line.quantity,
        line.unit_price,
        line.line_total,
        line.category || null,
        line.location || null,
        line.funder || null,
        userId || null, // Include user_id for proper data isolation
      ]);
    }

    // Only create a journal entry if the bill status is Open
    if (billStatus === "Open") {
      try {
        console.log(
          `[Bill Create] Creating journal entry for new bill ${newBill.id} with Open status`
        );

        // Check if journals table has transaction_date or date column
        const schemaCheck = await sql.query(`
          SELECT 
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_lines' AND column_name = 'line_number') as has_line_number
        `);

        const schema = schemaCheck.rows[0];
        const dateColumnName = schema.has_transaction_date
          ? "transaction_date"
          : "journal_date"; // Use journal_date as fallback instead of "date"
        const hasLineNumber = schema.has_line_number;

        // Create journal entry header
        const journalInsertQuery = `
          INSERT INTO journals (
            ${dateColumnName}, description, journal_type, is_posted, created_by, source, user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `;

        const billNumber = newBill.bill_number || `Bill #${newBill.id}`;
        const memo = bill.user_receipt_context 
          ? bill.user_receipt_context 
          : `${billNumber} - ${newBill.vendor_id}`;

        const journalResult = await sql.query(journalInsertQuery, [
          bill.bill_date,
          memo,
          journalType, // Use the determined journal type
          true, // is_posted = true for Open bills
          "system", // created_by
          "bill_create", // source
          userId, // user_id for proper data isolation
        ]);

        const journalId = journalResult.rows[0].id;
        console.log(
          `[Bill Create] Created journal header with ID: ${journalId}`
        );

        // Set the journal_id on the bill object for return
        newBill.journal_id = journalId;

        // Get AP account name for better description
        const apAccountResult = await sql.query(
          `SELECT name FROM accounts WHERE id = $1`,
          [bill.ap_account_id]
        );
        const apAccountName =
          apAccountResult.rows[0]?.name || "Accounts Payable";

        // Create the AP journal line (credit to AP account)
        if (hasLineNumber) {
          await sql.query(
            `
            INSERT INTO journal_lines (journal_id, line_number, account_id, description, debit_amount, credit_amount, user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
            [
              journalId,
              1,
              bill.ap_account_id,
              `AP - ${apAccountName}`,
              0,
              totalAmount,
              userId,
            ]
          );
        } else {
          await sql.query(
            `
            INSERT INTO journal_lines (journal_id, account_id, description, debit_amount, credit_amount, user_id)
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
            [
              journalId,
              bill.ap_account_id,
              `AP - ${apAccountName}`,
              0,
              totalAmount,
              userId,
            ]
          );
        }

        console.log(`[Bill Create] Created AP journal line (credit)`);

        // Insert debit entries for each expense account
        let lineNumber = 2;

        for (const line of lines) {
          const accountId = line.account_id;
          const amount = parseFloat(line.line_total);

          // Get expense account name
          const expenseAccountResult = await sql.query(
            `SELECT name FROM accounts WHERE id = $1`,
            [accountId]
          );
          const expenseAccountName =
            expenseAccountResult.rows[0]?.name || "Expense";

          // Create expense journal line
          if (hasLineNumber) {
            await sql.query(
              `
              INSERT INTO journal_lines (journal_id, line_number, account_id, description, debit_amount, credit_amount, user_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
              [
                journalId,
                lineNumber++,
                accountId,
                `${expenseAccountName} - ${line.description || "Expense"}`,
                amount,
                0,
                userId,
              ]
            );
          } else {
            await sql.query(
              `
              INSERT INTO journal_lines (journal_id, account_id, description, debit_amount, credit_amount, user_id)
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
              [
                journalId,
                accountId,
                `${expenseAccountName} - ${line.description || "Expense"}`,
                amount,
                0,
                userId,
              ]
            );
          }
        }

        console.log(`[Bill Create] Created expense journal lines (debits)`);

        // Link the journal to the bill if journal_id column exists in bills table
        try {
          const columnCheck = await sql.query(`
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'bills' AND column_name = 'journal_id'
            ) as has_journal_id
          `);

          if (columnCheck.rows[0].has_journal_id) {
            await sql.query(`UPDATE bills SET journal_id = $1 WHERE id = $2`, [
              journalId,
              newBill.id,
            ]);
            console.log(
              `[Bill Create] Linked journal ${journalId} to bill ${newBill.id}`
            );
          }
        } catch (linkErr) {
          console.error(
            `[Bill Create] Error linking journal to bill:`,
            linkErr
          );
          // Continue without linking - the journal is still created successfully
        }
      } catch (journalError) {
        console.error(
          `[Bill Create] Error creating journal entry for bill ${newBill.id}:`,
          journalError
        );
        // Continue without creating journal - the bill was created successfully
      }
    } else {
      console.log(
        `[Bill Create] Bill ${newBill.id} created with ${billStatus} status, no journal entry needed`
      );
    }

    // Commit the transaction
    await sql.query("COMMIT");

    return newBill;
  } catch (error) {
    // Rollback in case of error
    await sql.query("ROLLBACK");
    throw error;
  }
}

/**
 * Update an existing bill
 */
export async function updateBill(
  id: number,
  bill: Partial<Bill>,
  lines?: BillLine[],
  userId?: string
): Promise<Bill | null> {
  // Start a transaction
  await sql.query("BEGIN");

  try {
    // Get the current bill to check status
    const currentBillQuery = `
      SELECT *, paid_amount as amount_paid FROM bills WHERE id = $1 AND is_deleted = false
    `;

    const currentBillResult = await sql.query(currentBillQuery, [id]);

    if (currentBillResult.rows.length === 0) {
      await sql.query("ROLLBACK");
      return null;
    }

    const currentBill = currentBillResult.rows[0];

    // Don't allow updates to fully paid bills
    if (currentBill.status === "Paid") {
      throw new Error("Cannot update a paid bill");
    }

    // Build the update query dynamically
    let setClause = "";
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

    if (bill.payment_terms !== undefined) {
      setClause += `payment_terms = $${paramIndex++}, `;
      values.push(bill.payment_terms || null);
    }

    if (bill.description !== undefined) {
      setClause += `description = $${paramIndex++}, `;
      values.push(bill.description || null);
    }

    if (bill.ap_account_id !== undefined) {
      setClause += `ap_account_id = $${paramIndex++}, `;
      values.push(bill.ap_account_id);
    }

    if (bill.status !== undefined) {
      setClause += `status = $${paramIndex++}, `;
      values.push(bill.status);
      console.log(`[updateBill] Updating status to: ${bill.status}`);
    }

    // Update line items if provided
    if (lines && lines.length > 0) {
      // Calculate new total amount from line items
      const totalAmount = lines.reduce(
        (sum, line) => sum + parseFloat(line.line_total),
        0
      );

      setClause += `total_amount = $${paramIndex++}, `;
      values.push(totalAmount);

      // Delete existing line items
      await sql.query(`DELETE FROM bill_lines WHERE bill_id = $1`, [id]);

      // Insert new line items
      for (const line of lines) {
        const lineQuery = `
          INSERT INTO bill_lines (
            bill_id,
            account_id,
            description,
            quantity,
            unit_price,
            line_total,
            category,
            location,
            funder,
            user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `;

        await sql.query(lineQuery, [
          id,
          line.account_id,
          line.description || null,
          line.quantity,
          line.unit_price,
          line.line_total,
          line.category || null,
          line.location || null,
          line.funder || null,
          userId || null, // Include user_id for proper data isolation
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
    await sql.query("COMMIT");

    // Return the updated bill
    return getBill(id);
  } catch (error) {
    // Rollback in case of error
    await sql.query("ROLLBACK");
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
      SELECT *, paid_amount as amount_paid FROM bills WHERE id = $1 AND is_deleted = false
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
    console.error("Error deleting bill:", error);
    throw error;
  }
}

/**
 * Create a bill payment
 */
export async function createBillPayment(
  payment: BillPayment,
  userId?: string
): Promise<BillPayment> {
  // Ensure we have a userId for proper data isolation
  if (!userId) {
    console.warn(
      "[createBillPayment] No userId provided, data isolation may be compromised"
    );
  }
  // Start a transaction
  await sql.query("BEGIN");

  try {
    // Get the bill to check status and remaining amount
    const billQuery = `
      SELECT *, paid_amount as amount_paid FROM bills WHERE id = $1 AND is_deleted = false
    `;

    const billResult = await sql.query(billQuery, [payment.bill_id]);

    if (billResult.rows.length === 0) {
      throw new Error(`Bill with ID ${payment.bill_id} not found`);
    }

    const bill = billResult.rows[0];
    const remainingAmount = bill.total_amount - bill.paid_amount;

    if (payment.amount_paid > remainingAmount) {
      throw new Error(
        `Payment amount ${payment.amount_paid} exceeds remaining bill amount ${remainingAmount}`
      );
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
        journal_id,
        user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *, amount_paid as paid_amount
    `;

    const paymentResult = await sql.query(paymentQuery, [
      payment.bill_id,
      payment.payment_date,
      payment.amount_paid,
      payment.payment_account_id,
      payment.payment_method || null,
      payment.reference_number || null,
      payment.journal_id || null,
      userId || null, // Include user_id for proper data isolation
    ]);

    const newPayment = paymentResult.rows[0];

    // Update the bill's paid_amount and status
    // Ensure both values are converted to numbers to avoid string concatenation
    const currentAmountPaid =
      typeof bill.paid_amount === "string"
        ? parseFloat(bill.paid_amount)
        : Number(bill.paid_amount) || 0;
    const paymentAmount =
      typeof payment.amount_paid === "number"
        ? payment.amount_paid
        : parseFloat(String(payment.amount_paid)) || 0;
    const totalAmount =
      typeof bill.total_amount === "string"
        ? parseFloat(bill.total_amount)
        : Number(bill.total_amount) || 0;

    // Round to 2 decimal places to avoid floating point issues
    const newAmountPaid =
      Math.round((currentAmountPaid + paymentAmount) * 100) / 100;
    let newStatus = bill.status;

    console.log(
      `Updating bill payment: Current: ${currentAmountPaid}, Payment: ${paymentAmount}, New Total: ${newAmountPaid}, Bill Total: ${totalAmount}`
    );

    if (
      newAmountPaid >= totalAmount ||
      Math.abs(newAmountPaid - totalAmount) < 0.01
    ) {
      newStatus = "Paid";
    } else if (newAmountPaid > 0) {
      newStatus = "Partially Paid";
    }

    // Convert amount to string for PostgreSQL
    await sql.query(
      `
      UPDATE bills
      SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `,
      [newAmountPaid.toString(), newStatus, payment.bill_id]
    );

    // Commit the transaction
    await sql.query("COMMIT");

    return newPayment;
  } catch (error) {
    // Rollback in case of error
    await sql.query("ROLLBACK");
    throw error;
  }
}

/**
 * Delete a bill payment
 */
/**
 * Create a bill refund
 */
export async function createBillRefund(
  refund: BillRefund,
  userId?: string
): Promise<BillRefund> {
  // Ensure we have a userId for proper data isolation
  if (!userId) {
    console.warn(
      "[createBillRefund] No userId provided, data isolation may be compromised"
    );
  }

  try {
    // Insert the refund
    const refundQuery = `
      INSERT INTO bill_refunds (
        bill_id,
        refund_date,
        amount,
        refund_account_id,
        refund_method,
        reference_number,
        journal_id,
        reason,
        user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const refundResult = await sql.query(refundQuery, [
      refund.bill_id,
      refund.refund_date,
      refund.amount,
      refund.refund_account_id,
      refund.refund_method || null,
      refund.reference_number || null,
      refund.journal_id || null,
      refund.reason || "Vendor refund",
      userId || null, // Include user_id for proper data isolation
    ]);

    return refundResult.rows[0] as BillRefund;
  } catch (error) {
    console.error("Error creating bill refund:", error);
    throw error;
  }
}

/**
 * Delete a bill refund
 */
export async function deleteBillRefund(
  id: number,
  userId?: string
): Promise<boolean> {
  // Ensure we have a userId for proper data isolation
  if (!userId) {
    console.warn(
      "[deleteBillRefund] No userId provided, data isolation may be compromised"
    );
  }

  try {
    // Get the refund details first
    const refundQuery = `
      SELECT * FROM bill_refunds WHERE id = $1 ${
        userId ? "AND user_id = $2" : ""
      }
    `;

    const refundResult = await sql.query(
      refundQuery,
      userId ? [id, userId] : [id]
    );

    if (refundResult.rows.length === 0) {
      return false;
    }

    const refund = refundResult.rows[0];

    // Delete the refund
    const deleteQuery = `
      DELETE FROM bill_refunds WHERE id = $1 ${userId ? "AND user_id = $2" : ""}
    `;

    const result = await sql.query(deleteQuery, userId ? [id, userId] : [id]);

    // If the refund has a journal ID, delete the journal entry as well
    if (refund.journal_id) {
      await sql.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [
        refund.journal_id,
      ]);
      await sql.query(`DELETE FROM journals WHERE id = $1`, [
        refund.journal_id,
      ]);
    }

    return result.rowCount !== null && result.rowCount > 0;
  } catch (error) {
    console.error("Error deleting bill refund:", error);
    throw error;
  }
}

/**
 * Delete a bill payment
 */
export async function deleteBillPayment(id: number): Promise<boolean> {
  // Start a transaction
  await sql.query("BEGIN");

  try {
    // Get the payment info
    const paymentQuery = `
      SELECT * FROM bill_payments WHERE id = $1
    `;

    const paymentResult = await sql.query(paymentQuery, [id]);

    if (paymentResult.rows.length === 0) {
      await sql.query("ROLLBACK");
      return false;
    }

    const payment = paymentResult.rows[0];

    // Get the bill
    const billQuery = `
      SELECT *, paid_amount as amount_paid FROM bills WHERE id = $1
    `;

    const billResult = await sql.query(billQuery, [payment.bill_id]);

    if (billResult.rows.length === 0) {
      await sql.query("ROLLBACK");
      return false;
    }

    const bill = billResult.rows[0];

    // Calculate new amount paid
    // Ensure both values are parsed as numbers to avoid string concatenation
    const currentAmountPaid = parseFloat(bill.paid_amount) || 0;
    const paymentAmount = parseFloat(payment.amount_paid) || 0;

    // Round to 2 decimal places to avoid floating point issues
    const newAmountPaid =
      Math.round((currentAmountPaid - paymentAmount) * 100) / 100;

    let newStatus = bill.status;

    if (newAmountPaid <= 0) {
      newStatus = "Open";
    } else if (newAmountPaid < bill.total_amount) {
      newStatus = "Partially Paid";
    }

    // Update the bill
    await sql.query(
      `
      UPDATE bills
      SET paid_amount = $1, status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
    `,
      [newAmountPaid.toString(), newStatus, payment.bill_id]
    );

    // Delete associated journal entry if it exists
    if (payment.journal_id) {
      await sql.query(
        `
        DELETE FROM journal_lines WHERE journal_id = $1
      `,
        [payment.journal_id]
      );

      await sql.query(
        `
        DELETE FROM journals WHERE id = $1
      `,
        [payment.journal_id]
      );
    }

    // Delete the payment
    await sql.query(
      `
      DELETE FROM bill_payments WHERE id = $1
    `,
      [id]
    );

    // Commit the transaction
    await sql.query("COMMIT");

    return true;
  } catch (error) {
    // Rollback in case of error
    await sql.query("ROLLBACK");
    throw error;
  }
}

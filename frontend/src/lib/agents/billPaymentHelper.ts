import { sql } from '@vercel/postgres';
import { createBillPayment, getBill } from '@/lib/accounting/billQueries';
import { BillPayment } from '@/lib/accounting/accountingTypes';
import { createJournal, Journal, JournalLine } from '@/lib/accounting/journalQueries';
import { getAccounts } from '@/lib/accounting/accountQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

/**
 * Interface for bill payment request
 */
export interface BillPaymentRequest {
  bill_id: number;
  payment_date: string;
  amount_paid: number;
  payment_account_id: number;
  payment_method?: string;
  reference_number?: string;
}

/**
 * Interface for bulk bill payment result
 */
export interface BulkPaymentResult {
  success: boolean;
  message: string;
  payments: {
    bill_id: number;
    bill_number: string;
    vendor_name: string;
    amount_paid: number;
    status: 'success' | 'failed';
    error?: string;
  }[];
  totalPaid: number;
  successCount: number;
  failureCount: number;
}

/**
 * Process a payment for a single bill
 */
export async function processBillPayment(
  billId: number,
  paymentAccountId: number,
  paymentDate: string,
  paymentMethod: string = 'ACH/Wire',
  referenceNumber?: string,
  userId?: string
): Promise<{ success: boolean; message: string; payment?: any; error?: any }> {
  try {
    // Validate inputs
    if (!billId || !paymentAccountId) {
      return { 
        success: false, 
        message: 'Bill ID and payment account ID are required' 
      };
    }

    // Get the bill details
    const bill = await getBill(billId, true, true, userId);
    if (!bill) {
      return { 
        success: false, 
        message: `Bill with ID ${billId} not found or you don't have permission to access it` 
      };
    }

    // Check if bill is already fully paid
    if ((bill.amount_paid || 0) >= (bill.total_amount || 0)) {
      return { 
        success: false, 
        message: `Bill ${bill.bill_number || billId} is already fully paid` 
      };
    }

    // Calculate payment amount (remaining amount)
    const remainingAmount = (bill.total_amount || 0) - (bill.amount_paid || 0);
    const amountPaid = Math.round(remainingAmount * 100) / 100; // Round to 2 decimal places

    // Journal entry description
    // The bill might not have vendor_name if it's not a BillWithVendor type
    // Use a default value if vendor_name is not available
    const vendorName = (bill as any).vendor_name || 'vendor';
    const journalMemo = `Payment for Bill ${bill.bill_number || bill.id} to ${vendorName}`;
    const debitDescription = `Payment to ${vendorName} for bill #${bill.bill_number || bill.id}`;
    const creditDescription = referenceNumber ? 
      `Ref: ${referenceNumber}` : 
      `Payment for Bill ${bill.bill_number || bill.id}`;

    // Create journal entry
    let journalId: number;
    try {
      // Use a client from the pool for transaction
      const client = await sql.connect();
      
      try {
        // Start transaction
        await client.query('BEGIN');
        
        // Check which date column exists in the journals table
        const schemaCheck = await client.query(`
          SELECT 
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
        `);
        
        const schema = schemaCheck.rows[0];
        
        // Use the appropriate date column based on schema
        let dateColumnName = schema.has_transaction_date ? 'transaction_date' : 'date';
        
        // Insert journal header with dynamic column name
        const journalResult = await client.query(
          `INSERT INTO journals 
            (${dateColumnName}, memo, source, journal_type, is_posted, created_by, user_id) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7) 
          RETURNING id`,
          [paymentDate, journalMemo, 'AP', 'BP', true, userId, userId]
        );
        
        journalId = journalResult.rows[0].id;
        console.log(`[BillPayment] Created journal header with ID: ${journalId}`);
        
        // Check if journal_lines table has line_number column
        const lineNumberCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'journal_lines' AND column_name = 'line_number'
          ) as has_line_number
        `);
        
        const hasLineNumber = lineNumberCheck.rows[0].has_line_number;
        
        // Insert both journal lines at once to avoid trigger validation issues
        let query, lineValues;
        
        if (hasLineNumber) {
          // If line_number column exists, use it
          lineValues = [
            journalId, 1, bill.ap_account_id, debitDescription, amountPaid, 0, null, null, null, null, userId,
            journalId, 2, paymentAccountId, creditDescription, 0, amountPaid, null, null, null, null, userId
          ];
          
          query = `
            INSERT INTO journal_lines 
              (journal_id, line_number, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11),
              ($12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `;
        } else {
          // If line_number column doesn't exist, omit it
          lineValues = [
            journalId, bill.ap_account_id, debitDescription, amountPaid, 0, null, null, null, null, userId,
            journalId, paymentAccountId, creditDescription, 0, amountPaid, null, null, null, null, userId
          ];
          
          query = `
            INSERT INTO journal_lines 
              (journal_id, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10),
              ($11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          `;
        }
        
        // Insert both lines using a single query with multiple value sets
        await client.query(query, lineValues);
        console.log(`[BillPayment] Added journal lines to journal ID: ${journalId}`);
        
        // Commit the transaction
        await client.query('COMMIT');
        console.log(`[BillPayment] Successfully committed journal transaction for journal ID: ${journalId}`);
      } catch (err) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('[BillPayment] Error in journal creation transaction, rolled back:', err);
        throw err;
      } finally {
        // Release the client back to the pool
        client.release();
      }
    } catch (err) {
      console.error('[BillPayment] Error creating journal for bill payment:', err);
      return { 
        success: false, 
        message: `Failed to create journal entry: ${err instanceof Error ? err.message : 'Unknown error'}`,
        error: err
      };
    }
    
    // Verify journal was created
    if (!journalId) {
      console.error('[BillPayment] Journal ID is undefined after journal creation');
      return {
        success: false,
        message: 'Failed to create journal entry: Journal ID is undefined'
      };
    }

    // Create the bill payment
    const paymentData: BillPayment = {
      bill_id: billId,
      payment_date: paymentDate,
      amount_paid: amountPaid,
      payment_account_id: paymentAccountId,
      payment_method: paymentMethod,
      reference_number: referenceNumber,
      journal_id: journalId
    };
    
    // Create the bill payment with proper error handling
    let newPayment;
    try {
      console.log(`[BillPayment] Creating bill payment with journal ID: ${journalId}`);
      newPayment = await createBillPayment(paymentData, userId);
      
      // Verify the payment was created and has the correct journal ID
      if (!newPayment || !newPayment.id) {
        console.error('[BillPayment] Payment creation failed or returned invalid data');
        return {
          success: false,
          message: 'Failed to record payment: Payment creation returned invalid data'
        };
      }
      
      // Verify the journal ID was properly associated
      if (newPayment.journal_id !== journalId) {
        console.error(`[BillPayment] Journal ID mismatch: Expected ${journalId}, got ${newPayment.journal_id}`);
        // Don't fail the operation, but log the issue
        console.warn('[BillPayment] Continuing despite journal ID mismatch');
      } else {
        console.log(`[BillPayment] Successfully associated journal ID ${journalId} with payment ID ${newPayment.id}`);
      }
    } catch (error) {
      console.error('[BillPayment] Error creating bill payment:', error);
      return {
        success: false,
        message: `Failed to record payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      };
    }
    
    // Audit Log for Bill Payment Creation
    if (userId && newPayment && typeof newPayment.id !== 'undefined') {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_PAYMENT_CREATED',
        entity_type: 'BillPayment',
        entity_id: newPayment.id,
        changes_made: [
          { field: 'bill_id', old_value: null, new_value: newPayment.bill_id },
          { field: 'payment_date', old_value: null, new_value: newPayment.payment_date },
          { field: 'amount_paid', old_value: null, new_value: newPayment.amount_paid },
          { field: 'payment_account_id', old_value: null, new_value: newPayment.payment_account_id },
          { field: 'journal_id', old_value: null, new_value: newPayment.journal_id },
        ],
        status: 'SUCCESS',
        context: { 
          related_bill_id: bill.id,
          related_bill_number: bill.bill_number 
        }
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (BILL_PAYMENT_CREATED):", auditError);
      }
    }

    return {
      success: true,
      message: `Successfully recorded payment of ${amountPaid} for bill ${bill.bill_number || billId}`,
      payment: newPayment
    };
  } catch (error) {
    console.error('Error processing bill payment:', error);
    return {
      success: false,
      message: `Failed to process payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
      error
    };
  }
}

/**
 * Process payments for multiple bills
 */
export async function processBulkBillPayments(
  billIds: number[],
  paymentAccountId: number,
  paymentDate: string,
  paymentMethod: string = 'ACH/Wire',
  referenceNumber?: string,
  userId?: string
): Promise<BulkPaymentResult> {
  const result: BulkPaymentResult = {
    success: false,
    message: '',
    payments: [],
    totalPaid: 0,
    successCount: 0,
    failureCount: 0
  };

  if (!billIds || billIds.length === 0) {
    result.message = 'No bills specified for payment';
    return result;
  }

  if (!paymentAccountId) {
    result.message = 'Payment account ID is required';
    return result;
  }

  // Process each bill payment
  for (const billId of billIds) {
    const paymentResult = await processBillPayment(
      billId,
      paymentAccountId,
      paymentDate,
      paymentMethod,
      referenceNumber,
      userId
    );

    if (paymentResult.success) {
      // Get bill details for the response
      const bill = await getBill(billId, false, false, userId);
      
      result.payments.push({
        bill_id: billId,
        bill_number: bill?.bill_number || `Bill #${billId}`,
        vendor_name: (bill as any)?.vendor_name || 'Unknown Vendor',
        amount_paid: paymentResult.payment?.amount_paid || 0,
        status: 'success'
      });

      result.totalPaid += paymentResult.payment?.amount_paid || 0;
      result.successCount++;
    } else {
      // Get bill details for the response
      const bill = await getBill(billId, false, false, userId);
      
      result.payments.push({
        bill_id: billId,
        bill_number: bill?.bill_number || `Bill #${billId}`,
        vendor_name: (bill as any)?.vendor_name || 'Unknown Vendor',
        amount_paid: 0,
        status: 'failed',
        error: paymentResult.message
      });

      result.failureCount++;
    }
  }

  // Set overall success based on whether any payments succeeded
  result.success = result.successCount > 0;
  
  // Create summary message
  if (result.successCount > 0 && result.failureCount === 0) {
    result.message = `Successfully recorded payments for all ${result.successCount} bills, totaling ${result.totalPaid}`;
  } else if (result.successCount > 0 && result.failureCount > 0) {
    result.message = `Recorded payments for ${result.successCount} bills, totaling ${result.totalPaid}. Failed to process ${result.failureCount} bills.`;
  } else {
    result.message = `Failed to process any payments. Please check the error details.`;
  }

  return result;
}

/**
 * Find an account by name or description
 */
export async function findPaymentAccount(accountName: string): Promise<number | null> {
  try {
    // Get all accounts
    const accounts = await getAccounts();
    
    // Normalize the search term
    const searchTerm = accountName.toLowerCase();
    
    // Look for accounts with matching name or description
    // Prioritize checking/operating accounts
    const matchingAccount = accounts.find(account => {
      const name = account.name.toLowerCase();
      const code = account.code.toLowerCase();
      const isOperatingOrChecking = 
        name.includes('operating') || 
        name.includes('checking') || 
        name.includes('bank') ||
        code.includes('1000') || // Common code for checking accounts
        code.includes('1010'); // Common code for operating accounts
        
      // If the search term specifically mentions operating or checking, prioritize those
      if (searchTerm.includes('operating') || searchTerm.includes('checking')) {
        return isOperatingOrChecking && (
          name.includes(searchTerm) || 
          code.includes(searchTerm)
        );
      }
      
      // Otherwise, look for any matching account
      return name.includes(searchTerm) || code.includes(searchTerm);
    });
    
    // If no match found but "operating" or "checking" was mentioned, find the default operating account
    if (!matchingAccount && (
      searchTerm.includes('operating') || 
      searchTerm.includes('checking') || 
      searchTerm.includes('bank') ||
      searchTerm.includes('cash')
    )) {
      const defaultOperating = accounts.find(account => {
        const name = account.name.toLowerCase();
        const code = account.code.toLowerCase();
        return (
          name.includes('operating') || 
          name.includes('checking') || 
          code.includes('1000') || 
          code.includes('1010')
        );
      });
      
      if (defaultOperating) {
        return defaultOperating.id;
      }
    }
    
    // Return the matching account ID or null if not found
    return matchingAccount ? matchingAccount.id : null;
  } catch (error) {
    console.error('Error finding payment account:', error);
    return null;
  }
}

/**
 * Get all unpaid bills
 */
export async function getUnpaidBills(userId?: string): Promise<any[]> {
  try {
    // Query to get all unpaid or partially paid bills
    const query = `
      SELECT 
        b.id, 
        b.bill_number, 
        b.bill_date, 
        b.due_date, 
        b.total_amount, 
        b.amount_paid, 
        b.status,
        v.name as vendor_name
      FROM 
        bills b
      JOIN
        vendors v ON b.vendor_id = v.id
      WHERE 
        b.is_deleted = false 
        AND b.status IN ('Open', 'Partially Paid', 'Overdue')
        ${userId ? 'AND b.user_id = $1' : ''}
      ORDER BY 
        b.due_date ASC
    `;
    
    const params = userId ? [userId] : [];
    const result = await sql.query(query, params);
    
    return result.rows;
  } catch (error) {
    console.error('Error getting unpaid bills:', error);
    return [];
  }
}

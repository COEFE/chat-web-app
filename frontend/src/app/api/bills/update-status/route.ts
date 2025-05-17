import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { logAuditEvent } from '@/lib/auditLogger';
import { createBillPayment } from '@/lib/accounting/billQueries';

interface BillUpdateResult {
  id: number;
  bill_number: string;
  status: string;
}

// We're now using the /api/accounts/default-payment-account endpoint instead of this function

export async function POST(request: Request) {
  try {
    // Verify user is authenticated
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      console.log('[Bills API] Authentication failed');
      return error;
    }
    
    console.log('[Bills API] Authenticated user:', userId);

    const { billIds: rawBillIds, newStatus } = await request.json();
    
    // Convert bill IDs to integers to ensure correct typing for PostgreSQL
    let billIds: number[] = [];
    
    if (rawBillIds && Array.isArray(rawBillIds)) {
      // Ensure all IDs are valid integers
      billIds = rawBillIds
        .map(id => parseInt(id, 10))
        .filter(id => !isNaN(id));
      
      console.log(`[Bills API] Converted bill IDs to integers:`, billIds);
    }

    // Validate input
    if (billIds.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No valid bill IDs provided' },
        { status: 400 }
      );
    }

    if (!newStatus || typeof newStatus !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Invalid status provided' },
        { status: 400 }
      );
    }

    // Validate status is one of the allowed values
    const validStatuses = ['draft', 'open', 'paid', 'void', 'overdue'];
    if (!validStatuses.includes(newStatus.toLowerCase())) {
      return NextResponse.json(
        { success: false, message: `Status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`[Bills API] Updating ${billIds.length} bills to status: ${newStatus}`);

    // Create a prepared statement with parameters
    console.log(`[Bills API] Updating bills with IDs: ${billIds.join(', ')} to status: ${newStatus}`);
    
    // Create a parameterized query for safety
    const placeholders = billIds.map((_, idx) => `$${idx + 2}`).join(',');
    const query = `
      UPDATE bills
      SET status = $1,
          updated_at = NOW()
      WHERE id IN (${placeholders})
      RETURNING id, bill_number, status
    `;
    
    // Execute the query with parameters
    console.log(`[Bills API] Executing SQL query with parameters: status=${newStatus.toLowerCase()}, billIds=${billIds.join(', ')}`);
    
    let updatedBills: BillUpdateResult[] = [];
    
    try {
      const result = await sql.query(query, [newStatus.toLowerCase(), ...billIds]);
      updatedBills = result.rows;
      console.log(`[Bills API] SQL query executed successfully, updated ${result.rowCount} rows`);
    } catch (sqlError: any) {
      console.error(`[Bills API] SQL error in bill status update:`, sqlError);
      return NextResponse.json(
        { success: false, message: `Database error: ${sqlError.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
    
    // If updating to Open status, create journal entries
    if (newStatus.toLowerCase() === 'open') {
      console.log(`[Bills API] Creating journal entries for ${billIds.length} bills`);
      
      // For each bill, create a journal entry
      for (const billId of billIds) {
        try {
          // Call the bill update API to create journal entries
          // Use absolute URL with proper protocol
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:3000`;
          console.log(`[Bills API] Using base URL for journal entry creation: ${baseUrl}`);
          
          const response = await fetch(`${baseUrl}/api/bills/${billId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer internal-api-call' // Special header for internal API calls
            },
            body: JSON.stringify({
              bill: { status: 'Open' }
            })
          });
          
          if (!response.ok) {
            console.warn(`[Bills API] Failed to create journal entry for bill ${billId}: ${response.status}`);
          } else {
            console.log(`[Bills API] Created journal entry for bill ${billId}`);
          }
        } catch (err) {
          console.error(`[Bills API] Error creating journal entry for bill ${billId}:`, err);
        }
      }
    }
    
    // If updating to Paid status, create payment records
    if (newStatus.toLowerCase() === 'paid') {
      console.log(`[Bills API] Creating payment records for ${billIds.length} bills`);
      
      // Find a suitable payment account (bank or cash account)
      let paymentAccount;
      try {
        // First try to find a bank account
        const bankAccountQuery = `
          SELECT id, name, account_type
          FROM accounts
          WHERE account_type = 'bank'
          AND user_id = $1
          AND is_deleted = false
          LIMIT 1
        `;
        
        const bankResult = await sql.query(bankAccountQuery, [userId]);
        
        if (bankResult.rows.length > 0) {
          paymentAccount = bankResult.rows[0];
          console.log(`[Bills API] Using bank account: ${paymentAccount.name} (${paymentAccount.id})`);
        } else {
          // If no bank account, try to find a cash account
          const cashAccountQuery = `
            SELECT id, name, account_type
            FROM accounts
            WHERE account_type = 'cash'
            AND user_id = $1
            AND is_deleted = false
            LIMIT 1
          `;
          
          const cashResult = await sql.query(cashAccountQuery, [userId]);
          
          if (cashResult.rows.length > 0) {
            paymentAccount = cashResult.rows[0];
            console.log(`[Bills API] Using cash account: ${paymentAccount.name} (${paymentAccount.id})`);
          } else {
            // Create a default bank account
            console.log(`[Bills API] No payment account found, creating a default bank account`);
            
            // Start a transaction
            await sql.query('BEGIN');
            
            try {
              // Create a bank account
              const createBankQuery = `
                INSERT INTO accounts (
                  code, name, account_type, is_custom, user_id
                ) VALUES (
                  '1100', 'Bank Account', 'bank', true, $1
                ) RETURNING id, name, account_type
              `;
              
              const bankCreateResult = await sql.query(createBankQuery, [userId]);
              paymentAccount = bankCreateResult.rows[0];
              
              // Commit the transaction
              await sql.query('COMMIT');
              
              console.log(`[Bills API] Created new bank account: ${paymentAccount.name} (${paymentAccount.id})`);
            } catch (txError) {
              // Rollback the transaction on error
              await sql.query('ROLLBACK');
              throw txError;
            }
          }
        }
      } catch (accountError) {
        console.error(`[Bills API] Error finding or creating payment account:`, accountError);
        return NextResponse.json(
          { success: false, message: 'Error finding or creating a payment account.' },
          { status: 500 }
        );
      }
      
      // Get bill details for each bill
      const billDetailsQuery = `
        SELECT id, total_amount, amount_paid
        FROM bills
        WHERE id IN (${placeholders})
      `;
      
      // Rebuild placeholders for the new query with proper parameters
      const detailsPlaceholders = billIds.map((_, idx) => `$${idx + 1}`).join(',');
      const detailsQuery = `
        SELECT id, total_amount, amount_paid
        FROM bills
        WHERE id IN (${detailsPlaceholders})
      `;
      
      console.log(`[Bills API] Executing bill details query with IDs:`, billIds);
      const billDetailsResult = await sql.query(detailsQuery, billIds);
      const billDetails = billDetailsResult.rows;
      
      // For each bill, create a payment record
      for (const bill of billDetails) {
        try {
          // Calculate remaining amount to pay
          const remainingAmount = bill.total_amount - (bill.amount_paid || 0);
          
          if (remainingAmount <= 0) {
            console.log(`[Bills API] Bill ${bill.id} is already fully paid, skipping payment creation`);
            continue;
          }
          
          // Create payment record
          const paymentData = {
            bill_id: bill.id,
            payment_date: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
            amount_paid: remainingAmount,
            payment_account_id: paymentAccount.id,
            payment_method: 'Bank Transfer',
            reference_number: `AUTO-PAY-${Date.now()}`
          };
          
          // Get the bill details including AP account for journal entry creation
          const billDetailsQuery = `
            SELECT b.*, v.name as vendor_name
            FROM bills b
            LEFT JOIN vendors v ON b.vendor_id = v.id
            WHERE b.id = $1 AND b.user_id = $2
          `;
          
          const billDetailResult = await sql.query(billDetailsQuery, [bill.id, userId]);
          if (billDetailResult.rows.length === 0) {
            console.warn(`[Bills API] Could not find detailed bill info for bill ${bill.id}`);
            continue;
          }
          
          const billDetail = billDetailResult.rows[0];
          
          // Call the bill payment API to create the payment record
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:3000`;
          console.log(`[Bills API] Creating payment record for bill ${bill.id} with amount ${remainingAmount}`);
          
          const response = await fetch(`${baseUrl}/api/bill-payments`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${userId}` // Include user ID for proper data isolation
            },
            body: JSON.stringify({
              payment: {
                ...paymentData,
                // Include additional data needed for journal entry creation
                ap_account_id: billDetail.ap_account_id,
                vendor_name: billDetail.vendor_name,
                user_id: userId // Explicitly include user_id to prevent null constraint violation
              }
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[Bills API] Failed to create payment for bill ${bill.id}: ${response.status} - ${errorText}`);
          } else {
            console.log(`[Bills API] Created payment record for bill ${bill.id}`);
          }
        } catch (err) {
          console.error(`[Bills API] Error creating payment for bill ${bill.id}:`, err);
        }
      }
    }

    // Log audit event for each updated bill
    for (const bill of updatedBills) {
      await logAuditEvent({
        user_id: userId,
        action_type: 'BILL_STATUS_UPDATE',
        entity_type: 'BILL',
        entity_id: String(bill.id),
        context: {
          previous_status: 'draft', // Assuming draft status since we're updating
          new_status: newStatus.toLowerCase(),
          bill_number: bill.bill_number
        },
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      });
    }

    console.log(`[Bills API] Successfully updated ${updatedBills.length} bills to status: ${newStatus}`);

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${updatedBills.length} bills to ${newStatus} status`,
      updatedBills: updatedBills
    });
  } catch (error) {
    console.error('[Bills API] Error updating bill status:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to update bill status',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

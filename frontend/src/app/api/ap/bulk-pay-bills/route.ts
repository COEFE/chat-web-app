import { NextResponse, NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@vercel/postgres';
import { z } from 'zod';

// Define the interface for bulk bill payment data
interface CreateBulkBillPaymentsData {
  billIds: number[];
  paymentDate: string;
  paymentAccountId: number;
  paymentMethod?: string;
  referenceNumber?: string;
}

// Helper function to determine a valid payment account ID
async function getPaymentAccountId(authToken: string, paymentMethod?: string, billInfo?: any): Promise<number | null> {
  try {
    console.log('[API /ap/bulk-pay-bills] Calling determine-payment-account API to find valid payment account');
    
    // Construct the absolute URL for the API endpoint
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'http://localhost:3000';
    const apiUrl = `${appUrl}/api/ai/determine-payment-account`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ paymentMethod, billInfo })
    });
    
    if (!response.ok) {
      console.error(`[API /ap/bulk-pay-bills] Error from determine-payment-account API: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const data = await response.json();
    console.log(`[API /ap/bulk-pay-bills] Payment account determined: ${data.message} (Account ID: ${data.accountId})`);
    return data.accountId;
  } catch (error) {
    console.error('[API /ap/bulk-pay-bills] Error determining payment account:', error);
    return null;
  }
}

// Define Zod schema for request body validation
const BulkPayBillsSchema = z.object({
  billIds: z.array(z.number().int().positive()).min(1, "At least one bill ID is required."),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date must be in YYYY-MM-DD format."),
  paymentAccountId: z.number().int().positive("Payment account ID must be a positive integer.").optional(), // Make optional to allow AI determination
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
});

export async function POST(request: Request) {
  console.log('[API /ap/bulk-pay-bills] Request received');
  
  try {
    // 1. Authenticate the request
    console.log('[API /ap/bulk-pay-bills] Attempting to authenticate user');
    const user = await auth(request as NextRequest);
    if (!user) {
      console.log('[API /ap/bulk-pay-bills] Authentication failed: No user found');
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    console.log('[API /ap/bulk-pay-bills] User authenticated:', user.uid);
    const userId = user.uid;
    
    // Get the authentication token for API calls
    const idToken = (request as any).headers.get('authorization')?.split('Bearer ')[1] || '';
    if (!idToken) {
      console.warn('[API /ap/bulk-pay-bills] No authentication token found in request');
    }

    // 2. Parse and validate the request body
    console.log('[API /ap/bulk-pay-bills] Parsing request body. Content-Type:', request.headers.get('Content-Type'));
    let requestBody;
    try {
      requestBody = await request.json();
      console.log('[API /ap/bulk-pay-bills] Request body parsed successfully:', requestBody);
    } catch (e) {
      console.error('[API /ap/bulk-pay-bills] Error parsing JSON body:', e);
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // 3. Validate the request body against our schema
    console.log('[API /ap/bulk-pay-bills] Validating request body');
    const validationResult = BulkPayBillsSchema.safeParse(requestBody);
    if (!validationResult.success) {
      console.error('[API /ap/bulk-pay-bills] Validation failed:', validationResult.error);
      return NextResponse.json({ error: 'Invalid request body', details: validationResult.error.flatten() }, { status: 400 });
    }
    console.log('[API /ap/bulk-pay-bills] Request validation successful');

    let { billIds, paymentDate, paymentAccountId, paymentMethod, referenceNumber } = validationResult.data;

    // 4. If paymentAccountId is not provided, use AI to determine it
    if (!paymentAccountId) {
      console.log('[API /ap/bulk-pay-bills] No payment account ID provided, determining automatically');
      const determinedAccountId = await getPaymentAccountId(idToken, paymentMethod, { billIds });
      
      if (!determinedAccountId) {
        console.error('[API /ap/bulk-pay-bills] Failed to determine a valid payment account ID');
        return NextResponse.json({ error: 'Could not determine a valid payment account ID' }, { status: 400 });
      }
      
      paymentAccountId = determinedAccountId;
      console.log(`[API /ap/bulk-pay-bills] Using AI-determined payment account ID: ${paymentAccountId}`);
    }

    // 5. Call the service function
    console.log('[API /ap/bulk-pay-bills] Preparing to process bulk payment for bills:', billIds);
    try {
      const bulkPaymentData: CreateBulkBillPaymentsData = {
        billIds,
        paymentDate,
        paymentAccountId,
        paymentMethod,
        referenceNumber,
      };

      console.log('[API /ap/bulk-pay-bills] Processing bulk bill payments with data:', bulkPaymentData);
      
      // Implement the bulk payment processing directly in the route handler
      const successes: { billId: number; message: string }[] = [];
      const failures: { billId: number; error: string }[] = [];
      
      // Process each bill payment
      for (const billId of billIds) {
        try {
          // Get the bill details to determine the amount
          const billResult = await sql`
            SELECT id, bill_number, total_amount, vendor_id, ap_account_id FROM bills 
            WHERE id = ${billId} AND user_id = ${userId}
          `;
          
          if (billResult.rows.length === 0) {
            failures.push({ billId, error: `Bill not found with ID ${billId}` });
            continue;
          }
          
          const bill = billResult.rows[0];
          
          // Get vendor name for the journal entry description
          const vendorResult = await sql`
            SELECT name FROM vendors WHERE id = ${bill.vendor_id} AND user_id = ${userId}
          `;
          
          const vendorName = vendorResult.rows.length > 0 
            ? vendorResult.rows[0].name 
            : `Vendor ID ${bill.vendor_id}`;
          
          // Create a journal entry for the payment
          const journalDescription = `Payment for bill #${bill.bill_number} to ${vendorName}`;
          const referenceNumber = bulkPaymentData.referenceNumber || `PMT-${billId}-${Date.now()}`;
          
          // Create journal entry
          const journalResult = await sql`
            INSERT INTO journal_entries (
              date, description, reference_number, user_id, created_at, updated_at
            ) VALUES (
              ${paymentDate}, ${journalDescription}, ${referenceNumber}, ${userId}, NOW(), NOW()
            ) RETURNING id
          `;
          
          const journalId = journalResult.rows[0].id;
          
          // Create journal entry lines
          // 1. Credit the payment account (bank account)
          await sql`
            INSERT INTO journal_lines (
              journal_id, account_id, description, debit, credit, created_at, updated_at
            ) VALUES (
              ${journalId}, ${paymentAccountId}, ${`Payment from account for bill #${bill.bill_number}`}, 0, ${bill.total_amount}, NOW(), NOW()
            )
          `;
          
          // 2. Debit the AP account
          await sql`
            INSERT INTO journal_lines (
              journal_id, account_id, description, debit, credit, created_at, updated_at
            ) VALUES (
              ${journalId}, ${bill.ap_account_id}, ${`Payment to ${vendorName} for bill #${bill.bill_number}`}, ${bill.total_amount}, 0, NOW(), NOW()
            )
          `;
          
          // Update the bill status to Paid
          await sql`
            UPDATE bills SET status = 'Paid', updated_at = NOW() WHERE id = ${billId} AND user_id = ${userId}
          `;
          
          // Record the payment in bill_payments table
          await sql`
            INSERT INTO bill_payments (
              bill_id, payment_date, amount, payment_method, reference_number, journal_id, user_id, created_at, updated_at
            ) VALUES (
              ${billId}, ${paymentDate}, ${bill.total_amount}, ${paymentMethod || 'Bank Transfer'}, ${referenceNumber}, ${journalId}, ${userId}, NOW(), NOW()
            )
          `;
          
          successes.push({ 
            billId, 
            message: `Bill #${bill.bill_number} paid successfully with journal entry #${journalId}` 
          });
          
        } catch (error) {
          console.error(`[API /ap/bulk-pay-bills] Error processing bill ID ${billId}:`, error);
          failures.push({ 
            billId, 
            error: error instanceof Error ? error.message : 'Unknown error occurred' 
          });
        }
      }
      
      const result = { successes, failures };
      console.log('[API /ap/bulk-pay-bills] Bulk payment processing complete. Successes:', result.successes.length, 'Failures:', result.failures.length);

      // 5. Determine overall status and return response
      let statusCode = 200; // Default to OK for all successful
      if (result.failures.length > 0 && result.successes.length === 0) {
        statusCode = 400; // All failed, treat as bad request or specific error for client
      } else if (result.failures.length > 0) {
        statusCode = 207; // Multi-Status: Indicates partial success
      }

      return NextResponse.json(result, { status: statusCode });
    } catch (error) {
      console.error('[API /ap/bulk-pay-bills] Error in createBulkBillPayments:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      return NextResponse.json({ error: 'Failed to process bulk bill payments.', details: errorMessage }, { status: 500 });
    }
  } catch (outerError) {
    // This outer try/catch ensures we never return HTML error pages
    console.error('[API /ap/bulk-pay-bills] Unhandled error in route handler:', outerError);
    return NextResponse.json({ 
      error: 'An unexpected error occurred', 
      details: outerError instanceof Error ? outerError.message : String(outerError) 
    }, { status: 500 });
  }
}

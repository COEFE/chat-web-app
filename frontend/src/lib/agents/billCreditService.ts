import { BillCredit, BillCreditLine } from '@/lib/accounting/billCreditTypes';
import { sql } from '@vercel/postgres';

/**
 * Service for creating bill credits from credit card agent
 */
export class BillCreditService {
  private baseUrl: string;

  constructor(baseUrl: string = '') {
    // Handle both client and server environments
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined') {
      this.baseUrl = window.location.origin;
    } else {
      // In server-side context, use a default URL that works with fetch
      this.baseUrl = 'http://localhost';
    }
  }

  /**
   * Create a bill credit via API
   */
  async createBillCredit(
    billCreditData: Omit<BillCredit, 'id' | 'created_at' | 'updated_at'>,
    authToken?: string
  ): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
    try {
      console.log('[BillCreditService] Creating bill credit:', billCreditData);

      // Check if we're in a server-side environment
      if (typeof window === 'undefined') {
        // Server-side: Use direct database access
        console.log('[BillCreditService] Using direct database access in server-side environment');
        
        try {
          // Insert the bill credit
          const result = await sql`
            INSERT INTO bill_credits (
              vendor_id, 
              credit_number, 
              credit_date, 
              due_date, 
              total_amount, 
              status, 
              terms, 
              memo, 
              ap_account_id, 
              user_id
            ) 
            VALUES (
              ${billCreditData.vendor_id}, 
              ${billCreditData.credit_number || ''}, 
              ${billCreditData.credit_date}, 
              ${billCreditData.due_date || billCreditData.credit_date}, 
              ${billCreditData.total_amount}, 
              'open', 
              ${billCreditData.terms || ''}, 
              ${billCreditData.memo}, 
              ${billCreditData.ap_account_id}, 
              ${billCreditData.user_id}
            ) 
            RETURNING id, vendor_id, vendor_name, credit_date, total_amount, memo, user_id, status, created_at, updated_at
          `;
          
          if (result.rows.length === 0) {
            throw new Error('Failed to create bill credit');
          }
          
          const billCredit = result.rows[0] as BillCredit;
          
          // Insert bill credit lines if present
          if (billCreditData.lines && billCreditData.lines.length > 0) {
            for (const line of billCreditData.lines) {
              await sql`
                INSERT INTO bill_credit_lines (
                  bill_credit_id,
                  expense_account_id,
                  description,
                  amount,
                  quantity,
                  unit_price
                )
                VALUES (
                  ${billCredit.id},
                  ${line.expense_account_id},
                  ${line.description || ''},
                  ${line.amount},
                  ${line.quantity || 1},
                  ${line.unit_price || line.amount}
                )
              `;
            }
            
            // Fetch the lines to return with the bill credit
            const linesResult = await sql`
              SELECT id, bill_credit_id, expense_account_id, description, amount
              FROM bill_credit_lines
              WHERE bill_credit_id = ${billCredit.id}
            `;
            
            billCredit.lines = linesResult.rows as BillCreditLine[];
          }
          
          console.log('[BillCreditService] Successfully created bill credit via direct DB access:', billCredit);
          
          return {
            success: true,
            billCredit
          };
        } catch (dbError: any) {
          console.error('[BillCreditService] Database error creating bill credit:', dbError);
          return {
            success: false,
            error: dbError.message || 'Database error creating bill credit'
          };
        }
      } else {
        // Client-side: Use fetch API
        const response = await fetch(`${this.baseUrl}/api/bill-credits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken ? `Bearer ${authToken}` : 'Server-Auth',
          },
          body: JSON.stringify(billCreditData),
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('[BillCreditService] Error creating bill credit:', result);
          return {
            success: false,
            error: result.error || `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        console.log('[BillCreditService] Successfully created bill credit:', result.billCredit);
        return {
          success: true,
          billCredit: result.billCredit,
        };
      }
    } catch (error: any) {
      console.error('[BillCreditService] Exception creating bill credit:', error);
      return {
        success: false,
        error: error.message || 'Failed to create bill credit',
      };
    }
  }

  /**
   * Get bill credits for a vendor
   */
  async getBillCreditsForVendor(
    vendorId: number,
    authToken?: string
  ): Promise<{ success: boolean; billCredits?: BillCredit[]; error?: string }> {
    try {
      // Check if we're in a server-side environment
      if (typeof window === 'undefined') {
        // Server-side: Use direct database access
        console.log('[BillCreditService] Using direct database access to get bill credits');
        
        try {
          const result = await sql`
            SELECT bc.*, bcl.id as line_id, bcl.account_id, bcl.description as line_description, bcl.amount as line_amount
            FROM bill_credits bc
            LEFT JOIN bill_credit_lines bcl ON bc.id = bcl.bill_credit_id
            WHERE bc.vendor_id = ${vendorId}
            ORDER BY bc.date DESC, bc.id, bcl.id
          `;
          
          if (result.rows.length === 0) {
            return {
              success: true,
              billCredits: []
            };
          }
          
          // Process the results to group lines by bill credit
          const billCreditsMap = new Map();
          
          for (const row of result.rows) {
            const billCreditId = row.id;
            
            if (!billCreditsMap.has(billCreditId)) {
              billCreditsMap.set(billCreditId, {
                id: row.id,
                vendor_id: row.vendor_id,
                vendor_name: row.vendor_name,
                date: row.date,
                amount: row.amount,
                description: row.description,
                user_id: row.user_id,
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
                lines: []
              });
            }
            
            // Add line if it exists
            if (row.line_id) {
              billCreditsMap.get(billCreditId).lines.push({
                id: row.line_id,
                bill_credit_id: billCreditId,
                account_id: row.expense_account_id, description: row.line_description || '',
                amount: row.line_amount
              });
            }
          }
          
          const billCredits = Array.from(billCreditsMap.values());
          
          return {
            success: true,
            billCredits
          };
        } catch (dbError: any) {
          console.error('[BillCreditService] Database error getting bill credits:', dbError);
          return {
            success: false,
            error: dbError.message || 'Database error getting bill credits'
          };
        }
      } else {
        // Client-side: Use fetch API
        const response = await fetch(
          `${this.baseUrl}/api/bill-credits?vendor_id=${vendorId}`,
          {
            headers: {
              'Authorization': authToken ? `Bearer ${authToken}` : 'Server-Auth',
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error('[BillCreditService] Error getting bill credits:', result);
          return {
            success: false,
            error: result.error || `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        return {
          success: true,
          billCredits: result.billCredits,
        };
      }
    } catch (error: any) {
      console.error('[BillCreditService] Exception getting bill credits:', error);
      return {
        success: false,
        error: error.message || 'Failed to get bill credits',
      };
    }
  }

  /**
   * Create a bill credit for a credit card refund
   */
  async createCreditCardRefundBillCredit(params: {
    vendorId: number;
    vendorName: string;
    refundAmount: number;
    refundDate: string;
    description: string;
    expenseAccountId: number;
    apAccountId: number;
    authToken?: string;
    creditCardLastFour?: string;
    transactionId?: string;
  }): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
    const {
      vendorId,
      vendorName,
      refundAmount,
      refundDate,
      description,
      expenseAccountId,
      apAccountId,
      authToken,
      creditCardLastFour,
      transactionId
    } = params;

    // Format description with credit card info if available
    const formattedDescription = creditCardLastFour
      ? `${description} (CC: *${creditCardLastFour})${transactionId ? ` - Ref: ${transactionId}` : ''}`
      : `${description}${transactionId ? ` - Ref: ${transactionId}` : ''}`;

    // Create bill credit data
    const billCreditData: Omit<BillCredit, 'id' | 'created_at' | 'updated_at'> = {
      vendor_id: vendorId,
      vendor_name: vendorName,
      credit_date: refundDate,
      total_amount: refundAmount,
      memo: formattedDescription,
      user_id: '0', // Will be set by the API
      status: 'open', 
      ap_account_id: apAccountId,
      credit_number: '',
      due_date: refundDate,
      terms: '',
      lines: [
        {
          expense_account_id: expenseAccountId,
          description: 'Credit Card Refund - Expense',
          amount: -refundAmount, // Negative to credit the expense account
          quantity: 1,
          unit_price: refundAmount
        },
        {
          expense_account_id: apAccountId,
          description: 'Credit Card Refund - AP',
          amount: refundAmount, // Positive to debit the AP account
          quantity: 1,
          unit_price: refundAmount
        }
      ]
    };

    return this.createBillCredit(billCreditData, authToken);
  }

  /**
   * Create a bill credit for a credit card chargeback
   */
  async createCreditCardChargebackBillCredit(params: {
    vendorId: number;
    vendorName: string;
    chargebackAmount: number;
    chargebackDate: string;
    description: string;
    expenseAccountId: number;
    apAccountId: number;
    authToken?: string;
    creditCardLastFour?: string;
    transactionId?: string;
  }): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
    const {
      vendorId,
      vendorName,
      chargebackAmount,
      chargebackDate,
      description,
      expenseAccountId,
      apAccountId,
      authToken,
      creditCardLastFour,
      transactionId
    } = params;

    // Format description with credit card info if available
    const formattedDescription = creditCardLastFour
      ? `${description} (CC: *${creditCardLastFour})${transactionId ? ` - Ref: ${transactionId}` : ''}`
      : `${description}${transactionId ? ` - Ref: ${transactionId}` : ''}`;

    // Create bill credit data
    const billCreditData: Omit<BillCredit, 'id' | 'created_at' | 'updated_at'> = {
      vendor_id: vendorId,
      vendor_name: vendorName,
      credit_date: chargebackDate,
      total_amount: chargebackAmount,
      memo: formattedDescription,
      user_id: '0', // Will be set by the API
      status: 'open',
      ap_account_id: apAccountId,
      credit_number: '',
      due_date: chargebackDate,
      terms: '',
      lines: [
        {
          expense_account_id: expenseAccountId,
          description: 'Credit Card Chargeback - Expense',
          amount: -chargebackAmount, // Negative to credit the expense account
          quantity: 1,
          unit_price: chargebackAmount
        },
        {
          expense_account_id: apAccountId,
          description: 'Credit Card Chargeback - AP',
          amount: chargebackAmount, // Positive to debit the AP account
          quantity: 1,
          unit_price: chargebackAmount
        }
      ]
    };

    return this.createBillCredit(billCreditData, authToken);
  }
}
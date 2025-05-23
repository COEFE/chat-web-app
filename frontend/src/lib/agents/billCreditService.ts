import { BillCredit, BillCreditLine } from '@/lib/accounting/billCreditTypes';

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
        return {
          success: false,
          error: result.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      return {
        success: true,
        billCredits: result.billCredits || [],
      };
    } catch (error: any) {
      console.error('[BillCreditService] Exception getting bill credits:', error);
      return {
        success: false,
        error: error.message || 'Failed to get bill credits',
      };
    }
  }

  /**
   * Create a bill credit for a credit card refund transaction
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
      transactionId,
    } = params;

    // Create bill credit data
    const billCreditData: Omit<BillCredit, 'id' | 'created_at' | 'updated_at'> = {
      vendor_id: vendorId,
      credit_number: transactionId ? `CC-REFUND-${transactionId}` : undefined,
      credit_date: refundDate,
      total_amount: Math.abs(refundAmount), // Ensure positive amount for credit
      status: 'Applied',
      memo: `Credit card refund${creditCardLastFour ? ` - Card ending in ${creditCardLastFour}` : ''}: ${description}`,
      ap_account_id: apAccountId,
      lines: [
        {
          expense_account_id: expenseAccountId,
          description: description,
          quantity: 1,
          unit_price: Math.abs(refundAmount),
          amount: Math.abs(refundAmount),
          category: 'Credit Card Refund',
        },
      ],
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
    originalTransactionId?: string;
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
      originalTransactionId,
    } = params;

    // Create bill credit data
    const billCreditData: Omit<BillCredit, 'id' | 'created_at' | 'updated_at'> = {
      vendor_id: vendorId,
      credit_number: originalTransactionId ? `CC-CHARGEBACK-${originalTransactionId}` : undefined,
      credit_date: chargebackDate,
      total_amount: Math.abs(chargebackAmount), // Ensure positive amount for credit
      status: 'Applied',
      memo: `Credit card chargeback${creditCardLastFour ? ` - Card ending in ${creditCardLastFour}` : ''}: ${description}`,
      ap_account_id: apAccountId,
      lines: [
        {
          expense_account_id: expenseAccountId,
          description: description,
          quantity: 1,
          unit_price: Math.abs(chargebackAmount),
          amount: Math.abs(chargebackAmount),
          category: 'Credit Card Chargeback',
        },
      ],
    };

    return this.createBillCredit(billCreditData, authToken);
  }
}

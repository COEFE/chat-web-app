import { BillCreditService } from './billCreditService';
import { BillCredit } from '@/lib/accounting/billCreditTypes';

/**
 * Integration utility for Credit Card Agent to access Bill Credit functionality
 * This provides a simple interface for the credit card agent to create bill credits
 * for refunds, chargebacks, and other credit card related credits.
 */

const billCreditService = new BillCreditService();

/**
 * Create a bill credit for a credit card refund
 */
export async function createCreditCardRefund(params: {
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
  console.log('[CreditCardBillCreditIntegration] Creating credit card refund bill credit:', params);
  
  return billCreditService.createCreditCardRefundBillCredit(params);
}

/**
 * Create a bill credit for a credit card chargeback
 */
export async function createCreditCardChargeback(params: {
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
  console.log('[CreditCardBillCreditIntegration] Creating credit card chargeback bill credit:', params);
  
  return billCreditService.createCreditCardChargebackBillCredit(params);
}

/**
 * Create a general bill credit (for other credit card related credits)
 */
export async function createGeneralCreditCardBillCredit(params: {
  vendorId: number;
  vendorName: string;
  creditAmount: number;
  creditDate: string;
  description: string;
  expenseAccountId: number;
  apAccountId: number;
  authToken?: string;
  creditNumber?: string;
  memo?: string;
}): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Creating general credit card bill credit:', params);
  
  const billCreditData = {
    vendor_id: params.vendorId,
    credit_number: params.creditNumber,
    credit_date: params.creditDate,
    total_amount: Math.abs(params.creditAmount),
    status: 'Applied',
    memo: params.memo || `Credit card credit: ${params.description}`,
    ap_account_id: params.apAccountId,
    lines: [
      {
        expense_account_id: params.expenseAccountId,
        description: params.description,
        quantity: 1,
        unit_price: Math.abs(params.creditAmount),
        amount: Math.abs(params.creditAmount),
        category: 'Credit Card Credit',
      },
    ],
  };

  return billCreditService.createBillCredit(billCreditData, params.authToken);
}

/**
 * Get bill credits for a vendor (useful for checking existing credits)
 */
export async function getBillCreditsForVendor(
  vendorId: number,
  authToken?: string
): Promise<{ success: boolean; billCredits?: BillCredit[]; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Getting bill credits for vendor:', vendorId);
  
  return billCreditService.getBillCreditsForVendor(vendorId, authToken);
}

/**
 * Utility function to determine if a transaction should create a bill credit
 * This can be used by the credit card agent to decide when to create bill credits
 * IMPORTANT: Only vendor refunds should create bill credits, NOT credit card payments
 */
export function shouldCreateBillCredit(transaction: {
  amount: number;
  description: string;
  type?: string;
  vendor?: string;
  category?: string;
}): boolean {
  const { amount, description, type, vendor, category } = transaction;
  
  // Skip if this is a credit card payment (payment TO the credit card company)
  const paymentKeywords = [
    'payment', 'autopay', 'online payment', 'electronic payment',
    'payment received', 'thank you', 'payment - thank you',
    'payment thank you', 'payment posted', 'payment credited'
  ];
  
  const isPayment = paymentKeywords.some(keyword => 
    description.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isPayment) {
    console.log('[BillCreditIntegration] Skipping payment transaction:', description);
    return false;
  }
  
  // Check if this is a vendor refund (credit FROM a vendor)
  const vendorRefundKeywords = [
    'refund', 'credit', 'return', 'chargeback', 'reversal', 
    'adjustment credit', 'merchant credit', 'dispute credit',
    'return credit', 'merchandise credit', 'store credit'
  ];
  
  const hasVendorRefundKeyword = vendorRefundKeywords.some(keyword => 
    description.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Must be a credit (negative amount) AND have refund keywords AND have a vendor
  const isCredit = amount < 0 || type === 'refund' || type === 'credit';
  const hasVendor = Boolean(vendor && vendor.trim().length > 0);
  
  // Additional check: if description contains credit card company names, it's likely a payment
  const creditCardCompanies = [
    'visa', 'mastercard', 'amex', 'american express', 'discover',
    'chase', 'capital one', 'citi', 'bank of america', 'wells fargo'
  ];
  
  const isCreditCardCompany = creditCardCompanies.some(company => 
    description.toLowerCase().includes(company.toLowerCase()) ||
    (vendor && vendor.toLowerCase().includes(company.toLowerCase()))
  );
  
  if (isCreditCardCompany && !hasVendorRefundKeyword) {
    console.log('[BillCreditIntegration] Skipping credit card company transaction:', description);
    return false;
  }
  
  const shouldCreate = isCredit && hasVendorRefundKeyword && hasVendor && !isPayment;
  
  console.log('[BillCreditIntegration] Transaction analysis:', {
    description,
    amount,
    isCredit,
    hasVendorRefundKeyword,
    hasVendor,
    isPayment,
    isCreditCardCompany,
    shouldCreate
  });
  
  return shouldCreate;
}

/**
 * Utility function to determine the type of credit card credit
 */
export function getCreditCardCreditType(transaction: {
  amount: number;
  description: string;
  type?: string;
}): 'refund' | 'chargeback' | 'credit' | 'unknown' {
  const { description, type } = transaction;
  const desc = description.toLowerCase();
  
  if (type === 'refund' || desc.includes('refund') || desc.includes('return')) {
    return 'refund';
  }
  
  if (desc.includes('chargeback') || desc.includes('dispute')) {
    return 'chargeback';
  }
  
  if (type === 'credit' || desc.includes('credit') || desc.includes('adjustment')) {
    return 'credit';
  }
  
  return 'unknown';
}

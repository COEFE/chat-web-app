/**
 * Represents a credit card transaction
 */
export interface CreditCardTransaction {
  /**
   * Optional unique identifier for the transaction
   */
  id?: string;

  /**
   * Transaction date in ISO format (YYYY-MM-DD)
   */
  date: string;
  
  /**
   * Transaction description
   */
  description: string;
  
  /**
   * Transaction amount
   * Positive values represent charges (debits)
   * Negative values represent payments or credits
   */
  amount: number;
  
  /**
   * Optional transaction category
   */
  category?: string;
  
  /**
   * Optional merchant name
   */
  merchant?: string;
  
  /**
   * Optional transaction ID or reference number
   */
  transactionId?: string;
  
  /**
   * Flag indicating if this transaction is a payment (as opposed to a refund)
   * Only applicable for negative amounts
   */
  isPayment?: boolean;
  
  /**
   * Payment method used (e.g., 'bank transfer', 'check', 'online payment')
   * Only applicable for payment transactions
   */
  paymentMethod?: string | null;
  
  /**
   * Reference number or identifier for the payment (e.g., check number)
   * Only applicable for payment transactions
   */
  paymentReference?: string | null;
  
  /**
   * For refund transactions, the name of the original vendor/merchant
   * Only applicable for refund transactions
   */
  originalVendor?: string | null;
}

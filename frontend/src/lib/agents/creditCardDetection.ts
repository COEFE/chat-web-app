/**
 * Enhanced credit card query detection logic
 * This module provides improved detection for credit card related queries,
 * including refunds, chargebacks, and transactions
 */

/**
 * Check if the query is about credit card related activities
 * Enhanced to detect refunds, chargebacks, and transactions
 */
export function isCreditCardQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  // Credit card statement keywords
  const statementKeywords = [
    "credit card statement",
    "credit card bill", 
    "card statement",
    "statement balance",
    "payment due",
    "minimum payment"
  ];
  
  // Credit card company keywords
  const cardCompanyKeywords = [
    "visa",
    "mastercard", 
    "amex",
    "american express",
    "discover",
    "chase",
    "capital one",
    "citi",
    "bank of america"
  ];
  
  // Credit card transaction keywords
  const transactionKeywords = [
    "charge",
    "transaction",
    "purchase",
    "refund",
    "chargeback",
    "credit card charge",
    "credit card transaction",
    "credit card refund",
    "credit card chargeback"
  ];
  
  // Credit card account keywords
  const accountKeywords = [
    "credit card account",
    "card account",
    "account ending in",
    "account ****"
  ];
  
  // Check for any credit card related keywords
  const hasStatementKeyword = statementKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  const hasCardCompanyKeyword = cardCompanyKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  const hasTransactionKeyword = transactionKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  const hasAccountKeyword = accountKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  // Enhanced detection for refunds specifically
  const hasRefundKeyword = lowerQuery.includes("refund") || 
                          lowerQuery.includes("refunded") ||
                          lowerQuery.includes("chargeback") ||
                          lowerQuery.includes("credit");
  
  // Check for patterns like "Amazon charge was refunded" or "Amex credit card charge"
  const hasChargeRefundPattern = (lowerQuery.includes("charge") && hasRefundKeyword) ||
                                (lowerQuery.includes("transaction") && hasRefundKeyword);
  
  // Check for credit card account references (e.g., "account 2009", "amex account")
  const hasAccountReference = /account\s+\d+/.test(lowerQuery) ||
                             (hasCardCompanyKeyword && lowerQuery.includes("account"));
  
  return hasStatementKeyword || 
         hasTransactionKeyword || 
         hasAccountKeyword ||
         hasChargeRefundPattern ||
         hasAccountReference ||
         (hasCardCompanyKeyword && (hasRefundKeyword || lowerQuery.includes("charge")));
}

/**
 * Check if the query is specifically about a credit card refund
 */
export function isCreditCardRefund(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  
  const refundKeywords = [
    "refund",
    "refunded", 
    "chargeback",
    "credit",
    "return"
  ];
  
  const chargeKeywords = [
    "charge",
    "transaction",
    "purchase"
  ];
  
  const hasRefundKeyword = refundKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  const hasChargeKeyword = chargeKeywords.some(keyword => 
    lowerQuery.includes(keyword)
  );
  
  // Look for patterns like "charge was refunded", "Amazon refund", etc.
  return hasRefundKeyword && (hasChargeKeyword || lowerQuery.includes("amazon") || lowerQuery.includes("vendor"));
}

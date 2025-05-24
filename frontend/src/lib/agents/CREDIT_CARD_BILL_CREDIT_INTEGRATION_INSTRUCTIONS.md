# Credit Card Agent Bill Credit Integration Instructions

## Overview
This document provides instructions for integrating bill credit functionality into the Credit Card Agent.

**IMPORTANT**: The agent should only create bill credits for **vendor refunds**, NOT for credit card payments. 

### Key Distinction:
- **Vendor Refunds** (CREATE bill credit): When a vendor refunds money back to your credit card (e.g., "Amazon refund", "Store return credit")
- **Credit Card Payments** (DO NOT create bill credit): When you make payments to the credit card company (e.g., "Payment - Thank You", "AutoPay", "Online Payment")

The integration includes smart detection to automatically distinguish between these two scenarios.

## Files Created
1. `billCreditService.ts` - Core service for bill credit API interactions
2. `creditCardBillCreditIntegration.ts` - Integration utilities for the credit card agent

## Integration Steps

### 1. Add Import to Credit Card Agent
Add this import at the top of `creditCardAgent.ts` (after the existing imports):

```typescript
import {
  createCreditCardRefund,
  createCreditCardChargeback,
  createGeneralCreditCardBillCredit,
  getBillCreditsForVendor,
  shouldCreateBillCredit,
  getCreditCardCreditType
} from './creditCardBillCreditIntegration';
```

### 2. Add Bill Credit Processing to Transaction Handler
In the `processCreditCardTransactions` method, add logic to detect and process vendor refunds (NOT credit card payments):

```typescript
// Add this after processing regular transactions
for (const transaction of transactions) {
  // Check if this transaction should create a bill credit (vendor refunds only, not payments)
  if (shouldCreateBillCredit({
    amount: transaction.amount,
    description: transaction.description,
    type: transaction.type,
    vendor: transaction.vendor || vendorName, // Pass vendor info
    category: transaction.category
  })) {
    const creditType = getCreditCardCreditType(transaction);
    
    try {
      let result;
      
      switch (creditType) {
        case 'refund':
          result = await createCreditCardRefund({
            vendorId: vendorId,
            vendorName: vendorName,
            refundAmount: Math.abs(transaction.amount),
            refundDate: transaction.date,
            description: transaction.description,
            expenseAccountId: expenseAccountId,
            apAccountId: creditCardAccountId,
            authToken: context.authToken,
            creditCardLastFour: lastFourDigits,
            transactionId: transaction.id || transaction.reference
          });
          break;
          
        case 'chargeback':
          result = await createCreditCardChargeback({
            vendorId: vendorId,
            vendorName: vendorName,
            chargebackAmount: Math.abs(transaction.amount),
            chargebackDate: transaction.date,
            description: transaction.description,
            expenseAccountId: expenseAccountId,
            apAccountId: creditCardAccountId,
            authToken: context.authToken,
            creditCardLastFour: lastFourDigits,
            originalTransactionId: transaction.originalTransactionId
          });
          break;
          
        default:
          result = await createGeneralCreditCardBillCredit({
            vendorId: vendorId,
            vendorName: vendorName,
            creditAmount: Math.abs(transaction.amount),
            creditDate: transaction.date,
            description: transaction.description,
            expenseAccountId: expenseAccountId,
            apAccountId: creditCardAccountId,
            authToken: context.authToken,
            creditNumber: `CC-CREDIT-${transaction.id || Date.now()}`,
            memo: `Credit card credit: ${transaction.description}`
          });
      }
      
      if (result.success) {
        console.log(`[CreditCardAgent] Successfully created bill credit for ${creditType}:`, result.billCredit);
        // Add to audit log
        await logAuditEvent(context.userId, 'bill_credit_created', {
          bill_credit_id: result.billCredit?.id,
          vendor_id: vendorId,
          amount: Math.abs(transaction.amount),
          type: creditType,
          source: 'credit_card_agent'
        });
      } else {
        console.error(`[CreditCardAgent] Failed to create bill credit for ${creditType}:`, result.error);
      }
    } catch (error) {
      console.error(`[CreditCardAgent] Exception creating bill credit for transaction:`, error);
    }
  } else {
    console.log(`[CreditCardAgent] Skipping transaction (not a vendor refund):`, transaction.description);
  }
}
```

### 3. Add Bill Credit Query Capability
Add a method to query existing bill credits for a vendor:

```typescript
private async queryVendorBillCredits(vendorId: number, authToken: string) {
  try {
    const result = await getBillCreditsForVendor(vendorId, authToken);
    if (result.success) {
      return result.billCredits || [];
    } else {
      console.error('[CreditCardAgent] Failed to get bill credits:', result.error);
      return [];
    }
  } catch (error) {
    console.error('[CreditCardAgent] Exception getting bill credits:', error);
    return [];
  }
}
```

### 4. Update Agent Response Messages
Add bill credit information to agent responses when processing statements:

```typescript
// In the response message, add information about created bill credits
if (billCreditsCreated > 0) {
  responseMessage += `\n\n📋 **Bill Credits Created**: ${billCreditsCreated} bill credit(s) were automatically created for refunds and credits found in the statement.`;
}
```

## Usage Examples

### Creating a Refund Bill Credit
```typescript
const result = await createCreditCardRefund({
  vendorId: 123,
  vendorName: "Amazon",
  refundAmount: 25.99,
  refundDate: "2024-01-15",
  description: "Product return refund",
  expenseAccountId: 456,
  apAccountId: 789,
  authToken: "bearer_token_here",
  creditCardLastFour: "1234",
  transactionId: "TXN123"
});
```

### Creating a Chargeback Bill Credit
```typescript
const result = await createCreditCardChargeback({
  vendorId: 123,
  vendorName: "Disputed Merchant",
  chargebackAmount: 150.00,
  chargebackDate: "2024-01-15",
  description: "Disputed charge - unauthorized transaction",
  expenseAccountId: 456,
  apAccountId: 789,
  authToken: "bearer_token_here",
  creditCardLastFour: "1234",
  originalTransactionId: "TXN456"
});
```

## Benefits
1. **Automatic Credit Processing**: The agent will automatically detect and process vendor refunds (not credit card payments)
2. **Proper Accounting**: Bill credits ensure proper accounting treatment of vendor refunds
3. **Audit Trail**: All bill credit creation is logged for audit purposes
4. **Vendor Tracking**: Credits are properly associated with vendors for better vendor management

## Testing
After integration, test with credit card statements that contain:
1. Refund transactions (negative amounts)
2. Chargeback credits
3. Merchant credits
4. Return credits

The agent should automatically create appropriate bill credits for these transactions.

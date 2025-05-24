# AI-Powered Journal Type Selection Integration Guide

This document outlines how to integrate Claude 3.5 AI-powered journal type selection into the credit card agent workflow.

## Overview

Instead of hardcoding journal types (CCP, CCY, CCR), we're now using Claude 3.5 to intelligently determine the appropriate journal type based on transaction details. This provides several benefits:

1. More accurate categorization of transactions
2. Reduced manual intervention for edge cases
3. Better handling of refunds, returns, and chargebacks
4. Improved reporting and analytics

## Implementation Files

1. **`aiJournalTypeSelector.ts`** - Core AI integration with Claude 3.5
2. **`integrateAIJournalTypeSelector.ts`** - Helper utilities for integration
3. **`testAIJournalTypeSelector.js`** - Test script to verify functionality

## Integration Steps

### 1. Set up Environment Variables

Ensure your `.env.local` file includes the Anthropic API key:

```
ANTHROPIC_API_KEY=your_api_key_here
```

### 2. Modify Credit Card Agent

Update the `createTransactionJournalEntry` method in `creditCardAgent.ts` to use the AI-powered journal type selector:

```typescript
// Import the AI journal type selector
import { getAIJournalType } from './integrateAIJournalTypeSelector';

// In the createTransactionJournalEntry method:
// Replace hardcoded journal type:
//   "CCP", // journal_type for Credit Card Purchase
// With:
const journalType = await getAIJournalType(transaction, context);
```

### 3. Update Function Calls

When calling `createTransactionJournalEntry`, pass the appropriate flags:

```typescript
const journalResult = await this.createTransactionJournalEntry(
  context,
  accountId,
  accountName,
  transaction,
  isRefund,  // Add this parameter
  isPayment  // Add this parameter
);
```

## Testing

1. Run the test script to verify AI journal type selection:
   ```
   node testAIJournalTypeSelector.js
   ```

2. Monitor logs during transaction processing to see the AI-determined journal types.

## Fallback Mechanism

The system includes a robust fallback mechanism:

1. If the Anthropic API key is missing, it falls back to default journal types
2. If the API call fails, it falls back to default journal types
3. If Claude returns an invalid journal type, it falls back to default journal types

## Best Practices

1. Keep transaction descriptions detailed for better AI analysis
2. Include category information when available
3. Monitor AI-determined journal types to ensure accuracy
4. Periodically review and refine the AI prompts for better results

## Future Enhancements

1. Add feedback loop to improve AI accuracy over time
2. Expand journal type options for more specific categorization
3. Implement caching to reduce API calls for similar transactions
4. Add user override capability for edge cases

# Credit Card Agent AI Enhancement Integration

This document provides instructions for integrating AI-powered direct transaction recording into the Credit Card Agent, replacing regex patterns with Claude 3.5 Sonnet analysis.

## Files Created

1. `creditCardTransactionExtractor.ts` - AI-powered transaction extraction
2. `creditCardDirectTransactionHandler.ts` - Direct transaction recording logic
3. `creditCardDetection.ts` - Enhanced query detection (already created)

## Integration Steps

### Step 1: Add Imports to CreditCardAgent

Add these imports at the top of `creditCardAgent.ts`:

```typescript
import { 
  extractTransactionWithAI, 
  isDirectTransactionRequest 
} from "./creditCardTransactionExtractor";
import { handleDirectTransactionRecording } from "./creditCardDirectTransactionHandler";
```

### Step 2: Enhance the processRequest Method

Replace the current `processRequest` method logic with this enhanced version:

```typescript
async processRequest(context: AgentContext): Promise<AgentResponse> {
  try {
    const query = context.query.trim();
    console.log(`[CreditCardAgent] Processing query: ${query}`);

    // Step 1: Check if this is a direct transaction request using AI
    const directTransactionCheck = await isDirectTransactionRequest(query);
    
    if (directTransactionCheck.isDirectTransaction && directTransactionCheck.confidence > 0.6) {
      console.log(`[CreditCardAgent] Detected direct transaction request with ${directTransactionCheck.confidence} confidence`);
      return await handleDirectTransactionRecording(context, query);
    }

    // Step 2: Check if we have a PDF document context (from agent-chat route)
    if (
      context.documentContext &&
      context.documentContext.type === "pdf" &&
      context.documentContext.content
    ) {
      console.log(
        `[CreditCardAgent] Processing PDF document: ${context.documentContext.name}`
      );

      // Extract the PDF content and use it as the query
      const enhancedQuery = `Credit card statement from PDF: ${context.documentContext.name}\n\n${query}`;

      // Process the statement with the enhanced query
      return this.processStatement(context, enhancedQuery);
    }

    // Step 3: Check if this is a credit card statement using AI-enhanced detection
    if (this.isCreditCardStatement(query)) {
      return this.processStatement(context, query);
    }

    // Step 4: Default response if no specific intent is matched
    return {
      success: false,
      message:
        "I'm the Credit Card Agent and can help you process credit card statements or record individual transactions. Please provide a credit card statement or transaction details for me to analyze.",
      data: { sources: [] },
    };
  } catch (error) {
    console.error("[CreditCardAgent] Error processing request:", error);
    return {
      success: false,
      message: "An error occurred while processing your request.",
      data: { sources: [] },
    };
  }
}
```

### Step 3: Enhance the canHandle Method

Replace the current `canHandle` method with this AI-enhanced version:

```typescript
import { isCreditCardQuery } from "./creditCardDetection";

async canHandle(query: string): Promise<boolean> {
  // Use AI-enhanced detection that includes refunds, transactions, and statements
  const isDirectTransaction = await isDirectTransactionRequest(query);
  const isCreditCardRelated = isCreditCardQuery(query);
  
  return isDirectTransaction.isDirectTransaction || 
         isCreditCardRelated || 
         this.isCreditCardStatement(query);
}
```

### Step 4: Update the isCreditCardStatement Method (Optional Enhancement)

You can optionally enhance the existing method to use AI, but the current keyword-based approach can remain as a fallback:

```typescript
private async isCreditCardStatementWithAI(query: string): Promise<boolean> {
  try {
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 200,
      temperature: 0.1,
      messages: [{
        role: "user",
        content: `Is this query about processing a credit card statement (not individual transactions)? 
        
        Query: "${query}"
        
        Return only "true" or "false".`
      }]
    });
    
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    return responseText.toLowerCase().includes('true');
  } catch (error) {
    console.error('[CreditCardAgent] Error in AI statement detection, falling back to keywords:', error);
    return this.isCreditCardStatement(query);
  }
}
```

## Key Benefits

### 1. **AI-Powered Transaction Extraction**
- Replaces regex patterns with Claude 3.5 Sonnet analysis
- Handles natural language variations
- Extracts vendor, amount, date, type automatically

### 2. **Direct Transaction Recording**
- Users can record individual refunds/chargebacks without statements
- Automatic bill credit creation for vendor refunds
- Smart vendor and account detection

### 3. **Enhanced Query Detection**
- Better recognition of credit card refund patterns
- Distinguishes between statement processing and transaction recording
- Handles account references like "account 2009"

## Example Queries Now Supported

✅ **Direct Transaction Recording:**
- "record a refund for a Amazon charge for $156.89 that was refunded on 7/1/2024 to account 2009"
- "add a chargeback for Walmart $75.50 on my Amex card"
- "log a credit from Starbucks for $12.99"

✅ **Statement Processing:**
- "process my credit card statement"
- "analyze this Visa statement"

✅ **Account References:**
- "Amex charge on account 2009"
- "refund to account ending in 1234"

## Testing

After integration, test with these queries:
1. "record a refund for Amazon $50 on 7/1/2024"
2. "process my credit card statement" 
3. "Amex charge for $100 was refunded"
4. "add a chargeback for Walmart $25"

The agent should now properly route direct transaction requests to the new AI-powered handler while continuing to process statements as before.

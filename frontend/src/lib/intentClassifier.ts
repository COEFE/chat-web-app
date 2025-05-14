import Anthropic from "@anthropic-ai/sdk";

/**
 * Intent classification result
 */
export interface IntentClassification {
  intent: 'ap_bill' | 'ar_invoice' | 'gl_query' | 'reconciliation' | 'unknown';
  confidence: number; // 0-1 scale
  details?: string;
}

/**
 * Classify the user's intent using AI to determine which agent should handle the query
 * This replaces regex pattern matching with a more robust understanding of natural language
 */
export async function classifyUserIntent(query: string): Promise<IntentClassification> {
  console.log(`[IntentClassifier] Classifying query: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 150,
      temperature: 0.2,
      system: `You are an accounting query classifier that determines the primary intent of a user's query. 
      Classify the query into exactly one of these categories:
      
      - ap_bill: Queries about vendor bills, accounts payable, creating/viewing/managing bills, or vendor management
      - ar_invoice: Queries about customer invoices, accounts receivable, creating/viewing/managing invoices
      - gl_query: Queries about general ledger, chart of accounts, journal entries, or financial reporting
      - reconciliation: Queries about account reconciliation or bank reconciliation
      - unknown: Queries that don't clearly fit the categories above
      
      Respond in JSON format with these fields:
      {
        "intent": "one of the category values above",
        "confidence": a number between 0-1 representing your confidence,
        "details": brief explanation if helpful
      }
      
      Focus on distinguishing between bills (AP) and invoices (AR). 
      In accounting, bills are what an organization PAYS to vendors (accounts payable).
      Invoices are what an organization CHARGES to customers (accounts receivable).
      
      IMPORTANT - Payment Direction:
      - When WE pay vendors/bills → ap_bill intent
      - When CUSTOMERS pay us/invoices → ar_invoice intent
      
      Key indicators for AP (bills):
      - "Pay the vendor" / "We paid the bill"
      - "Vendor payment" / "Bill payment"
      
      Key indicators for AR (invoices):
      - "Customer paid the invoice" / "We received payment"
      - "Invoice payment received" / "Customer settled invoice"
      
      CUSTOMER NAMES: If the query mentions a customer name, it's most likely about an invoice (ar_invoice).
      The presence of a known customer name strongly indicates this is an accounts receivable query.
      Examples: "RAG LLC paid invoice", "payment from Acme Corp", "Microsoft sent payment".
      
      COMPANY DISTINCTION:
      - If a company is paying US, they are a CUSTOMER (ar_invoice)
      - If WE are paying a company, they are a VENDOR (ap_bill)
      
      If the query mentions bill or vendor, it's likely ap_bill.
      If it mentions invoice or customer, it's likely ar_invoice.
      If the query talks about a CUSTOMER paying an INVOICE, it's ar_invoice (not ap_bill).`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classification = JSON.parse(jsonMatch[0]) as IntentClassification;
        console.log(`[IntentClassifier] Classification result:`, classification);
        return classification;
      }
    } catch (parseError) {
      console.error('[IntentClassifier] Error parsing JSON from response:', parseError);
    }
    
    // Fallback if parsing fails
    console.log('[IntentClassifier] Could not parse JSON, using raw response:', responseText);
    if (responseText.includes('ap_bill')) {
      return { intent: 'ap_bill', confidence: 0.7 };
    } else if (responseText.includes('ar_invoice')) {
      return { intent: 'ar_invoice', confidence: 0.7 };
    } else if (responseText.includes('gl_query')) {
      return { intent: 'gl_query', confidence: 0.7 };
    } else if (responseText.includes('reconciliation')) {
      return { intent: 'reconciliation', confidence: 0.7 };
    }
    
    return { intent: 'unknown', confidence: 0.5 };
  } catch (error) {
    console.error('[IntentClassifier] Error classifying intent:', error);
    return { intent: 'unknown', confidence: 0 };
  }
}

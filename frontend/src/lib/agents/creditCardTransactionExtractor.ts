import Anthropic from "@anthropic-ai/sdk";

/**
 * Interface for extracted transaction information
 */
export interface ExtractedTransaction {
  success: boolean;
  vendor?: string;
  amount?: number;
  date?: string;
  description?: string;
  type?: 'refund' | 'chargeback' | 'credit' | 'charge';
  accountNumber?: string;
  accountLastFour?: string;
  creditCardIssuer?: string;
  reasoning?: string;
  error?: string;
}

/**
 * AI-powered transaction extraction from natural language queries
 * Replaces regex patterns with Claude 3.5 Sonnet analysis
 */
export async function extractTransactionWithAI(
  query: string,
  anthropicClient?: Anthropic
): Promise<ExtractedTransaction> {
  console.log(`[CreditCardTransactionExtractor] Extracting transaction info from: "${query}"`);
  
  // Create local Anthropic client if not provided
  const anthropic = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
  });
  
  const systemPrompt = `You are an AI specialized in extracting credit card transaction information from natural language queries.

Analyze the given message and extract transaction details for credit card refunds, chargebacks, credits, or charges.

Extract the following information:
- vendor: The merchant/vendor name (e.g., "Amazon", "Walmart", "Starbucks")
- amount: The transaction amount as a positive number (e.g., 156.89)
- date: The transaction date in YYYY-MM-DD format
- description: A descriptive summary of the transaction
- type: One of 'refund', 'chargeback', 'credit', or 'charge'
- accountNumber: Full account number if mentioned (e.g., "2009", "1234")
- accountLastFour: Last 4 digits of account if mentioned
- creditCardIssuer: Card issuer if mentioned (e.g., "Amex", "Visa", "Chase")

For transaction type classification:
- "refund" or "refunded" → type: 'refund'
- "chargeback" → type: 'chargeback' 
- "credit" → type: 'credit'
- "charge" or "charged" → type: 'charge'

For dates, convert natural language to YYYY-MM-DD:
- "7/1/2024" → "2024-07-01"
- "July 1, 2024" → "2024-07-01"
- "yesterday" → calculate based on today
- If no date provided, leave as null

Return a JSON object with:
{
  "success": true/false,
  "vendor": "vendor name or null",
  "amount": number or null,
  "date": "YYYY-MM-DD or null",
  "description": "transaction description",
  "type": "refund/chargeback/credit/charge or null",
  "accountNumber": "account number or null",
  "accountLastFour": "last 4 digits or null", 
  "creditCardIssuer": "issuer name or null",
  "reasoning": "brief explanation of extraction"
}

Return ONLY the JSON object with no additional text.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      temperature: 0.1,
      messages: [
        { role: "user", content: `${systemPrompt}\n\nQuery to analyze: ${query}` }
      ]
    });

    let responseText = '';
    if (response.content[0].type === 'text') {
      responseText = response.content[0].text;
    }

    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]) as ExtractedTransaction;
        console.log(`[CreditCardTransactionExtractor] AI extraction result:`, result);
        return result;
      } else {
        console.error(`[CreditCardTransactionExtractor] No JSON found in response: ${responseText}`);
        return {
          success: false,
          error: 'Could not parse AI response',
          reasoning: 'No JSON object found in AI response'
        };
      }
    } catch (parseError) {
      console.error(`[CreditCardTransactionExtractor] Error parsing AI response: ${parseError}. Raw response: ${responseText}`);
      return {
        success: false,
        error: `Error parsing AI response: ${parseError}`,
        reasoning: 'JSON parsing failed'
      };
    }
  } catch (error) {
    console.error(`[CreditCardTransactionExtractor] Error calling AI: ${error}`);
    return {
      success: false,
      error: `Error calling AI: ${error}`,
      reasoning: 'AI API call failed'
    };
  }
}

/**
 * Check if a query is requesting to record a specific transaction (not process a statement)
 */
export async function isDirectTransactionRequest(
  query: string,
  anthropicClient?: Anthropic
): Promise<{ isDirectTransaction: boolean; confidence: number; reasoning: string }> {
  console.log(`[CreditCardTransactionExtractor] Checking if query is direct transaction request: "${query}"`);
  
  const anthropic = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
  });
  
  const systemPrompt = `You are an AI that determines if a user query is requesting to record a specific credit card transaction versus processing a full statement.

Analyze the query and determine:
- Is this asking to record a SPECIFIC transaction (refund, charge, etc.)?
- Or is this asking to process a full credit card STATEMENT?

Direct transaction requests typically:
- Mention specific amounts, vendors, and dates
- Use words like "record", "create", "add", "log"
- Reference individual transactions or refunds
- Examples: "record a refund for Amazon $50", "add a chargeback for $100"

Statement processing requests typically:
- Reference statements, bills, or documents
- Ask to "process" or "analyze" statements
- Examples: "process my credit card statement", "analyze this statement"

Return a JSON object:
{
  "isDirectTransaction": true/false,
  "confidence": number between 0-1,
  "reasoning": "brief explanation"
}

Return ONLY the JSON object.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 500,
      temperature: 0.1,
      messages: [
        { role: "user", content: `${systemPrompt}\n\nQuery: ${query}` }
      ]
    });

    let responseText = '';
    if (response.content[0].type === 'text') {
      responseText = response.content[0].text;
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        console.log(`[CreditCardTransactionExtractor] Direct transaction check result:`, result);
        return result;
      }
    } catch (parseError) {
      console.error(`[CreditCardTransactionExtractor] Error parsing response: ${parseError}`);
    }
    
    // Fallback analysis
    const lowerQuery = query.toLowerCase();
    const directKeywords = ['record', 'create', 'add', 'log', 'enter', 'post'];
    const hasDirectKeyword = directKeywords.some(keyword => lowerQuery.includes(keyword));
    
    return {
      isDirectTransaction: hasDirectKeyword,
      confidence: hasDirectKeyword ? 0.7 : 0.3,
      reasoning: 'Fallback pattern matching'
    };
  } catch (error) {
    console.error(`[CreditCardTransactionExtractor] Error in direct transaction check: ${error}`);
    return {
      isDirectTransaction: false,
      confidence: 0,
      reasoning: `Error: ${error}`
    };
  }
}

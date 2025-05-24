import Anthropic from '@anthropic-ai/sdk';
import { CreditCardTransaction } from '../../types/creditCard';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Uses Claude 3.5 to intelligently determine the appropriate journal type
 * based on transaction details and context
 * 
 * @param transaction The credit card transaction to analyze
 * @param isRefund Whether the transaction is a refund
 * @param isPayment Whether the transaction is a payment to the credit card
 * @returns The appropriate journal type code
 */
export async function determineJournalType(
  transaction: CreditCardTransaction,
  isRefund: boolean = false,
  isPayment: boolean = false
): Promise<string> {
  // Default journal types
  const DEFAULT_PURCHASE_TYPE = 'CCP'; // Credit Card Purchase
  const DEFAULT_PAYMENT_TYPE = 'CCY';  // Credit Card Payment
  const DEFAULT_REFUND_TYPE = 'CCR';   // Credit Card Refund

  // If we don't have an API key, return the default types
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[JournalTypeSelector] No Anthropic API key found, using default journal types');
    if (isRefund) return DEFAULT_REFUND_TYPE;
    if (isPayment) return DEFAULT_PAYMENT_TYPE;
    return DEFAULT_PURCHASE_TYPE;
  }

  try {
    // Prepare transaction data for Claude
    const transactionData = {
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      category: transaction.category || 'Unknown',
      isRefund,
      isPayment,
    };

    // Create the prompt for Claude
    const prompt = `
You are an expert accounting AI assistant. Your task is to determine the appropriate journal entry type code for a credit card transaction.

Available journal types:
- CCP: Credit Card Purchase - For recording credit card purchases and expenses
- CCY: Credit Card Payment - For recording payments made to credit card accounts
- CCR: Credit Card Refund - For recording credit card refunds, returns, and chargebacks

Transaction details:
${JSON.stringify(transactionData, null, 2)}

Based on the transaction details, determine the most appropriate journal type code.
Respond with ONLY the journal type code (CCP, CCY, or CCR) and nothing else.
`;

    // Call Claude 3.5 Sonnet
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 10,
      temperature: 0,
      system: "You are an expert accounting AI that determines the appropriate journal entry type for financial transactions. Respond with ONLY the journal type code (CCP, CCY, or CCR) and nothing else.",
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // Extract the journal type from Claude's response
    let journalType = '';
    
    // Handle different response content formats
    if (response.content[0] && 'text' in response.content[0]) {
      journalType = response.content[0].text.trim();
    } else if (response.content[0] && typeof response.content[0] === 'object') {
      // Fallback handling
      const content = response.content[0] as any;
      journalType = content.text || '';
    }
    
    // Validate the response
    if (['CCP', 'CCY', 'CCR'].includes(journalType)) {
      console.log(`[JournalTypeSelector] Claude determined journal type: ${journalType}`);
      return journalType;
    } else {
      console.log(`[JournalTypeSelector] Invalid journal type from Claude: ${journalType}, using default`);
      if (isRefund) return DEFAULT_REFUND_TYPE;
      if (isPayment) return DEFAULT_PAYMENT_TYPE;
      return DEFAULT_PURCHASE_TYPE;
    }
  } catch (error) {
    console.error('[JournalTypeSelector] Error calling Claude:', error);
    // Fallback to default types
    if (isRefund) return DEFAULT_REFUND_TYPE;
    if (isPayment) return DEFAULT_PAYMENT_TYPE;
    return DEFAULT_PURCHASE_TYPE;
  }
}

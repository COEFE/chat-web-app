import { determineJournalType } from './aiJournalTypeSelector';
import { CreditCardTransaction } from '../../types/creditCard';
import { AgentContext } from '../../types/agents';

/**
 * This utility function helps integrate the AI-powered journal type selector
 * with the existing credit card agent. It can be used as a drop-in replacement
 * for hardcoded journal types.
 * 
 * @param transaction The credit card transaction to analyze
 * @param context The agent context
 * @returns The AI-determined journal type code
 */
export async function getAIJournalType(
  transaction: CreditCardTransaction,
  context: AgentContext
): Promise<string> {
  try {
    // Log the integration
    console.log(`[AI Journal Type] Analyzing transaction: ${transaction.description}`);
    
    // Determine if this is a payment or refund based on transaction details
    const isPayment = transaction.amount > 0; // Credit to the account (payment)
    
    // Check for refund indicators in description or category
    const isRefund: boolean = !!(  // Convert to boolean with double negation
      transaction.description.toLowerCase().includes('refund') || 
      transaction.description.toLowerCase().includes('return') ||
      transaction.description.toLowerCase().includes('credit') ||
      (transaction.category && 
       (transaction.category.toLowerCase().includes('refund') || 
        transaction.category.toLowerCase().includes('return')))
    );
    
    // Use Claude to determine the journal type
    const journalType = await determineJournalType(transaction, isRefund, isPayment);
    
    console.log(`[AI Journal Type] AI determined journal type: ${journalType} for transaction: ${transaction.description}`);
    
    return journalType;
  } catch (error) {
    console.error('[AI Journal Type] Error determining journal type:', error);
    
    // Fallback to default types if AI fails
    if (transaction.amount > 0) return 'CCY'; // Credit Card Payment
    
    // Check for refund indicators as fallback
    if (transaction.description.toLowerCase().includes('refund') || 
        transaction.description.toLowerCase().includes('return')) {
      return 'CCR'; // Credit Card Refund
    }
    
    return 'CCP'; // Default to Credit Card Purchase
  }
}

/**
 * Example usage in a journal entry creation function:
 * 
 * // Instead of hardcoding "CCP" like this:
 * const journalResult = await sql.query(journalInsertQuery, [
 *   transaction.date,
 *   memo,
 *   "CCP", // journal_type for Credit Card Purchase
 *   true,  // is_posted
 *   "system", // created_by
 *   "cc_agent", // source
 *   context.userId,
 * ]);
 * 
 * // Use the AI-powered journal type selector:
 * const journalType = await getAIJournalType(transaction, context);
 * const journalResult = await sql.query(journalInsertQuery, [
 *   transaction.date,
 *   memo,
 *   journalType, // AI-determined journal type
 *   true,  // is_posted
 *   "system", // created_by
 *   "cc_agent", // source
 *   context.userId,
 * ]);
 */

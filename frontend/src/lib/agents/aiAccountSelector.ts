import { Anthropic } from '@anthropic-ai/sdk';
import { sql } from '@vercel/postgres';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
});

/**
 * Interface for account selection parameters
 */
export interface AccountSelectionParams {
  transactionDescription: string;
  transactionAmount: number;
  transactionDate: string;
  transactionType: string;
  vendorName: string;
  userId: string;
  creditCardLastFour?: string;
  transactionCategory?: string;
}

/**
 * Interface for account selection result
 */
export interface AccountSelectionResult {
  success: boolean;
  message: string;
  expenseAccountId?: number;
  apAccountId?: number;
  expenseAccountName?: string;
  apAccountName?: string;
  confidence?: number;
  error?: string;
}

/**
 * Use Claude 3.5 to intelligently select the appropriate expense and payable accounts
 * for a credit card refund or chargeback transaction
 */
export async function selectAccountsWithAI(params: AccountSelectionParams): Promise<AccountSelectionResult> {
  try {
    // First, get all available accounts for this user
    const accountsResult = await sql`
      SELECT id, name, code, account_type
      FROM accounts
      WHERE user_id = ${params.userId}
      AND is_active = true
      AND is_deleted = false
      ORDER BY name
    `;
    
    // Find credit card account directly if last four digits are provided
    let directCreditCardMatch = null;
    if (params.creditCardLastFour) {
      const creditCardAccounts = accountsResult.rows.filter(acc => 
        acc.account_type === 'Credit Card' && 
        (acc.code?.includes(params.creditCardLastFour!) || 
         acc.name?.includes(params.creditCardLastFour!))
      );
      
      if (creditCardAccounts.length > 0) {
        directCreditCardMatch = creditCardAccounts[0];
        console.log(`[aiAccountSelector] Found direct credit card match: ${directCreditCardMatch.name} (${directCreditCardMatch.id})`);
      }
    }

    const accounts = accountsResult.rows;
    
    if (!accounts || accounts.length === 0) {
      return {
        success: false,
        message: "No accounts found for user",
        error: "No accounts available"
      };
    }

    // Format accounts for Claude
    const accountsFormatted = accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      code: acc.code,
      type: acc.account_type
    }));

    // Create prompt for Claude
    const prompt = `
You are an AI accounting assistant specializing in credit card transactions. Your task is to select the most appropriate expense account and accounts payable (AP) account for a credit card transaction based on the details provided.

Transaction Details:
- Description: ${params.transactionDescription}
- Amount: ${params.transactionAmount}
- Date: ${params.transactionDate}
- Type: ${params.transactionType}
- Vendor: ${params.vendorName}
${params.creditCardLastFour ? `- Credit Card Last Four: ${params.creditCardLastFour}` : ''}
${params.transactionCategory ? `- Category: ${params.transactionCategory}` : ''}

Available Accounts:
${JSON.stringify(accountsFormatted, null, 2)}

For a ${params.transactionType} transaction, I need to select:

1. An appropriate expense account that matches the nature of this transaction
   - For refunds or chargebacks, select an expense account that best matches what was originally purchased
   - Look for accounts with names related to the vendor or purchase type (e.g., "Office Supplies" for office supply purchases)

2. The correct accounts payable (AP) account that should be used for this vendor's credit
   - For credit card transactions, the AP account should typically be the credit card account
   - Look for accounts with type "Credit Card" and matching the credit card details (last four digits: ${params.creditCardLastFour || 'N/A'})
   - If no exact match is found, select the most appropriate credit card account

IMPORTANT: For the AP account, prioritize accounts with type "Credit Card" that match the transaction details.

Please respond in JSON format only with the following structure:
{
  "expenseAccountId": [ID of selected expense account],
  "apAccountId": [ID of selected AP account],
  "expenseAccountName": [Name of selected expense account],
  "apAccountName": [Name of selected AP account],
  "confidence": [Your confidence score from 0-1],
  "reasoning": [Brief explanation of your selection]
}
`;

    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1000,
      temperature: 0.2,
      system: "You are an expert accounting AI that specializes in account classification for financial transactions. Respond only with the requested JSON format.",
      messages: [
        { role: "user", content: prompt }
      ]
    });

    // Parse Claude's response
    const responseContent = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      console.error("[aiAccountSelector] Failed to parse Claude response:", responseContent);
      return {
        success: false,
        message: "Failed to parse AI response",
        error: "Invalid AI response format"
      };
    }

    const accountSelection = JSON.parse(jsonMatch[0]);
    
    // Validate the account selection
    if (!accountSelection.expenseAccountId || !accountSelection.apAccountId) {
      console.error("[aiAccountSelector] Invalid account selection:", accountSelection);
      return {
        success: false,
        message: "AI could not determine appropriate accounts",
        error: "Missing account IDs in AI response"
      };
    }

    // Verify that the selected accounts exist
    let expenseAccount = accounts.find(acc => acc.id === accountSelection.expenseAccountId);
    let apAccount = accounts.find(acc => acc.id === accountSelection.apAccountId);
    
    // If we have a direct credit card match but AI didn't select it, override the AI selection
    if (directCreditCardMatch && (!apAccount || apAccount.account_type !== 'Credit Card')) {
      console.log(`[aiAccountSelector] Overriding AI AP account selection with direct credit card match`);
      apAccount = directCreditCardMatch;
      accountSelection.apAccountId = directCreditCardMatch.id;
      accountSelection.apAccountName = directCreditCardMatch.name;
    }
    
    // Find fallback accounts if needed
    if (!expenseAccount) {
      // Find a default expense account
      const fallbackExpense = accounts.find(acc => 
        acc.account_type === 'Expense' && 
        (acc.name.toLowerCase().includes('miscellaneous') || acc.name.toLowerCase().includes('general'))
      );
      
      if (fallbackExpense) {
        console.log(`[aiAccountSelector] Using fallback expense account: ${fallbackExpense.name}`);
        expenseAccount = fallbackExpense;
        accountSelection.expenseAccountId = fallbackExpense.id;
        accountSelection.expenseAccountName = fallbackExpense.name;
      }
    }
    
    if (!apAccount) {
      // Find a default credit card account
      const fallbackAP = accounts.find(acc => acc.account_type === 'Credit Card');
      
      if (fallbackAP) {
        console.log(`[aiAccountSelector] Using fallback credit card account: ${fallbackAP.name}`);
        apAccount = fallbackAP;
        accountSelection.apAccountId = fallbackAP.id;
        accountSelection.apAccountName = fallbackAP.name;
      }
    }
    
    if (!expenseAccount || !apAccount) {
      console.error("[aiAccountSelector] Could not find valid accounts even with fallbacks:", {
        expenseAccountId: accountSelection.expenseAccountId,
        apAccountId: accountSelection.apAccountId,
        availableIds: accounts.map(acc => acc.id)
      });
      return {
        success: false,
        message: "Selected accounts not found",
        error: "Could not find valid accounts even with fallbacks"
      };
    }

    console.log("[aiAccountSelector] AI selected accounts:", {
      expenseAccount: `${expenseAccount.name} (${expenseAccount.id})`,
      apAccount: `${apAccount.name} (${apAccount.id})`,
      confidence: accountSelection.confidence,
      reasoning: accountSelection.reasoning
    });

    return {
      success: true,
      message: "Successfully selected accounts using AI",
      expenseAccountId: accountSelection.expenseAccountId,
      apAccountId: accountSelection.apAccountId,
      expenseAccountName: accountSelection.expenseAccountName,
      apAccountName: accountSelection.apAccountName,
      confidence: accountSelection.confidence
    };

  } catch (error: any) {
    console.error("[aiAccountSelector] Error selecting accounts with AI:", error);
    return {
      success: false,
      message: "Error selecting accounts",
      error: error.message || "Unknown error"
    };
  }
}

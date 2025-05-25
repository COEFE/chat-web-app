import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AccountNotesRequest {
  name: string;
  accountType: string;
  accountCode: string;
  expenseDescription?: string;
  expenseType?: string;
  businessContext?: string;
}

interface AccountNotesResponse {
  notes: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'ai' | 'fallback';
  reasoning?: string;
}

/**
 * Generate intelligent account notes using Claude 3.5 Sonnet AI
 */
export async function generateAIAccountNotes(request: AccountNotesRequest): Promise<AccountNotesResponse> {
  try {
    console.log(`[AI Notes Generator] Generating notes for account: ${request.name} (${request.accountType})`);
    
    const prompt = `You are an expert accounting assistant helping to create detailed, professional notes for a General Ledger account.

Account Details:
- Name: ${request.name}
- Type: ${request.accountType}
- Code: ${request.accountCode}
- Expense Description: ${request.expenseDescription || 'Not provided'}
- Expense Type: ${request.expenseType || 'Not provided'}
- Business Context: ${request.businessContext || 'General business'}

Please generate comprehensive account notes that explain:
1. The PURPOSE of this account (what it tracks)
2. How it should be USED (what types of transactions belong here)
3. Any relevant ACCOUNTING PRINCIPLES or best practices
4. BUSINESS CONTEXT specific to this account type

Requirements:
- Write in professional accounting language
- Be specific and actionable
- Include practical usage guidance
- Keep it concise but comprehensive (2-3 sentences)
- Start with "This ${request.accountType.toLowerCase()} account..."

Examples of good notes:
- "This asset account tracks cash and cash equivalents for the main operating account. Used to record deposits, withdrawals, and daily cash transactions. Maintain accurate reconciliation with bank statements."
- "This expense account tracks professional service fees including legal, accounting, and consulting expenses. Used to categorize payments to external professionals and maintain compliance documentation."
- "This liability account tracks credit card balances for business purchases. Used to record credit card transactions, payments, and interest charges while maintaining detailed transaction records."

Generate professional account notes now:`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const aiNotes = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    
    if (aiNotes && aiNotes.length > 20) {
      console.log(`[AI Notes Generator] Successfully generated AI notes: ${aiNotes.substring(0, 100)}...`);
      
      return {
        notes: aiNotes,
        confidence: 'high',
        method: 'ai',
        reasoning: 'Generated using Claude 3.5 Sonnet with account context'
      };
    } else {
      console.log('[AI Notes Generator] AI response was too short, falling back to pattern-based notes');
      return generateFallbackNotes(request);
    }
    
  } catch (error) {
    console.error('[AI Notes Generator] Error generating AI notes:', error);
    return generateFallbackNotes(request);
  }
}

/**
 * Fallback pattern-based notes generation
 */
function generateFallbackNotes(request: AccountNotesRequest): AccountNotesResponse {
  const { name, accountType, expenseDescription, expenseType } = request;
  const lowerName = name.toLowerCase();
  const baseNote = `This ${accountType.toLowerCase()} account tracks`;
  
  let notes = '';
  
  // Asset account notes
  if (accountType === 'asset') {
    if (lowerName.includes('cash') || lowerName.includes('checking') || lowerName.includes('savings')) {
      notes = `${baseNote} cash and cash equivalents for ${name}. Used to record deposits, withdrawals, and cash transactions.`;
    } else if (lowerName.includes('receivable') || lowerName.includes('ar')) {
      notes = `${baseNote} amounts owed to the company by customers for ${name}. Used to record sales on credit and customer payments.`;
    } else if (lowerName.includes('inventory')) {
      notes = `${baseNote} inventory and stock for ${name}. Used to record purchases, sales, and inventory adjustments.`;
    } else if (lowerName.includes('equipment') || lowerName.includes('asset') || lowerName.includes('property')) {
      notes = `${baseNote} fixed assets for ${name}. Used to record asset purchases, depreciation, and disposals.`;
    } else if (lowerName.includes('prepaid')) {
      notes = `${baseNote} prepaid expenses for ${name}. Used to record advance payments and their amortization.`;
    } else {
      notes = `${baseNote} asset values for ${name}. Used to record asset transactions and value changes.`;
    }
  }
  
  // Liability account notes
  else if (accountType === 'liability') {
    if (lowerName.includes('credit card') || lowerName.includes('amex') || lowerName.includes('visa') || lowerName.includes('mastercard')) {
      notes = `${baseNote} credit card balances for ${name}. Used to record purchases, payments, and interest charges.`;
    } else if (lowerName.includes('payable') || lowerName.includes('ap')) {
      notes = `${baseNote} amounts owed to vendors for ${name}. Used to record bills received and payments made.`;
    } else if (lowerName.includes('loan') || lowerName.includes('debt') || lowerName.includes('mortgage')) {
      notes = `${baseNote} loan balances for ${name}. Used to record loan proceeds, payments, and interest.`;
    } else if (lowerName.includes('tax') || lowerName.includes('payroll')) {
      notes = `${baseNote} tax and payroll liabilities for ${name}. Used to record withholdings and tax obligations.`;
    } else {
      notes = `${baseNote} liability amounts for ${name}. Used to record obligations and payments to creditors.`;
    }
  }
  
  // Equity account notes
  else if (accountType === 'equity') {
    if (lowerName.includes('capital') || lowerName.includes('investment')) {
      notes = `${baseNote} owner capital and investments for ${name}. Used to record capital contributions and withdrawals.`;
    } else if (lowerName.includes('retained') || lowerName.includes('earnings')) {
      notes = `${baseNote} retained earnings for ${name}. Used to record accumulated profits and losses.`;
    } else if (lowerName.includes('draw') || lowerName.includes('distribution')) {
      notes = `${baseNote} owner draws and distributions for ${name}. Used to record money taken out by owners.`;
    } else {
      notes = `${baseNote} equity balances for ${name}. Used to record ownership interests and retained earnings.`;
    }
  }
  
  // Revenue account notes
  else if (accountType === 'revenue') {
    if (lowerName.includes('sales') || lowerName.includes('revenue')) {
      notes = `${baseNote} sales revenue for ${name}. Used to record income from primary business operations.`;
    } else if (lowerName.includes('service') || lowerName.includes('consulting')) {
      notes = `${baseNote} service revenue for ${name}. Used to record income from services provided.`;
    } else if (lowerName.includes('interest') || lowerName.includes('investment')) {
      notes = `${baseNote} investment and interest income for ${name}. Used to record passive income sources.`;
    } else {
      notes = `${baseNote} revenue streams for ${name}. Used to record income from business operations.`;
    }
  }
  
  // Expense account notes with enhanced context
  else if (accountType === 'expense') {
    // Use expense type for more specific categorization
    if (expenseType === 'credit_card') {
      notes = `${baseNote} credit card expenses for ${name}. Used to categorize and monitor credit card purchases and fees.`;
    } else if (lowerName.includes('office') || lowerName.includes('supplies')) {
      notes = `${baseNote} office and supply costs for ${name}. Used to record purchases of materials and supplies.`;
    } else if (lowerName.includes('travel') || lowerName.includes('meal') || lowerName.includes('entertainment')) {
      notes = `${baseNote} travel and entertainment expenses for ${name}. Used to record business travel and meal costs.`;
    } else if (lowerName.includes('professional') || lowerName.includes('legal') || lowerName.includes('accounting')) {
      notes = `${baseNote} professional service fees for ${name}. Used to record legal, accounting, and consulting expenses.`;
    } else if (lowerName.includes('marketing') || lowerName.includes('advertising')) {
      notes = `${baseNote} marketing and advertising costs for ${name}. Used to record promotional and marketing expenses.`;
    } else if (lowerName.includes('rent') || lowerName.includes('lease')) {
      notes = `${baseNote} rent and lease payments for ${name}. Used to record facility and equipment rental costs.`;
    } else if (lowerName.includes('utilities') || lowerName.includes('phone') || lowerName.includes('internet')) {
      notes = `${baseNote} utility and communication expenses for ${name}. Used to record monthly service costs.`;
    } else {
      notes = `${baseNote} business expenses for ${name}. Used to categorize and monitor operational costs.`;
    }
  }
  
  // Fallback for unknown account types
  else {
    notes = `This ${accountType.toLowerCase()} account tracks financial activity for ${name}. Used to record relevant transactions and maintain accurate financial records.`;
  }
  
  return {
    notes,
    confidence: 'medium',
    method: 'fallback',
    reasoning: 'Generated using pattern-based rules as fallback'
  };
}

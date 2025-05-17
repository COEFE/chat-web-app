import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
});

// Verify Anthropic API key is available
if (!anthropic.apiKey) {
  console.error('[API determine-payment-account] Anthropic API key is missing');
}

interface Account {
  id: number;
  name: string;
}

interface DeterminePaymentAccountResponse {
  accountId: number | null;
  message: string;
  error?: string;
}

async function findPaymentAccountLogic(userId: string, paymentMethod?: string, billInfo?: any): Promise<{ accountId: number | null; message: string }> {
  console.log(`[API determine-payment-account] Attempting to find payment account for userId: ${userId}, payment method: '${paymentMethod || 'not specified'}'`);
  const defaultFallbackAccountId = 1000; // A general fallback ID

  // First, let's log all available accounts for debugging
  try {
    const { rows: allAccounts } = await sql<Account & { account_type: string, user_id: string | null }>`
      SELECT id, name, account_type, user_id
      FROM accounts
      LIMIT 20;
    `;
    
    console.log(`[API determine-payment-account] DEBUG: Found ${allAccounts.length} total accounts in the database:`);
    allAccounts.forEach(acc => {
      console.log(`[API determine-payment-account] DEBUG: Account ID: ${acc.id}, Name: '${acc.name}', Type: '${acc.account_type}', User: ${acc.user_id || 'NULL'}`);
    });
  } catch (debugError) {
    console.error(`[API determine-payment-account] Error during debug account listing:`, debugError);
    // Continue with the main logic even if debug listing fails
  }

  let availablePaymentAccounts: Account[] = [];
  try {
    console.log(`[API determine-payment-account] Searching for payment accounts for user ${userId}`);
    
    // Look for accounts that could be used for payments (cash, bank, operating accounts)
    const { rows } = await sql<Account>`
      SELECT id, name 
      FROM accounts 
      WHERE (user_id = ${userId} OR user_id IS NULL)
      AND (
        account_type ILIKE '%cash%' OR
        account_type ILIKE '%bank%' OR
        account_type ILIKE '%checking%' OR
        account_type ILIKE '%operating%' OR
        account_type ILIKE '%savings%' OR
        name ILIKE '%cash%' OR
        name ILIKE '%bank%' OR
        name ILIKE '%checking%' OR
        name ILIKE '%operating%' OR
        name ILIKE '%savings%'
      )
      ORDER BY user_id DESC NULLS LAST, name ASC; -- Prefer user-specific, then by name
    `;
    
    console.log(`[API determine-payment-account] Found ${rows.length} potential payment accounts with our criteria.`);
    availablePaymentAccounts = rows;
  } catch (dbError) {
    console.error(`[API determine-payment-account] DB error during payment account lookup:`, dbError);
    console.warn(`[API determine-payment-account] Falling back to default placeholder ID ${defaultFallbackAccountId} due to DB error.`);
    return { accountId: defaultFallbackAccountId, message: `Error querying payment accounts, using fallback ID ${defaultFallbackAccountId}.` };
  }

  if (availablePaymentAccounts.length === 0) {
    console.warn(`[API determine-payment-account] No payment accounts found with specific criteria. Trying to find ANY account as fallback.`);
    
    try {
      // Try to find accounts with specific IDs that might be valid payment accounts
      console.log(`[API determine-payment-account] Trying specific account IDs that might be valid payment accounts`);
      const { rows: specificIdRows } = await sql<Account>`
        SELECT id, name 
        FROM accounts 
        WHERE id IN (1000, 1001, 1002, 1100, 1200, 1300, 1400, 1500, 10, 11, 12, 13, 14, 15, 100, 101, 102, 110, 120)
        LIMIT 5;
      `;
      
      if (specificIdRows.length > 0) {
        const specificIdAccount = specificIdRows[0];
        console.warn(`[API determine-payment-account] Found account with specific ID: ${specificIdAccount.id} ('${specificIdAccount.name}').`);
        return { accountId: specificIdAccount.id, message: `Using account with specific ID: ${specificIdAccount.name}` };
      }
      
      // Last resort: find ANY account that belongs to the user
      const { rows } = await sql<Account>`
        SELECT id, name 
        FROM accounts 
        WHERE user_id = ${userId}
        LIMIT 1;
      `;
      
      if (rows.length > 0) {
        const fallbackAccount = rows[0];
        console.warn(`[API determine-payment-account] Found general fallback account: ID ${fallbackAccount.id} ('${fallbackAccount.name}').`);
        return { accountId: fallbackAccount.id, message: `Using general account as fallback: ${fallbackAccount.name}` };
      }
    } catch (fallbackError) {
      console.error(`[API determine-payment-account] Error finding fallback account:`, fallbackError);
    }
    
    console.warn(`[API determine-payment-account] No accounts found at all for user ${userId}. Falling back to placeholder ID ${defaultFallbackAccountId}.`);
    return { accountId: defaultFallbackAccountId, message: `No accounts found, using fallback ID ${defaultFallbackAccountId}.` };
  }

  if (availablePaymentAccounts.length === 1) {
    const singleAccount = availablePaymentAccounts[0];
    console.log(`[API determine-payment-account] Exactly one payment account found: ID ${singleAccount.id} ('${singleAccount.name}'). Using this account.`);
    return { accountId: singleAccount.id, message: `Using the only available payment account: ${singleAccount.name}` };
  }

  // If payment method is specified, try to match an account based on that
  if (paymentMethod) {
    const normalizedMethod = paymentMethod.toLowerCase();
    const methodKeywords = {
      'check': ['check', 'checking'],
      'cash': ['cash'],
      'credit card': ['credit', 'card', 'creditcard'],
      'bank transfer': ['bank', 'transfer', 'wire'],
      'ach': ['ach', 'electronic', 'direct deposit'],
    };
    
    // Find matching keywords for the payment method
    let relevantKeywords: string[] = [];
    for (const [method, keywords] of Object.entries(methodKeywords)) {
      if (normalizedMethod.includes(method) || keywords.some(kw => normalizedMethod.includes(kw))) {
        relevantKeywords = [...relevantKeywords, ...keywords];
      }
    }
    
    if (relevantKeywords.length > 0) {
      // Look for accounts that match the payment method
      const matchingAccounts = availablePaymentAccounts.filter(acc => {
        const accountNameLower = acc.name.toLowerCase();
        return relevantKeywords.some(kw => accountNameLower.includes(kw));
      });
      
      if (matchingAccounts.length > 0) {
        const methodMatchedAccount = matchingAccounts[0];
        console.log(`[API determine-payment-account] Found account matching payment method '${paymentMethod}': ID ${methodMatchedAccount.id} ('${methodMatchedAccount.name}').`);
        return { accountId: methodMatchedAccount.id, message: `Selected account matching payment method '${paymentMethod}': ${methodMatchedAccount.name}` };
      }
    }
  }

  // Multiple payment accounts available, let's use AI to choose
  console.log(`[API determine-payment-account] Multiple payment accounts found (${availablePaymentAccounts.length}). Engaging AI for selection.`);
  
  const accountsListText = availablePaymentAccounts.map(acc => `- ID: ${acc.id}, Name: "${acc.name}"`).join('\n');
  const prompt = `
    Given the following payment details and a list of available payment accounts, 
    please choose the most appropriate payment account ID. 
    Only return the numeric ID of the chosen account, nothing else.

    Payment Details:
    - Payment Method: "${paymentMethod || 'Not specified'}"
    - Bill Info: ${JSON.stringify(billInfo || {}, null, 2)}

    Available Payment Accounts:
    ${accountsListText}

    Chosen Payment Account ID:`;

  // Check if Anthropic API key is available before attempting to call the API
  if (!anthropic.apiKey) {
    console.error(`[API determine-payment-account] Cannot use AI for selection: Anthropic API key is missing`);
    // Skip AI selection and use intelligent matching instead
  } else {
    try {
      console.log(`[API determine-payment-account] Sending prompt to Claude...`);
      
      // Use Claude's messages API with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const response = await anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          max_tokens: 20,
          system: "You are a helpful assistant that selects the most appropriate payment account based on the user's query. Only respond with the account ID number, nothing else.",
          messages: [{
            role: 'user',
            content: prompt
          }],
        }, { signal: controller.signal });
        
        clearTimeout(timeoutId);
        
        // Extract the response text - handle different content types
        let aiResponseText = '';
        if (response.content && response.content.length > 0) {
          const contentBlock = response.content[0];
          // Check if it's a text block
          if ('type' in contentBlock && contentBlock.type === 'text') {
            aiResponseText = contentBlock.text;
          }
        }
        
        console.log(`[API determine-payment-account] Claude response: "${aiResponseText}"`);

        const chosenIdStr = aiResponseText.trim();
        const chosenId = parseInt(chosenIdStr, 10);

        if (isNaN(chosenId)) {
          console.warn(`[API determine-payment-account] Claude returned a non-numeric ID: "${chosenIdStr}". Will use intelligent matching.`);
        } else {
          const isValidChoice = availablePaymentAccounts.some(acc => acc.id === chosenId);
          if (isValidChoice) {
            const chosenAccount = availablePaymentAccounts.find(acc => acc.id === chosenId);
            console.log(`[API determine-payment-account] Claude selected Payment Account ID: ${chosenId} ('${chosenAccount?.name}').`);
            return { accountId: chosenId, message: `AI selected Payment Account: ${chosenAccount?.name}` };
          } else {
            console.warn(`[API determine-payment-account] Claude selected an invalid/unknown Payment Account ID: ${chosenId}. Will use intelligent matching.`);
          }
        }
      } catch (timeoutError) {
        clearTimeout(timeoutId);
        console.error(`[API determine-payment-account] Claude request timed out or was aborted:`, timeoutError);
      }
    } catch (aiError) {
      console.error(`[API determine-payment-account] Error during Claude selection:`, aiError);
      // Continue to intelligent matching
    }
  }
  
  // If we reach here, AI selection failed or was skipped - use intelligent matching instead

  // Fallback if AI fails, returns invalid choice, or multiple accounts exist and AI is skipped for some reason
  const fallbackAccount = availablePaymentAccounts[0]; // Fallback to the first available account
  console.warn(`[API determine-payment-account] AI selection failed or was inconclusive. Falling back to first available payment account: ID ${fallbackAccount.id} ('${fallbackAccount.name}').`);
  return { accountId: fallbackAccount.id, message: `Fell back to payment account: ${fallbackAccount.name}` };
}

export async function POST(request: NextRequest): Promise<NextResponse<DeterminePaymentAccountResponse>> {
  try {
    const user = await auth(request); // This should handle token verification
    if (!user || !user.uid) {
      console.error('[API determine-payment-account] Authentication failed: No user UID.');
      return NextResponse.json({ accountId: null, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentMethod, billInfo } = body;

    console.log(`[API determine-payment-account] Received request for user: ${user.uid}, payment method: ${paymentMethod || 'not specified'}`);

    const result = await findPaymentAccountLogic(user.uid, paymentMethod, billInfo);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[API determine-payment-account] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ accountId: null, message: errorMessage, error: 'Internal server error' }, { status: 500 });
  }
}

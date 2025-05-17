import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { sql } from '@vercel/postgres';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// Initialize AI clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface Account {
  id: number;
  name: string;
  account_type?: string;
}

interface DetermineApAccountResponse {
  accountId: number | null;
  message: string;
  error?: string;
}

async function findApAccountLogic(userId: string, vendorName: string, description: string, billInfo: any): Promise<{ accountId: number | null; message: string }> {
  console.log(`[API determine-ap-account] Attempting to find AP account for userId: ${userId}, vendor: '${vendorName}', description: '${description}'`);

  // Step 1: Get ALL accounts for this user and system accounts to ensure we have valid options
  let allUserAccounts: Account[] = [];
  try {
    const { rows } = await sql<Account & { account_type: string, user_id: string | null }>`
      SELECT id, name, account_type, user_id
      FROM accounts
      WHERE (user_id = ${userId} OR user_id IS NULL)
      ORDER BY user_id NULLS LAST, id ASC;
    `;
    
    console.log(`[API determine-ap-account] Found ${rows.length} total accounts for user ${userId}`);
    allUserAccounts = rows.map(acc => ({
      id: acc.id,
      name: acc.name,
      account_type: acc.account_type
    }));
    
    if (allUserAccounts.length === 0) {
      console.error(`[API determine-ap-account] No accounts found for user ${userId} or system accounts`);
      return { accountId: null, message: `No accounts found. Please create accounts first.` };
    }
  } catch (dbError) {
    console.error(`[API determine-ap-account] DB error during account lookup:`, dbError);
    return { accountId: null, message: `Error querying accounts: ${dbError instanceof Error ? dbError.message : String(dbError)}` };
  }

  // Step 2: Try to find accounts that are likely to be AP accounts
  let likelyApAccounts: Account[] = [];
  try {
    // Find accounts that match AP-related patterns
    likelyApAccounts = allUserAccounts.filter(acc => {
      const name = (acc.name || '').toLowerCase();
      const type = (acc.account_type || '').toLowerCase();
      
      return (
        type.includes('liability') ||
        type.includes('payable') ||
        type.includes('ap') ||
        name.includes('accounts payable') ||
        name.includes('payable') ||
        name.includes('ap')
      );
    });
    
    console.log(`[API determine-ap-account] Found ${likelyApAccounts.length} likely AP accounts based on name/type patterns`);
  } catch (filterError) {
    console.error(`[API determine-ap-account] Error filtering AP accounts:`, filterError);
    // Continue with all accounts if filtering fails
  }

  // If we found likely AP accounts, use those; otherwise use all accounts
  const accountsToConsider = likelyApAccounts.length > 0 ? likelyApAccounts : allUserAccounts;
  
  // Step 3: If only one account to consider, return it
  if (accountsToConsider.length === 1) {
    const singleAccount = accountsToConsider[0];
    console.log(`[API determine-ap-account] Only one account available: ID ${singleAccount.id} ('${singleAccount.name}'). Using this account.`);
    return { accountId: singleAccount.id, message: `Using the only available account: ${singleAccount.name}` };
  }

  // Step 4: Use Claude to choose the most appropriate account
  console.log(`[API determine-ap-account] Multiple accounts found (${accountsToConsider.length}). Using Claude for selection.`);
  
  const accountsListText = accountsToConsider.map(acc => 
    `- ID: ${acc.id}, Name: "${acc.name}", Type: "${acc.account_type || 'Unknown'}"`
  ).join('\n');
  
  const systemPrompt = `You are an accounting AI assistant tasked with selecting the most appropriate Accounts Payable (AP) account for recording a bill. 
  AP accounts are typically liability accounts used to track money owed to vendors. 
  Analyze the bill details and available accounts, then select the MOST appropriate account ID. 
  Return ONLY the numeric ID of the chosen account, nothing else.`;
  
  const userMessage = `
  Bill Details:
  - Vendor Name: "${vendorName}"
  - Description: "${description}"
  - Other Bill Info: ${JSON.stringify(billInfo || {}, null, 2)}

  Available Accounts:
  ${accountsListText}

  Which account ID is most appropriate for recording this bill as an Accounts Payable entry?`;

  try {
    console.log(`[API determine-ap-account] Sending prompt to Claude...`);
    
    const response = await anthropic.messages.create({
      model: 'claude-3-opus-20240229',
      max_tokens: 10,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    
    // Extract the response text from Claude
    let aiResponseText = '';
    if (response.content && response.content.length > 0 && 'text' in response.content[0]) {
      aiResponseText = response.content[0].text || '';
    }
    console.log(`[API determine-ap-account] Claude response: "${aiResponseText}"`);

    const chosenIdStr = aiResponseText.trim();
    const chosenId = parseInt(chosenIdStr, 10);

    if (isNaN(chosenId)) {
      console.warn(`[API determine-ap-account] Claude returned a non-numeric ID: "${chosenIdStr}". Will try fallback.`);
    } else {
      const isValidChoice = accountsToConsider.some(acc => acc.id === chosenId);
      if (isValidChoice) {
        const chosenAccount = accountsToConsider.find(acc => acc.id === chosenId);
        console.log(`[API determine-ap-account] Claude selected Account ID: ${chosenId} ('${chosenAccount?.name}').`);
        return { 
          accountId: chosenId, 
          message: `AI selected account: ${chosenAccount?.name} (${chosenAccount?.account_type || 'Unknown type'})` 
        };
      } else {
        // Check if the ID exists in the full account list
        const existsInAllAccounts = allUserAccounts.some(acc => acc.id === chosenId);
        if (existsInAllAccounts) {
          const account = allUserAccounts.find(acc => acc.id === chosenId);
          console.log(`[API determine-ap-account] Claude selected a valid account from the full list: ID ${chosenId} ('${account?.name}').`);
          return { 
            accountId: chosenId, 
            message: `AI selected account: ${account?.name} (${account?.account_type || 'Unknown type'})` 
          };
        }
        
        console.warn(`[API determine-ap-account] Claude selected an invalid Account ID: ${chosenId}. Will try fallback.`);
      }
    }
  } catch (aiError) {
    console.error(`[API determine-ap-account] Error during Claude selection:`, aiError);
    // Fall through to fallback if AI errors
  }

  // Step 5: Fallback - look for accounts with specific types that are likely to be AP accounts
  try {
    // Try to find a liability account first
    const liabilityAccount = allUserAccounts.find(acc => 
      (acc.account_type || '').toLowerCase().includes('liability')
    );
    
    if (liabilityAccount) {
      console.log(`[API determine-ap-account] Fallback: Found liability account: ID ${liabilityAccount.id} ('${liabilityAccount.name}').`);
      return { 
        accountId: liabilityAccount.id, 
        message: `Using liability account as fallback: ${liabilityAccount.name}` 
      };
    }
    
    // If no liability account, use the first account as last resort
    const firstAccount = allUserAccounts[0];
    console.log(`[API determine-ap-account] Last resort fallback: Using first available account: ID ${firstAccount.id} ('${firstAccount.name}').`);
    return { 
      accountId: firstAccount.id, 
      message: `Using account as fallback: ${firstAccount.name}` 
    };
  } catch (fallbackError) {
    console.error(`[API determine-ap-account] Error in fallback selection:`, fallbackError);
    
    // Absolute last resort - if we have any account ID, return it
    if (allUserAccounts.length > 0) {
      const lastResortAccount = allUserAccounts[0];
      return { 
        accountId: lastResortAccount.id, 
        message: `Using account as emergency fallback: ${lastResortAccount.name}` 
      };
    }
    
    // If we get here, we truly have no valid accounts
    return { 
      accountId: null, 
      message: `No valid accounts found. Please create accounts first.` 
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<DetermineApAccountResponse>> {
  try {
    const user = await auth(request); // This should handle token verification
    if (!user || !user.uid) {
      console.error('[API determine-ap-account] Authentication failed: No user UID.');
      return NextResponse.json({ accountId: null, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { vendorName, description, billInfo } = body;

    if (!vendorName || typeof vendorName !== 'string') {
      return NextResponse.json({ accountId: null, message: 'vendorName is required and must be a string', error: 'Bad Request' }, { status: 400 });
    }
    if (!description || typeof description !== 'string') {
      // Description might be optional for some AP logic, but good to have for context
      console.warn('[API determine-ap-account] Description not provided or not a string.');
    }

    console.log(`[API determine-ap-account] Received request for user: ${user.uid}, vendor: ${vendorName}`);

    const result = await findApAccountLogic(user.uid, vendorName, description || '', billInfo || {});

    return NextResponse.json(result);

  } catch (error) {
    console.error('[API determine-ap-account] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ accountId: null, message: errorMessage, error: 'Internal server error' }, { status: 500 });
  }
}

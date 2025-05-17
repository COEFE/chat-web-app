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
  code?: string;
}

interface DetermineExpenseAccountResponse {
  accountId: number | null;
  message: string;
  error?: string;
}

async function findExpenseAccountLogic(
  userId: string, 
  description: string, 
  vendorName: string = '', 
  amount: string = '', 
  accountName: string = '', 
  accountCode: string = '',
  providedAccounts: Account[] = []
): Promise<{ accountId: number | null; message: string }> {
  console.log(`[API determine-expense-account] Finding expense account for userId: ${userId}, description: '${description}', vendor: '${vendorName}'`);

  // Step 1: Get expense accounts for this user
  let expenseAccounts: Account[] = [];
  
  // If accounts were provided in the request, use those
  if (providedAccounts && providedAccounts.length > 0) {
    console.log(`[API determine-expense-account] Using ${providedAccounts.length} accounts provided in the request`);
    expenseAccounts = providedAccounts;
  } else {
    // Otherwise query the database
    try {
      // First try to get user-specific accounts, then fall back to system accounts (null user_id)
      const { rows } = await sql<Account & { account_type: string, user_id: string | null }>`
        SELECT id, name, account_type, code, user_id
        FROM accounts
        WHERE (user_id = ${userId} OR user_id IS NULL)
        AND (account_type = 'Expense' OR LOWER(account_type) LIKE '%expense%')
        ORDER BY user_id NULLS LAST, id ASC;
      `;
      
      console.log(`[API determine-expense-account] Found ${rows.length} expense accounts for user ${userId}`);
      expenseAccounts = rows.map(acc => ({
        id: acc.id,
        name: acc.name,
        account_type: acc.account_type,
        code: acc.code
      }));
    } catch (dbError) {
      console.error(`[API determine-expense-account] DB error during account lookup:`, dbError);
      
      // If DB query fails, try to get all accounts as fallback
      try {
        // Get all accounts for this user or system accounts (null user_id)
        const { rows } = await sql<Account & { account_type: string, user_id: string | null }>`
          SELECT id, name, account_type, code, user_id
          FROM accounts
          WHERE (user_id = ${userId} OR user_id IS NULL)
          ORDER BY user_id NULLS LAST, id ASC;
        `;
        
        console.log(`[API determine-expense-account] Fallback: Found ${rows.length} total accounts for user ${userId}`);
        expenseAccounts = rows.map(acc => ({
          id: acc.id,
          name: acc.name,
          account_type: acc.account_type,
          code: acc.code
        }));
      } catch (fallbackError) {
        console.error(`[API determine-expense-account] Fallback DB error:`, fallbackError);
        return { accountId: null, message: `Error querying accounts: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}` };
      }
    }
  }
  
  if (expenseAccounts.length === 0) {
    console.error(`[API determine-expense-account] No expense accounts found for user ${userId}`);
    return { accountId: null, message: `No expense accounts found for this user. Please create accounts first.` };
  }

  // Step 2: If only one account available, use it
  if (expenseAccounts.length === 1) {
    const singleAccount = expenseAccounts[0];
    console.log(`[API determine-expense-account] Only one expense account available: ID ${singleAccount.id} ('${singleAccount.name}'). Using this account.`);
    return { accountId: singleAccount.id, message: `Using the only available expense account: ${singleAccount.name}` };
  }

  // Step 3: If accountName or accountCode provided, try direct matching
  if (accountName || accountCode) {
    const directMatch = expenseAccounts.find(acc => 
      (accountName && acc.name.toLowerCase() === accountName.toLowerCase()) ||
      (accountCode && acc.code && acc.code.toLowerCase() === accountCode.toLowerCase())
    );
    
    if (directMatch) {
      console.log(`[API determine-expense-account] Found direct match based on provided account name/code: ID ${directMatch.id} ('${directMatch.name}')`);
      return { accountId: directMatch.id, message: `Found exact match for provided account: ${directMatch.name}` };
    }
  }

  // Step 4: Use Claude to choose the most appropriate account
  console.log(`[API determine-expense-account] Multiple accounts found (${expenseAccounts.length}). Using Claude for selection.`);
  
  const accountsListText = expenseAccounts.map(acc => 
    `- ID: ${acc.id}, Name: "${acc.name}", Type: "${acc.account_type || 'Unknown'}", Code: "${acc.code || 'None'}"`
  ).join('\n');
  
  const systemPrompt = `You are an accounting AI assistant tasked with selecting the most appropriate expense account for a transaction. 
  Analyze the transaction details and available accounts, then select the MOST appropriate account ID. 
  Return ONLY the numeric ID of the chosen account, nothing else.`;
  
  const userMessage = `
  Transaction Details:
  - Vendor Name: "${vendorName}"
  - Description: "${description}"
  - Amount: ${amount}
  - Suggested Account Name: "${accountName}"
  - Suggested Account Code: "${accountCode}"

  Available Expense Accounts:
  ${accountsListText}

  Which account ID is most appropriate for recording this expense?`;

  try {
    console.log(`[API determine-expense-account] Sending prompt to Claude...`);
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    
    // Extract the response text from Claude
    let aiResponseText = '';
    if (response.content && response.content.length > 0 && 'text' in response.content[0]) {
      aiResponseText = response.content[0].text || '';
    }
    console.log(`[API determine-expense-account] Claude response: "${aiResponseText}"`);

    const chosenIdStr = aiResponseText.trim();
    const chosenId = parseInt(chosenIdStr, 10);

    if (isNaN(chosenId)) {
      console.warn(`[API determine-expense-account] Claude returned a non-numeric ID: "${chosenIdStr}". Will try fallback.`);
    } else {
      const isValidChoice = expenseAccounts.some(acc => acc.id === chosenId);
      if (isValidChoice) {
        const chosenAccount = expenseAccounts.find(acc => acc.id === chosenId);
        console.log(`[API determine-expense-account] Claude selected Account ID: ${chosenId} ('${chosenAccount?.name}').`);
        return { 
          accountId: chosenId, 
          message: `AI selected expense account: ${chosenAccount?.name} (${chosenAccount?.account_type || 'Unknown type'})` 
        };
      } else {
        console.warn(`[API determine-expense-account] Claude selected an invalid Account ID: ${chosenId}. Will try fallback.`);
      }
    }
  } catch (aiError) {
    console.error(`[API determine-expense-account] Error during Claude selection:`, aiError);
    // Fall through to fallback if AI errors
  }

  // Step 5: Fallback - use keyword matching for common expense categories
  try {
    const lowerDescription = description.toLowerCase();
    const lowerVendorName = vendorName.toLowerCase();
    
    // Define common expense categories and associated keywords
    const expenseCategories = [
      { keywords: ['office', 'supplies', 'paper', 'stationery'], name: 'Office Supplies' },
      { keywords: ['rent', 'lease', 'property'], name: 'Rent' },
      { keywords: ['utility', 'utilities', 'electric', 'water', 'gas', 'power'], name: 'Utilities' },
      { keywords: ['travel', 'airfare', 'hotel', 'lodging', 'flight'], name: 'Travel' },
      { keywords: ['meal', 'food', 'restaurant', 'catering'], name: 'Meals' },
      { keywords: ['phone', 'mobile', 'telecom', 'internet', 'broadband'], name: 'Telecommunications' },
      { keywords: ['software', 'license', 'subscription', 'saas'], name: 'Software' },
      { keywords: ['repair', 'maintenance', 'service'], name: 'Repairs & Maintenance' },
      { keywords: ['insurance', 'policy', 'coverage'], name: 'Insurance' },
      { keywords: ['legal', 'attorney', 'lawyer'], name: 'Legal' },
      { keywords: ['accounting', 'bookkeeping', 'tax', 'cpa'], name: 'Accounting' },
      { keywords: ['advertising', 'marketing', 'promotion'], name: 'Advertising' },
      { keywords: ['salary', 'wage', 'payroll', 'compensation'], name: 'Payroll' },
      { keywords: ['equipment', 'furniture', 'computer', 'hardware'], name: 'Equipment' }
    ];
    
    // Find matching category based on description and vendor name
    for (const category of expenseCategories) {
      const hasKeywordInDescription = category.keywords.some(keyword => lowerDescription.includes(keyword));
      const hasKeywordInVendor = category.keywords.some(keyword => lowerVendorName.includes(keyword));
      
      if (hasKeywordInDescription || hasKeywordInVendor) {
        console.log(`[API determine-expense-account] Keyword match for category: ${category.name}`);
        
        // Find account that matches the category name
        const categoryMatch = expenseAccounts.find(acc => 
          acc.name.toLowerCase().includes(category.name.toLowerCase())
        );
        
        if (categoryMatch) {
          console.log(`[API determine-expense-account] Found category match: ${categoryMatch.name}`);
          return { 
            accountId: categoryMatch.id, 
            message: `Matched expense category '${category.name}' to account: ${categoryMatch.name}` 
          };
        }
      }
    }
    
    // If no specific match found, use a general expense account
    const generalExpense = expenseAccounts.find(acc => 
      acc.name.toLowerCase().includes('general') || 
      acc.name.toLowerCase().includes('expense') ||
      acc.name.toLowerCase().includes('other')
    );
    
    if (generalExpense) {
      console.log(`[API determine-expense-account] Using general expense account: ${generalExpense.name}`);
      return { 
        accountId: generalExpense.id, 
        message: `Using general expense account: ${generalExpense.name}` 
      };
    }
    
    // Last resort: use the first expense account
    const firstAccount = expenseAccounts[0];
    console.log(`[API determine-expense-account] Last resort: Using first available expense account: ${firstAccount.name}`);
    return { 
      accountId: firstAccount.id, 
      message: `Using first available expense account: ${firstAccount.name}` 
    };
    
  } catch (fallbackError) {
    console.error(`[API determine-expense-account] Error in fallback selection:`, fallbackError);
    
    // Absolute last resort - if we have any account ID, return it
    if (expenseAccounts.length > 0) {
      const lastResortAccount = expenseAccounts[0];
      return { 
        accountId: lastResortAccount.id, 
        message: `Using account as emergency fallback: ${lastResortAccount.name}` 
      };
    }
    
    // If we get here, we truly have no valid accounts
    return { 
      accountId: null, 
      message: `No valid expense accounts found. Please create accounts first.` 
    };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<DetermineExpenseAccountResponse>> {
  try {
    // Get user from auth or from request body (for compatibility with excelDataProcessor.ts)
    let userId: string;
    const body = await request.json();
    const { description, vendorName, amount, accountName, accountCode, accounts, userId: bodyUserId } = body;
    
    // If userId is provided in the request body, use it (for compatibility)
    if (bodyUserId && typeof bodyUserId === 'string') {
      console.log(`[API determine-expense-account] Using userId from request body: ${bodyUserId}`);
      userId = bodyUserId;
    } else {
      // Otherwise use the authenticated user
      const user = await auth(request);
      if (!user || !user.uid) {
        console.error('[API determine-expense-account] Authentication failed: No user UID.');
        return NextResponse.json({ accountId: null, message: 'Unauthorized', error: 'Unauthorized' }, { status: 401 });
      }
      userId = user.uid;
    }

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ accountId: null, message: 'Description is required and must be a string', error: 'Bad Request' }, { status: 400 });
    }

    console.log(`[API determine-expense-account] Received request for user: ${userId}, description: ${description}`);

    const result = await findExpenseAccountLogic(
      userId, 
      description, 
      vendorName || '', 
      amount || '', 
      accountName || '', 
      accountCode || '',
      accounts || []
    );

    return NextResponse.json(result);

  } catch (error) {
    console.error('[API determine-expense-account] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ accountId: null, message: errorMessage, error: 'Internal server error' }, { status: 500 });
  }
}

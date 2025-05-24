import Anthropic from "@anthropic-ai/sdk";

/**
 * GL account information extracted from user query using AI
 */
export interface GLAccountInfo {
  code?: string;
  name?: string;
  description?: string;
  account_type?: string;
}

/**
 * Extract GL account information from a user query using AI
 * This provides more robust parsing than regex patterns
 */
export async function extractGLAccountInfoWithAI(query: string): Promise<GLAccountInfo> {
  console.log(`[GLAIExtraction] Extracting GL account info from: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 250,
      temperature: 0.1,
      system: `You are an AI assistant that extracts structured GL (General Ledger) account information from user queries.
      
      Extract ONLY the following information:
      - code: The GL account code/number (MUST be a 5-digit number following standard accounting conventions)
      - name: The name/title of the GL account
      - description: Any description provided for the account
      - account_type: The type of account (e.g., asset, liability, expense, revenue, equity)
      
      IMPORTANT RULES FOR ACCOUNT CODES:
      1. ALWAYS use 5-digit account codes (no more, no less)
      2. Follow standard accounting chart of accounts conventions:
         - 10000-19999: Asset accounts
         - 20000-29999: Liability accounts
         - 30000-39999: Equity accounts
         - 40000-49999: Revenue accounts
         - 50000-59999: Cost of Goods Sold accounts
         - 60000-69999: Expense accounts
      3. Place accounts logically within their ranges (e.g., 61000-61999 for office expenses)
      4. Use your accounting expertise to choose appropriate numbers
      
      If any information is missing, omit that field entirely rather than guessing. If the account_type is provided but no code is specified, generate an appropriate 5-digit code based on accounting standards.
      
      Respond with VALID JSON only, following this format:
      {
        "code": "string or number",
        "name": "string",
        "description": "string",
        "account_type": "string"
      }
      
      Examples:
      1. "Create a new GL account for Office Supplies, it's an expense account"
         {"code": "61500", "name": "Office Supplies", "account_type": "expense"}
      
      2. "I need to add Marketing Expense account"
         {"code": "62000", "name": "Marketing Expense", "account_type": "expense"}
         
      3. "Create account 12345 for Company Vehicle"
         {"code": "12345", "name": "Company Vehicle", "account_type": "asset"}
         
      4. "Add a new Accounts Receivable account for tracking customer balances"
         {"code": "11000", "name": "Accounts Receivable", "account_type": "asset", "description": "For tracking customer balances"}`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extractedInfo = JSON.parse(jsonMatch[0]) as GLAccountInfo;
        console.log(`[GLAIExtraction] Successfully extracted GL account info:`, extractedInfo);
        return extractedInfo;
      }
    } catch (parseError) {
      console.error('[GLAIExtraction] Error parsing JSON from response:', parseError);
    }
    
    // Return empty object if parsing fails
    return {};
  } catch (error) {
    console.error('[GLAIExtraction] Error extracting GL account info:', error);
    return {};
  }
}

/**
 * Determine if a query is about creating a GL account using AI
 */
export async function isGLAccountCreationWithAI(query: string): Promise<boolean> {
  console.log(`[GLAIExtraction] Checking if query is about GL account creation: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 100,
      temperature: 0.1,
      system: `You determine whether a query is about creating a new GL (General Ledger) account.
      
      Respond with ONLY "true" or "false".
      
      Examples of GL account creation queries:
      - "Create a new GL account for office supplies"
      - "Add account 6050 for marketing expenses"
      - "I need to set up a travel expenses GL account"
      - "Make a new account in the chart of accounts for utilities"
      
      If the query is clearly about creating a GL account, respond with "true".
      Otherwise, respond with "false".`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    const result = responseText.toLowerCase().includes("true");
    
    console.log(`[GLAIExtraction] GL account creation check result: ${result}`);
    return result;
  } catch (error) {
    console.error('[GLAIExtraction] Error checking GL account creation:', error);
    return false;
  }
}

/**
 * Extract journal entry information from a user query using AI
 * This provides more robust parsing than regex patterns
 */
export async function extractJournalEntryWithAI(query: string): Promise<any> {
  console.log(`[GLAIExtraction] Extracting journal entry info from: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 500,
      temperature: 0.1,
      system: `You are an accountant AI that extracts structured journal entry information from user queries and creates balanced double-entry accounting entries.
      
      Extract the following information and create a properly balanced journal entry following accounting principles:
      - memo: A concise description of the transaction
      - date: Today's date if not specified (format as YYYY-MM-DD)
      - lines: An array of journal lines with accounts and amounts
      
      For each line include:
      - account_code_or_name: The account name (use common accounting account names)
      - description: Brief description of this specific line
      - debit: Amount if this is a debit entry (number)
      - credit: Amount if this is a credit entry (number)
      
      ALWAYS follow these accounting rules:
      1. Total debits MUST equal total credits
      2. Each entry must have at least two lines (one debit, one credit)
      3. Use proper account names (Cash, Accounts Receivable, Sales Revenue, etc.)
      4. For sales/revenue: Debit an asset account (usually Cash or Accounts Receivable) and Credit a revenue account
      5. For expenses: Debit an expense account and Credit an asset account (usually Cash or Accounts Payable)
      
      Respond with VALID JSON only in this format:
      {
        "memo": "Concise transaction description",
        "transaction_date": "YYYY-MM-DD",
        "lines": [
          {
            "account_code_or_name": "Cash",
            "description": "Line description",
            "debit": 100,
            "credit": 0
          },
          {
            "account_code_or_name": "Sales Revenue",
            "description": "Line description",
            "debit": 0,
            "credit": 100
          }
        ]
      }
      
      For a sales transaction example: "Cash sale of $500" would become:
      {
        "memo": "Cash sale",
        "transaction_date": "2025-05-10",
        "lines": [
          {
            "account_code_or_name": "Cash",
            "description": "Cash received from sale",
            "debit": 500,
            "credit": 0
          },
          {
            "account_code_or_name": "Sales Revenue",
            "description": "Revenue from sale",
            "debit": 0,
            "credit": 500
          }
        ]
      }`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const extractedInfo = JSON.parse(jsonMatch[0]);
        console.log(`[GLAIExtraction] Successfully extracted journal entry info:`, extractedInfo);
        return extractedInfo;
      }
    } catch (parseError) {
      console.error('[GLAIExtraction] Error parsing JSON from response:', parseError);
    }
    
    // Return empty object if parsing fails
    return {};
  } catch (error) {
    console.error('[GLAIExtraction] Error extracting journal entry info:', error);
    return {};
  }
}

/**
 * Determine if a query is about creating a journal entry using AI
 */
export async function isJournalCreationWithAI(query: string): Promise<boolean> {
  console.log(`[GLAIExtraction] Checking if query is about journal creation: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 100,
      temperature: 0.1,
      system: `You determine whether a query is about creating a new journal entry.
      
      Respond with ONLY "true" or "false".
      
      Examples of journal creation queries:
      - "Create a new journal entry for office supplies purchase"
      - "Record a journal entry debiting expenses and crediting cash"
      - "I need to enter a journal for the electricity payment"
      - "Make a journal entry for the rent payment"
      
      If the query is clearly about creating a journal entry, respond with "true".
      Otherwise, respond with "false".`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    const result = responseText.toLowerCase().includes("true");
    
    console.log(`[GLAIExtraction] Journal creation check result: ${result}`);
    return result;
  } catch (error) {
    console.error('[GLAIExtraction] Error checking journal creation:', error);
    return false;
  }
}

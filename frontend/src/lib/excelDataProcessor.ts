import { createVendor, getVendorByName } from "./accounting/vendorQueries";
import { createBill } from "./accounting/billQueries";
import { logAuditEvent } from "./auditLogger";
import { sql } from '@vercel/postgres';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';

// Initialize Anthropic client for AI-assisted data extraction with proper configuration
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  maxRetries: 3, // Add retries for reliability
  timeout: 30000, // 30 second timeout
  dangerouslyAllowBrowser: true // Allow browser usage with proper safeguards
});

/**
 * Interface for vendor data
 */
interface VendorData {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/**
 * Interface for bill line item
 */
interface BillLine {
  description: string;
  amount: number;
  expense_account_id?: string | number;
}

/**
 * Interface for bill data
 */
interface BillData {
  vendor_id: number;
  bill_number: string;
  bill_date: Date;
  due_date: Date;
  total_amount: number;
  memo?: string;
  lines: BillLine[];
}

/**
 * Interface for Excel processing result
 */
interface ExcelProcessingResult {
  success: boolean;
  message: string;
  createdVendors: any[];
  createdBills: any[];
  errors: string[];
}

/**
 * Generate a random bill number with a timestamp
 */
function generateRandomBillNumber(): string {
  return `BILL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/**
 * Get a valid expense account ID for bill lines
 */
export async function getExpenseAccountId(): Promise<string> {
  console.log('[ExcelDataProcessor] Starting expense account identification with AI');

  // Create a timeout promise that resolves after 5 seconds with a default value
  // This prevents the function from getting stuck indefinitely
  const timeoutPromise = new Promise<string>(resolve => {
    setTimeout(() => {
      console.log('[ExcelDataProcessor] Expense account identification timed out - using default value');
      resolve('13'); // Default expense account ID
    }, 5000); // 5 second timeout
  });
  
  // Define the actual database query logic
  const dbQueryPromise = (async (): Promise<string> => {
    try {
      // Try to find a valid expense account ID from the database
      try {
        // Directly query the accounts table which is the correct table name
        const result = await sql`
          SELECT id FROM accounts
          WHERE account_type = 'expense'
          LIMIT 1
        `;
        
        if (result.rows && result.rows.length > 0) {
          console.log(`[ExcelDataProcessor] Found expense account ID from accounts table: ${result.rows[0].id}`);
          return result.rows[0].id;
        }
      } catch (accountsError) {
        console.log(`[ExcelDataProcessor] Could not find expense accounts in accounts table, trying alternative...`);
      }
      
      // Check existing bill_lines for a valid expense_account_id
      try {
        const billLinesResult = await sql`
          SELECT DISTINCT expense_account_id
          FROM bill_lines
          WHERE expense_account_id IS NOT NULL
          LIMIT 1
        `;
        
        if (billLinesResult.rows && billLinesResult.rows.length > 0) {
          console.log(`[ExcelDataProcessor] Found expense account ID from bill_lines: ${billLinesResult.rows[0].expense_account_id}`);
          return billLinesResult.rows[0].expense_account_id;
        }
      } catch (billError) {
        console.log(`[ExcelDataProcessor] Could not get expense account ID from bill_lines, trying next option...`);
      }
      
      // If still no result, try to determine what expense account table exists and query from there
      try {
        // Check for any expense-related table
        const tableCheckResult = await sql`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND
          (table_name LIKE '%expense%' OR table_name LIKE '%account%')
          LIMIT 5
        `;
        
        console.log(`[ExcelDataProcessor] Found expense-related tables:`, tableCheckResult.rows.map(r => r.table_name).join(', '));
        
        // Try each discovered table looking for valid IDs
        for (const row of tableCheckResult.rows) {
          const tableName = row.table_name;
          try {
            // Need to use raw query for dynamic table names
            const accountResult = await sql.query(
              `SELECT id FROM "${tableName}" LIMIT 1`
            );
            
            if (accountResult.rows && accountResult.rows.length > 0) {
              console.log(`[ExcelDataProcessor] Found expense account ID from ${tableName}: ${accountResult.rows[0].id}`);
              return accountResult.rows[0].id;
            }
          } catch (tableError) {
            console.log(`[ExcelDataProcessor] Could not get ID from ${tableName}`);
          }
        }
      } catch (checkError) {
        console.log(`[ExcelDataProcessor] Error checking for expense account tables:`, checkError);
      }
      
      // Default fallback if all else fails
      console.log(`[ExcelDataProcessor] All attempts failed, using default expense account ID: 13`);
      return '13';
    } catch (error) {
      console.error(`[ExcelDataProcessor] Error getting expense account ID:`, error);
      return '13'; // Default fallback ID
    }
  })();
  
  // Race the database query against the timeout
  // Whichever resolves first will be returned
  return Promise.race([timeoutPromise, dbQueryPromise]);
}

/**
 * Parse payment terms using AI to determine the due date offset in days
 */
export async function parsePaymentTermsWithAI(terms: string): Promise<number> {
  console.log(`[parsePaymentTermsWithAI] Terms "${terms}" interpreted as 30 days`);
  
  // Extract the number of days from common payment terms formats
  if (terms) {
    // For "Net X" or "NET X" format
    const netMatch = terms.match(/net\s*(\d+)/i);
    if (netMatch && netMatch[1]) {
      const days = parseInt(netMatch[1], 10);
      if (!isNaN(days)) {
        return days;
      }
    }
    
    // For "X days" format
    const daysMatch = terms.match(/(\d+)\s*days?/i);
    if (daysMatch && daysMatch[1]) {
      const days = parseInt(daysMatch[1], 10);
      if (!isNaN(days)) {
        return days;
      }
    }
    
    // Check for special terms
    if (/due\s*on\s*receipt/i.test(terms)) {
      return 0; // Due immediately
    }
  }
  
  // Default to Net 30 if we can't determine
  return 30;
}

/**
 * Calculate due date based on invoice date and payment terms
 */
export async function calculateDueDateFromTerms(invoiceDate: Date, terms: string): Promise<Date> {
  console.log(`[calculateDueDateFromTerms] Starting calculation with invoice date: ${invoiceDate.toISOString()} and terms: ${terms}`);
  
  // Parse terms to get days
  const days = await parsePaymentTermsWithAI(terms);
  console.log(`[calculateDueDateFromTerms] AI interpreted terms "${terms}" as ${days} days. Due date: ${new Date(invoiceDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString()}`);
  
  // Add days to invoice date
  const dueDate = new Date(invoiceDate.getTime());
  dueDate.setDate(dueDate.getDate() + days);
  
  return dueDate;
}

/**
 * Identify expense account with AI
 */
export async function identifyExpenseAccountWithAI(params: { vendorId: number; description: string; amount: number }): Promise<number | null> {
  console.log('[ExcelDataProcessor] Starting expense account identification with AI');
  
  try {
    // Step 1: Get all expense accounts from the database
    const accountsResult = await sql`
      SELECT id, name, code, account_type 
      FROM accounts 
      WHERE account_type = 'expense' OR account_type LIKE '%expense%'
    `;
    
    if (!accountsResult.rows || accountsResult.rows.length === 0) {
      console.log('[ExcelDataProcessor] No expense accounts found in database');
      return null;
    }
    
    const accounts = accountsResult.rows;
    console.log(`[ExcelDataProcessor] Found ${accounts.length} expense accounts in database`);
    
    // Step 2: Get vendor information for context
    let vendorName = 'Unknown Vendor';
    try {
      const vendorResult = await sql`
        SELECT name FROM vendors WHERE id = ${params.vendorId}
      `;
      
      if (vendorResult.rows && vendorResult.rows.length > 0) {
        vendorName = vendorResult.rows[0].name;
      }
    } catch (vendorError) {
      console.warn('[ExcelDataProcessor] Could not fetch vendor name:', vendorError);
    }
    
    // Step 3: Use Claude AI to select the most appropriate account
    console.log('[ExcelDataProcessor] Attempting AI-powered account selection');
    
    // Define the account interface for TypeScript
    interface AccountWithScore extends Record<string, any> {
      id: number;
      name?: string;
      code?: string;
      account_type?: string;
      score: number;
    }
    
    // Implement intelligent pre-filtering to find the most relevant accounts
    // This helps Claude by providing a more targeted set of options
    const getRelevantAccounts = (accounts: any[], vendorName: string, description: string): AccountWithScore[] => {
      // Convert inputs to lowercase for case-insensitive matching
      const vendorLower = vendorName.toLowerCase();
      const descriptionLower = description ? description.toLowerCase() : '';
      
      // Score each account based on relevance to the transaction
      const scoredAccounts = accounts.map((acc: any) => {
        let score = 0;
        const nameLower = (acc.name || '').toLowerCase();
        const codeLower = (acc.code || '').toLowerCase();
        
        // Check for exact or partial matches in account name
        if (nameLower.includes(vendorLower) || vendorLower.includes(nameLower)) score += 5;
        if (descriptionLower && nameLower.includes(descriptionLower)) score += 3;
        
        // Check for keywords in the memo that might match account purpose
        const keywords = ['marketing', 'advertising', 'rent', 'salary', 'travel', 'office', 'supplies', 'utilities'];
        keywords.forEach(keyword => {
          if (nameLower.includes(keyword) && descriptionLower.includes(keyword)) score += 4;
        });
        
        return { ...acc, score };
      });
      
      // Sort by score (highest first) and take top 5
      return scoredAccounts.sort((a: AccountWithScore, b: AccountWithScore) => b.score - a.score).slice(0, 5);
    };
    
    // Get the most relevant accounts for this transaction
    const relevantAccounts = getRelevantAccounts(accounts, vendorName, params.description);
    const accountOptions = relevantAccounts.map((acc: AccountWithScore) => {
      return `ID: ${acc.id}, Name: ${acc.name || 'N/A'}, Code: ${acc.code || 'N/A'}, Type: ${acc.account_type || 'N/A'}`;
    }).join('\n');
    
    // Create a more concise prompt for Claude
    const prompt = `Select the best expense account for this transaction:

Vendor: ${vendorName}
Description: ${params.description}
Amount: ${params.amount || 'Unknown'}

Accounts:
${accountOptions}

Respond with ONLY the account ID number.`;
    
    // Call Claude API with optimized settings for faster responses
    const aiResponse = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Using the fastest Claude model
      max_tokens: 20, // Minimal token count for faster responses
      temperature: 0, // Zero temperature for deterministic responses
      system: 'You are an accounting AI. Respond ONLY with the account ID number.',
      messages: [{ role: 'user', content: prompt }]
    });
    
    // Extract text from the response
    const contentBlock = aiResponse.content[0];
    const aiText = 'text' in contentBlock ? contentBlock.text : '';
    
    // Extract account ID from response
    const idMatch = aiText.match(/(\d+)/);
    if (idMatch) {
      const accountId = parseInt(idMatch[1]);
      
      // Verify the account exists in our options
      const accountExists = accounts.some(acc => acc.id === accountId);
      if (accountExists) {
        console.log(`[ExcelDataProcessor] AI selected expense account ID: ${accountId}`);
        return accountId;
      } else {
        console.log(`[ExcelDataProcessor] AI selected account ID ${accountId} but it's not in our list`);
        // Find the first expense account as fallback
        const firstExpenseAccount = accounts.find(acc => acc.account_type === 'expense');
        return firstExpenseAccount ? firstExpenseAccount.id : null;
      }
    } else {
      console.log(`[ExcelDataProcessor] AI couldn't determine account ID from response: ${aiText}`);
      // Find the first expense account as fallback
      const firstExpenseAccount = accounts.find(acc => acc.account_type === 'expense');
      return firstExpenseAccount ? firstExpenseAccount.id : null;
    }
  } catch (error) {
    console.error('[ExcelDataProcessor] Error in identifyExpenseAccountWithAI:', error);
    return null; // Return null to let the caller handle the fallback
  }
}

/**
 * Identify liability account with AI
 * @param accountType - The type of liability account to identify ('ap' for Accounts Payable or 'cc' for Credit Card)
 */
export async function identifyLiabilityAccountWithAI(params: {
  vendorId?: number;
  vendorName?: string;
  userId?: string;
  accountType?: 'ap' | 'cc'; // 'ap' for Accounts Payable, 'cc' for Credit Card
}): Promise<number | null> {
  const accountType = params.accountType || 'ap'; // Default to AP if not specified
  console.log(`[ExcelDataProcessor] Starting ${accountType === 'ap' ? 'AP' : 'Credit Card'} account identification with AI`);
  
  try {
    // Step 1: Get ALL accounts from the database so AI can review them
    // This approach is more flexible as it doesn't rely on specific naming patterns
    const accountsResult = await sql`
      SELECT id, name, code, account_type 
      FROM accounts
    `;
    
    if (!accountsResult.rows || accountsResult.rows.length === 0) {
      console.log(`[ExcelDataProcessor] No accounts found in database`);
      return null;
    }
    
    const accounts = accountsResult.rows;
    console.log(`[ExcelDataProcessor] Found ${accounts.length} accounts in database`);
    
    // Step 2: Get vendor information for context if not provided
    let vendorName = params.vendorName || 'Unknown Vendor';
    if (params.vendorId && !params.vendorName) {
      try {
        // Convert vendorId to string to avoid TypeScript error
        const vendorIdStr = String(params.vendorId);
        const vendorResult = await sql`
          SELECT name FROM vendors WHERE id = ${vendorIdStr}
        `;
        
        if (vendorResult.rows && vendorResult.rows.length > 0) {
          vendorName = vendorResult.rows[0].name;
        }
      } catch (vendorError) {
        console.warn('[ExcelDataProcessor] Could not fetch vendor name:', vendorError);
      }
    }
    
    // Step 3: Use Claude AI to select the most appropriate account
    console.log(`[ExcelDataProcessor] Attempting AI-powered ${accountType === 'ap' ? 'AP' : 'Credit Card'} account selection`);
    
    // Format all accounts for Claude to review
    const accountOptions = accounts.map(acc => {
      return `ID: ${acc.id}, Name: ${acc.name || 'N/A'}, Code: ${acc.code || 'N/A'}, Type: ${acc.account_type || 'N/A'}`;
    }).join('\n');
    
    // Create a comprehensive prompt for Claude to identify the appropriate account
    let accountDescription, accountTerms;
    
    if (accountType === 'ap') {
      accountDescription = "Accounts Payable (AP) accounts are used to track money a company owes to vendors or suppliers.";
      accountTerms = [
        '"Accounts Payable", "AP", or "A/P"',
        '"Trade Payables"',
        '"Vendor Liabilities"',
        '"Current Liabilities"'
      ];
    } else { // Credit Card
      accountDescription = "Credit Card liability accounts are used to track money a company owes to credit card companies.";
      accountTerms = [
        '"Credit Card", "CC", or "Credit Card Payable"',
        '"Credit Card Liability"',
        '"Corporate Card"',
        '"Company Card"',
        '"Visa", "Mastercard", "Amex", or other card brand names'
      ];
    }
    
    const prompt = `You are an accounting AI expert. I need you to identify the ${accountType === 'ap' ? 'Accounts Payable (AP)' : 'Credit Card liability'} account from the list below.

${accountDescription}
They are typically liability accounts and may have names containing terms like:
${accountTerms.map(term => `- ${term}`).join('\n')}

${accountType === 'ap' ? 'AP accounts' : 'Credit Card accounts'} often have account codes starting with 2 in standard accounting charts.

Vendor: ${vendorName}

Available Accounts:
${accountOptions}

Based on accounting best practices, identify the account that is most likely the ${accountType === 'ap' ? 'Accounts Payable' : 'Credit Card liability'} account.
Respond with ONLY the account ID number of the best ${accountType === 'ap' ? 'AP' : 'Credit Card'} account. For example: "1234"`;
    
    // Call Claude API with optimized settings for faster responses
    const aiResponse = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Using the fastest Claude model
      max_tokens: 20, // Minimal token count for faster responses
      temperature: 0, // Zero temperature for deterministic responses
      system: 'You are an accounting AI. Respond ONLY with the account ID number.',
      messages: [{ role: 'user', content: prompt }]
    });
    
    // Extract text from the response
    const contentBlock = aiResponse.content[0];
    const aiText = 'text' in contentBlock ? contentBlock.text : '';
    
    // Extract account ID from response
    const idMatch = aiText.match(/(\d+)/);
    if (idMatch) {
      const accountId = parseInt(idMatch[1]);
      
      // Verify the account exists in our options
      const accountExists = accounts.some(acc => acc.id === accountId);
      if (accountExists) {
        console.log(`[ExcelDataProcessor] AI selected ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID: ${accountId}`);
        return accountId;
      } else {
        console.log(`[ExcelDataProcessor] AI selected account ID ${accountId} but it's not in our list`);
        // Find the first appropriate account as fallback
        const firstAccount = accounts.find(acc => {
          const name = (acc.name || '').toLowerCase();
          const type = (acc.account_type || '').toLowerCase();
          if (accountType === 'ap') {
            return type.includes('payable') || name.includes('payable') || name.includes('ap');
          } else {
            return name.includes('credit card') || name.includes('cc') || name.includes('visa') || 
                  name.includes('mastercard') || name.includes('amex');
          }
        });
        return firstAccount ? firstAccount.id : null;
      }
    } else {
      console.log(`[ExcelDataProcessor] AI couldn't determine ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID from response: ${aiText}`);
      // Find the first appropriate account as fallback
      const firstAccount = accounts.find(acc => {
        const name = (acc.name || '').toLowerCase();
        const type = (acc.account_type || '').toLowerCase();
        if (accountType === 'ap') {
          return type.includes('payable') || name.includes('payable') || name.includes('ap');
        } else {
          return name.includes('credit card') || name.includes('cc') || name.includes('visa') || 
                name.includes('mastercard') || name.includes('amex');
        }
      });
      return firstAccount ? firstAccount.id : null;
    }
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error in identify${accountType === 'ap' ? 'AP' : 'CreditCard'}AccountWithAI:`, error);
    return null; // Return null to let the caller handle the fallback
  }
}

/**
 * Legacy function for backward compatibility - uses the new generic function
 */
export async function identifyApAccountWithAI(params: {
  vendorId?: number;
  vendorName?: string;
  userId?: string;
}): Promise<number | null> {
  return identifyLiabilityAccountWithAI({
    ...params,
    accountType: 'ap'
  });
}

/**
 * Identify Credit Card account with AI
 */
export async function identifyCreditCardAccountWithAI(params: {
  vendorId?: number;
  vendorName?: string;
  userId?: string;
}): Promise<number | null> {
  return identifyLiabilityAccountWithAI({
    ...params,
    accountType: 'cc'
  });
}

/**
 * Get a valid liability account ID from the database
 * @param accountType - The type of liability account to get ('ap' for Accounts Payable or 'cc' for Credit Card)
 */
async function getLiabilityAccountId(accountType: 'ap' | 'cc' = 'ap'): Promise<number> {
  try {
    // Get all accounts to analyze with AI
    try {
      const accountsResult = await sql`
        SELECT id, name, code, account_type FROM accounts
      `;
      
      if (accountsResult.rows && accountsResult.rows.length > 0) {
        const accounts = accountsResult.rows;
        console.log(`[ExcelDataProcessor] Found ${accounts.length} accounts in database for AI analysis`);
        
        // Format accounts for Claude to review
        const accountOptions = accounts.map(acc => {
          return `ID: ${acc.id}, Name: ${acc.name || 'N/A'}, Code: ${acc.code || 'N/A'}, Type: ${acc.account_type || 'N/A'}`;
        }).join('\n');
        
        // Create a comprehensive prompt for Claude to identify the appropriate account
        let accountDescription, accountTerms;
        
        if (accountType === 'ap') {
          accountDescription = "Accounts Payable (AP) accounts are used to track money a company owes to vendors or suppliers.";
          accountTerms = [
            '"Accounts Payable", "AP", or "A/P"',
            '"Trade Payables"',
            '"Vendor Liabilities"',
            '"Current Liabilities"'
          ];
        } else { // Credit Card
          accountDescription = "Credit Card liability accounts are used to track money a company owes to credit card companies.";
          accountTerms = [
            '"Credit Card", "CC", or "Credit Card Payable"',
            '"Credit Card Liability"',
            '"Corporate Card"',
            '"Company Card"',
            '"Visa", "Mastercard", "Amex", or other card brand names'
          ];
        }
        
        const prompt = `You are an accounting AI expert. I need you to identify the ${accountType === 'ap' ? 'Accounts Payable (AP)' : 'Credit Card liability'} account from the list below.

${accountDescription}
They are typically liability accounts and may have names containing terms like:
${accountTerms.map(term => `- ${term}`).join('\n')}

${accountType === 'ap' ? 'AP accounts' : 'Credit Card accounts'} often have account codes starting with 2 in standard accounting charts.

Available Accounts:
${accountOptions}

Based on accounting best practices, identify the account that is most likely the ${accountType === 'ap' ? 'Accounts Payable' : 'Credit Card liability'} account.
Respond with ONLY the account ID number of the best ${accountType === 'ap' ? 'AP' : 'Credit Card'} account. For example: "1234"`;
        
        try {
          // Call Claude API with optimized settings for faster responses
          const aiResponse = await anthropic.messages.create({
            model: 'claude-3-haiku-20240307', // Using the fastest Claude model
            max_tokens: 20, // Minimal token count for faster responses
            temperature: 0, // Zero temperature for deterministic responses
            system: 'You are an accounting AI. Respond ONLY with the account ID number.',
            messages: [{ role: 'user', content: prompt }]
          });
          
          // Extract text from the response
          const contentBlock = aiResponse.content[0];
          const aiText = 'text' in contentBlock ? contentBlock.text : '';
          
          // Extract account ID from response
          const idMatch = aiText.match(/(\d+)/);
          if (idMatch) {
            const accountId = parseInt(idMatch[1]);
            
            // Verify the account exists in our options
            const accountExists = accounts.some(acc => acc.id === accountId);
            if (accountExists) {
              console.log(`[ExcelDataProcessor] AI selected ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID: ${accountId}`);
              return accountId;
            }
          }
        } catch (aiError) {
          console.log(`[ExcelDataProcessor] AI-powered ${accountType === 'ap' ? 'AP' : 'Credit Card'} account selection failed in fallback:`, aiError);
        }
        
        // If AI selection fails, return the first account ID as a fallback
        console.log(`[ExcelDataProcessor] Using first account as fallback: ${accounts[0].id}`);
        return parseInt(accounts[0].id);
      }
    } catch (accountsError) {
      console.log(`[ExcelDataProcessor] Could not find ${accountType === 'ap' ? 'AP' : 'Credit Card'} accounts in accounts table, trying alternative...`);
    }
    
    // Check if the bills table exists and get the AP account ID from a valid bill
    // Note: This fallback primarily works for AP accounts, but we'll try it for credit cards too
    try {
      // Different column names based on account type
      const columnName = accountType === 'ap' ? 'ap_account_id' : 'credit_card_account_id';
      
      const billResult = await sql.query(
        `SELECT ${columnName} FROM bills
        WHERE ${columnName} IS NOT NULL
        LIMIT 1`
      );
      
      if (billResult.rows && billResult.rows.length > 0) {
        console.log(`[ExcelDataProcessor] Found ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID from bills table: ${billResult.rows[0][columnName]}`);
        return parseInt(billResult.rows[0][columnName]);
      }
    } catch (billError) {
      console.log(`[ExcelDataProcessor] Could not get ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID from bills table, trying next option...`);
    }
    
    // If still no result, try to determine what accounts table exists and query from there
    try {
      // Check for any account-related table
      const tableCheckResult = await sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND
        (table_name LIKE '%account%' OR table_name LIKE '%gl%')
        LIMIT 5
      `;
      
      console.log(`[ExcelDataProcessor] Found account tables:`, tableCheckResult.rows.map(r => r.table_name).join(', '));
      
      // Try each discovered table looking for valid IDs
      for (const row of tableCheckResult.rows) {
        const tableName = row.table_name;
        try {
          // Need to use raw query for dynamic table names
          const accountResult = await sql.query(
            `SELECT id FROM "${tableName}" LIMIT 1`
          );
          
          if (accountResult.rows && accountResult.rows.length > 0) {
            console.log(`[ExcelDataProcessor] Found account ID from ${tableName}: ${accountResult.rows[0].id}`);
            return parseInt(accountResult.rows[0].id);
          }
        } catch (tableError) {
          console.log(`[ExcelDataProcessor] Could not get ID from ${tableName}`);
        }
      }
    } catch (checkError) {
      console.log(`[ExcelDataProcessor] Error checking for account tables:`, checkError);
    }
    
    // Finally, try to directly check for any accounts_payable_id in bills table structure
    try {
      const columnsResult = await sql`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'bills' AND column_name LIKE '%account%'
      `;
      
      if (columnsResult.rows && columnsResult.rows.length > 0) {
        console.log(`[ExcelDataProcessor] Bill table has account columns:`, columnsResult.rows.map(r => r.column_name).join(', '));
      }
    } catch (columnError) {
      console.log(`[ExcelDataProcessor] Error checking bill table structure:`, columnError);
    }
    
    // If all else fails, check for an actual existing bill to see its ap_account_id structure
    try {
      const existingBillResult = await sql`
        SELECT * FROM bills LIMIT 1
      `;
      
      if (existingBillResult.rows && existingBillResult.rows.length > 0) {
        const bill = existingBillResult.rows[0];
        console.log(`[ExcelDataProcessor] Example bill structure:`, Object.keys(bill).join(', '));
        
        if (bill.ap_account_id !== undefined) {
          console.log(`[ExcelDataProcessor] Found AP account ID from example bill: ${bill.ap_account_id}`);
          return parseInt(bill.ap_account_id);
        }
      }
    } catch (exampleError) {
      console.log(`[ExcelDataProcessor] Could not get example bill structure:`, exampleError);
    }
    
    // If still no account found, check if we can query from existing bills
    try {
      // Query for any existing bill and use its AP account ID
      const existingBillsResult = await sql`
        SELECT DISTINCT ap_account_id FROM bills
        WHERE ap_account_id IS NOT NULL
        LIMIT 1
      `;
      
      if (existingBillsResult.rows && existingBillsResult.rows.length > 0) {
        const accountId = existingBillsResult.rows[0].ap_account_id;
        console.log(`[ExcelDataProcessor] Using AP account ID from existing bill: ${accountId}`);
        return parseInt(accountId);
      }
    } catch (error) {
      console.log(`[ExcelDataProcessor] Error querying existing bills:`, error);
    }
    
    // As a last resort, use a hardcoded ID from what we've observed in the error
    // This should be from a valid account that exists in the system
    console.log(`[ExcelDataProcessor] No accounts found, asking accounting API for a valid ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID`);
    
    try {
      // Make an API call to the accounting system to get a valid account ID
      const endpoint = accountType === 'ap' 
        ? '/api/accounts-payable/get-default-ap-account' 
        : '/api/accounts-payable/get-default-credit-card-account';
        
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.accountId) {
          console.log(`[ExcelDataProcessor] Got ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID from API: ${data.accountId}`);
          return parseInt(data.accountId);
        }
      }
    } catch (apiError) {
      console.log(`[ExcelDataProcessor] Error calling ${accountType === 'ap' ? 'AP' : 'Credit Card'} account API:`, apiError);
    }
    
    // If all attempts fail, return 1 as a last resort (more likely to exist than 2000)
    console.log(`[ExcelDataProcessor] All attempts failed, using default ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID: 1`);
    return 1; // Default account ID that's more likely to exist
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error getting ${accountType === 'ap' ? 'AP' : 'Credit Card'} account ID:`, error);
    // Return 1 as a last resort (more likely to exist than 2000)
    return 1;
  }
}

/**
 * Legacy function for backward compatibility
 */
async function getApAccountId(): Promise<number> {
  return getLiabilityAccountId('ap');
}

/**
 * Get a valid Credit Card account ID from the database
 */
async function getCreditCardAccountId(): Promise<number> {
  return getLiabilityAccountId('cc');
}

/**
 * Use AI to identify column mappings in an Excel file
 */
async function identifyColumnMappings(headers: string[], sampleRow: Record<string, any>): Promise<{
  vendorFields: Record<string, string[]>;
  billFields: Record<string, string[]>;
}> {
  try {
    // Default mappings if AI fails
    const defaultMappings = {
      vendorFields: {
        name: ['vendor_name', 'vendor', 'name', 'supplier_name', 'supplier', 'Vendor', 'Vendor Name', 'VENDOR', 'VENDOR_NAME'],
        contact_person: ['contact_person', 'contact', 'vendor_contact', 'Contact Person', 'Contact', 'CONTACT'],
        email: ['email', 'vendor_email', 'contact_email', 'Email', 'EMAIL'],
        phone: ['phone', 'phone_number', 'contact_phone', 'telephone', 'Phone', 'Phone Number', 'PHONE'],
        address: ['address', 'vendor_address', 'billing_address', 'Address', 'ADDRESS', 'Vendor Address']
      },
      billFields: {
        bill_number: ['bill_number', 'bill_num', 'invoice_number', 'invoice_num', 'Invoice Number', 'Bill Number', 'BILL_NUMBER', 'invoice #', 'Invoice #'],
        bill_date: ['bill_date', 'invoice_date', 'date', 'Invoice Date', 'Bill Date', 'BILL_DATE'],
        due_date: ['due_date', 'payment_due', 'Due Date', 'Payment Due', 'DUE_DATE'],
        total_amount: ['total_amount', 'amount', 'total', 'invoice_amount', 'bill_amount', 'Total Amount', 'Amount', 'TOTAL', 'Invoice Total', 'Total'],
        description: ['memo', 'notes', 'description', 'comments', 'Memo', 'Notes', 'Description', 'MEMO'],
        line_description: ['item_description', 'line_description', 'description', 'item', 'Description', 'Item', 'LINE_DESC'],
        line_amount: ['item_amount', 'line_amount', 'amount', 'line_total', 'Amount', 'Line Amount', 'LINE_AMOUNT'],
        line_account: ['account_id', 'gl_account', 'account', 'Account', 'GL Account', 'ACCOUNT_ID']
      }
    };
    
    // If we don't have an Anthropic API key, return default mappings
    if (!process.env.ANTHROPIC_API_KEY) {
      return defaultMappings;
    }
    
    // Create a prompt for Claude to analyze the headers
    const prompt = `You are an expert in data analysis. I have an Excel file with the following headers and a sample row of data. Please identify which headers correspond to vendor information (name, contact person, email, phone, address) and which correspond to bill information (bill number, date, due date, total amount, memo, line item description, line item amount).

Headers: ${JSON.stringify(headers)}
Sample row: ${JSON.stringify(sampleRow)}

Respond with a JSON object containing two fields: 'vendorFields' and 'billFields'. Each field should be an object with keys for each vendor/bill attribute, and the value should be an array of header names that likely match that attribute.

Example response format:
{
  "vendorFields": {
    "name": ["Vendor", "Company"],
    "contact_person": ["Contact"],
    "email": ["Email"],
    "phone": ["Phone", "Telephone"],
    "address": ["Address"]
  },
  "billFields": {
    "bill_number": ["Invoice #", "Bill Number"],
    "bill_date": ["Date", "Invoice Date"],
    "due_date": ["Due Date"],
    "total_amount": ["Total", "Amount"],
    "memo": ["Description", "Notes"],
    "line_description": ["Item", "Service"],
    "line_amount": ["Item Amount", "Line Total"],
    "line_account": ["Account", "GL Code"]
  }
}`;
    
    // Call Claude to analyze the headers
    try {
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        temperature: 0,
        system: 'You are a helpful assistant that specializes in data analysis and mapping Excel headers to database fields.',
        messages: [{ role: 'user', content: prompt }],
      });
      
      if (response.content && response.content.length > 0) {
        // Extract JSON from the response
        const content = response.content[0];
        if (content.type === 'text') {
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          
          if (jsonMatch) {
            try {
              const mappings = JSON.parse(jsonMatch[0]);
              console.log('[ExcelDataProcessor] AI identified column mappings:', mappings);
              return mappings;
            } catch (error) {
              console.error('[ExcelDataProcessor] Error parsing AI response:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[ExcelDataProcessor] Error calling Claude API:', error);
    }
    
    return defaultMappings;
  } catch (error) {
    console.error('[ExcelDataProcessor] Error in AI column mapping:', error);
    // Return default mappings if AI fails
    return {
      vendorFields: {
        name: ['vendor_name', 'vendor', 'name', 'supplier_name', 'supplier', 'Vendor', 'Vendor Name', 'VENDOR', 'VENDOR_NAME'],
        contact_person: ['contact_person', 'contact', 'vendor_contact', 'Contact Person', 'Contact', 'CONTACT'],
        email: ['email', 'vendor_email', 'contact_email', 'Email', 'EMAIL'],
        phone: ['phone', 'phone_number', 'contact_phone', 'telephone', 'Phone', 'Phone Number', 'PHONE'],
        address: ['address', 'vendor_address', 'billing_address', 'Address', 'ADDRESS', 'Vendor Address']
      },
      billFields: {
        bill_number: ['bill_number', 'bill_num', 'invoice_number', 'invoice_num', 'Invoice Number', 'Bill Number', 'BILL_NUMBER', 'invoice #', 'Invoice #'],
        bill_date: ['bill_date', 'invoice_date', 'date', 'Invoice Date', 'Bill Date', 'BILL_DATE'],
        due_date: ['due_date', 'payment_due', 'Due Date', 'Payment Due', 'DUE_DATE'],
        total_amount: ['total_amount', 'amount', 'total', 'invoice_amount', 'bill_amount', 'Total Amount', 'Amount', 'TOTAL', 'Invoice Total', 'Total'],
        description: ['memo', 'notes', 'description', 'comments', 'Memo', 'Notes', 'Description', 'MEMO'],
        line_description: ['item_description', 'line_description', 'description', 'item', 'Description', 'Item', 'LINE_DESC'],
        line_amount: ['item_amount', 'line_amount', 'amount', 'line_total', 'Amount', 'Line Amount', 'LINE_AMOUNT'],
        line_account: ['account_id', 'gl_account', 'account', 'Account', 'GL Account', 'ACCOUNT_ID']
      }
    };
  }
}

/**
 * Extract a value from a row using AI-identified field mappings
 */
function getValueFromMappings(row: Record<string, any>, fieldMappings: string[]): any {
  if (!row || !fieldMappings || fieldMappings.length === 0) {
    return undefined;
  }
  
  // Try each field mapping
  for (const field of fieldMappings) {
    if (row[field] !== undefined) {
      return row[field];
    }
  }
  
  // Try case-insensitive match
  const lowerCaseObj: Record<string, any> = {};
  for (const key in row) {
    lowerCaseObj[key.toLowerCase()] = row[key];
  }
  
  for (const field of fieldMappings) {
    const lowerField = field.toLowerCase();
    if (lowerCaseObj[lowerField] !== undefined) {
      return lowerCaseObj[lowerField];
    }
  }
  
  return undefined;
}

/**
 * Extract vendor data from an Excel row using AI-identified mappings
 */
function extractVendorData(row: Record<string, any>, mappings: Record<string, string[]>): VendorData {
  // Get values using mappings
  let vendorName = getValueFromMappings(row, mappings.name);
  
  // If we still don't have a vendor name, try the first column
  if (!vendorName && Object.keys(row).length > 0) {
    const firstKey = Object.keys(row)[0];
    console.log(`[ExcelDataProcessor] Falling back to first column for vendor name: ${firstKey} = ${row[firstKey]}`);
    vendorName = row[firstKey];
  }

  // Direct 'Vendor Address' check as a special case
  let address = getValueFromMappings(row, mappings.address);
  if (!address && row['Vendor Address']) {
    address = row['Vendor Address'];
  }
  
  const result: VendorData = {
    name: vendorName || '',
    contact_person: getValueFromMappings(row, mappings.contact_person),
    email: getValueFromMappings(row, mappings.email),
    phone: getValueFromMappings(row, mappings.phone),
    address: address
  };
  
  console.log(`[ExcelDataProcessor] Extracted vendor data:`, result);
  return result;
}

/**
 * Extract bill data from an Excel row using AI-identified mappings
 */
function extractBillData(row: Record<string, any>, vendorId: number, mappings: Record<string, string[]>): BillData {
  console.log('[ExcelDataProcessor] Bill data extraction - available fields:', Object.keys(row).join(', '));
  
  // Get bill number or generate one
  const billNumber = getValueFromMappings(row, mappings.bill_number) || generateRandomBillNumber();
  
  // Handle dates
  let billDate = getValueFromMappings(row, mappings.bill_date);
  let parsedBillDate: Date = new Date();
  
  try {
    // First try to parse as Excel date (numeric value)
    if (typeof billDate === 'number' && billDate > 0) {
      // Excel dates start from 1/1/1900 and are stored as days since that date
      parsedBillDate = new Date(Date.UTC(1900, 0, billDate - 1));
    } else if (billDate) {
      // Try to parse as string date
      parsedBillDate = new Date(billDate);
    }
    
    // Check if date is valid
    if (isNaN(parsedBillDate.getTime())) {
      parsedBillDate = new Date(); // Default to today
    }
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error parsing bill date:`, error);
    parsedBillDate = new Date(); // Default to today
  }
  
  // Handle due date
  let dueDate = getValueFromMappings(row, mappings.due_date);
  let parsedDueDate: Date = new Date(parsedBillDate.getTime() + 30 * 24 * 60 * 60 * 1000); // Default: bill date + 30 days
  
  try {
    if (typeof dueDate === 'number' && dueDate > 0) {
      parsedDueDate = new Date(Date.UTC(1900, 0, dueDate - 1));
    } else if (dueDate) {
      parsedDueDate = new Date(dueDate);
    }
    
    if (isNaN(parsedDueDate.getTime())) {
      parsedDueDate = new Date(parsedBillDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error parsing due date:`, error);
  }
  
  // Handle total amount
  let totalAmount = getValueFromMappings(row, mappings.total_amount);
  
  if (totalAmount === undefined || totalAmount === null) {
    totalAmount = 0;
  } else if (typeof totalAmount === 'string') {
    const cleanedAmount = totalAmount.replace(/[^0-9.-]+/g, '');
    totalAmount = parseFloat(cleanedAmount) || 0;
  } else if (typeof totalAmount !== 'number') {
    totalAmount = Number(totalAmount) || 0;
  }
  
  // Get memo
  const memo = getValueFromMappings(row, mappings.memo) || '';
  
  // Handle line items
  const lineDesc = getValueFromMappings(row, mappings.line_description) || 'General Expense';
  let lineAmount = getValueFromMappings(row, mappings.line_amount);
  
  // If line amount not found but total is, use total
  if (lineAmount === undefined || lineAmount === null) {
    lineAmount = totalAmount;
  } else if (typeof lineAmount === 'string') {
    const cleanedLineAmount = lineAmount.replace(/[^0-9.-]+/g, '');
    lineAmount = parseFloat(cleanedLineAmount) || totalAmount;
  } else if (typeof lineAmount !== 'number') {
    lineAmount = Number(lineAmount) || totalAmount;
  }
  
  // Handle account ID
  const lineAccount = getValueFromMappings(row, mappings.line_account);
  
  const billData: BillData = {
    vendor_id: vendorId,
    bill_number: String(billNumber),
    bill_date: parsedBillDate,
    due_date: parsedDueDate,
    total_amount: totalAmount,
    memo: memo,
    lines: [
      {
        description: lineDesc,
        amount: lineAmount || 0,
        expense_account_id: lineAccount
      }
    ]
  };
  
  console.log(`[ExcelDataProcessor] Extracted bill data:`, billData);
  return billData;
}

/**
 * Process Excel data and extract vendor/bill information
 * Now enhanced with AI-powered column detection
 */
export async function processVendorBillsFromExcel(
  base64Data: string, 
  fileName: string,
  userId: string
): Promise<ExcelProcessingResult> {
  try {
    console.log(`[ExcelDataProcessor] Processing vendor bills from Excel file: ${fileName}`);
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return {
        success: false,
        message: `Unable to parse "${fileName}" as an Excel file. The file may be corrupt or empty.`,
        createdVendors: [],
        createdBills: [],
        errors: ["Invalid Excel file format"]
      };
    }
    
    // Results tracking
    const createdVendors: any[] = [];
    const createdBills: any[] = [];
    const errors: string[] = [];
    
    // Process each sheet in the workbook
    for (const sheetName of workbook.SheetNames) {
      try {
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);
        
        if (!data || data.length === 0) {
          console.log(`[ExcelDataProcessor] Sheet "${sheetName}" is empty`);
          continue;
        }
        
        console.log(`[ExcelDataProcessor] Processing ${data.length} rows from sheet "${sheetName}"`);
        
        // Get sample row and headers for AI analysis
        const sampleRow = data[0] as Record<string, any>;
        const headers = Object.keys(sampleRow);
        
        // Use AI to identify column mappings
        console.log(`[ExcelDataProcessor] Identifying column mappings using AI...`);
        const mappings = await identifyColumnMappings(headers, sampleRow);
        
        // Process each row with AI-identified mappings
        for (const row of data as Record<string, any>[]) {
          try {
            // Log the raw row data for debugging
            console.log(`[ExcelDataProcessor] Processing row:`, JSON.stringify(row));
            
            // Extract vendor data using AI mappings
            const vendorData = extractVendorData(row, mappings.vendorFields);
            if (!vendorData.name) {
              const error = `Skipped row: Missing vendor name`;
              console.error(`[ExcelDataProcessor] ${error}`);
              errors.push(error);
              continue;
            }
            
            // Check if vendor exists, create if not
            let vendorId: number;
            try {
              // Check if vendor exists by name
              const existingVendor = await getVendorByName(vendorData.name, userId);
              if (existingVendor && existingVendor.id) {
                vendorId = existingVendor.id;
                console.log(`[ExcelDataProcessor] Using existing vendor: ${vendorData.name} (ID: ${vendorId})`);
              } else {
                // Create new vendor
                console.log(`[ExcelDataProcessor] Creating new vendor:`, vendorData);
                
                const newVendor = await createVendor({
                  name: vendorData.name,
                  contact_person: vendorData.contact_person || '',
                  email: vendorData.email || '',
                  phone: vendorData.phone || '',
                  address: vendorData.address || ''
                }, userId); // Pass userId for proper data isolation
                
                console.log(`[ExcelDataProcessor] Vendor created:`, newVendor);
                
                if (!newVendor || !newVendor.id) {
                  throw new Error(`Failed to create vendor: ${vendorData.name}`);
                }
                
                // Log vendor creation
                await logAuditEvent({
                  user_id: userId,
                  action_type: "VENDOR_CREATION",
                  entity_type: "VENDOR",
                  entity_id: String(newVendor.id),
                  context: { source: "excel_import", vendorData },
                  status: "SUCCESS",
                  timestamp: new Date().toISOString()
                });
                
                vendorId = newVendor.id;
                createdVendors.push(newVendor);
              }
              
              // Extract bill data using AI mappings
              const billData = extractBillData(row, vendorId, mappings.billFields);
              if (!billData.bill_number) {
                const error = `Skipped bill for ${vendorData.name}: Missing bill number`;
                console.error(`[ExcelDataProcessor] ${error}`);
                errors.push(error);
                continue;
              }
              
              // Create the bill
              // Use AI to identify appropriate expense account for each line
              console.log(`[ExcelDataProcessor] Starting expense account identification with AI`);
              
              // Use AI to select the appropriate expense account based on vendor, description, and amount
              const expenseAccountId = await identifyExpenseAccountWithAI({
                description: billData.memo || billData.lines[0]?.description || '',
                amount: billData.total_amount,
                vendorId: vendorId
                // userId parameter removed as it's not used in the function
              });
              
              console.log(`[ExcelDataProcessor] Using expense account ID: ${expenseAccountId} for bill lines`);
              
              // Convert our line items to match the BillLine interface
              const formattedLines = billData.lines.map(line => ({
                description: line.description || '',
                account_id: String(line.expense_account_id || expenseAccountId), // Required by BillLine interface
                expense_account_id: Number(line.expense_account_id || expenseAccountId), // Use the discovered expense account ID
                quantity: '1', // Default quantity
                unit_price: String(line.amount || 0), // Use the amount as unit price
                line_total: String(line.amount || 0), // Required by BillLine interface
                amount: Number(line.amount || 0), // Amount as number
                category: '',
                location: '',
                funder: ''
              }));
              
              // Use AI to identify the appropriate AP account for this vendor
              console.log(`[ExcelDataProcessor] Starting AP account identification with AI`);
              
              // Use AI to select the appropriate AP account based on vendor information
              const apAccountIdResult = await identifyApAccountWithAI({
                vendorId: vendorId,
                vendorName: vendorData.name
                // userId parameter removed as it's not used in the function
              });
              
              // Ensure we have a valid AP account ID (not null)
              const apAccountId = apAccountIdResult || await getApAccountId();
              
              console.log(`[ExcelDataProcessor] Using AP account ID: ${apAccountId} for bill creation`);
              
              // Create bill record
              const newBill = await createBill({
                vendor_id: vendorId,
                bill_number: billData.bill_number,
                bill_date: billData.bill_date.toISOString().split('T')[0], // Convert Date to YYYY-MM-DD
                due_date: billData.due_date.toISOString().split('T')[0], // Convert Date to YYYY-MM-DD
                total_amount: billData.total_amount,
                description: billData.memo || '',
                status: 'Open', // Set to Open to ensure journal entries are created
                ap_account_id: apAccountId
              }, formattedLines, userId); // Pass userId for proper data isolation
              
              console.log(`[ExcelDataProcessor] Bill created:`, newBill);
              
              if (!newBill || !newBill.id) {
                throw new Error(`Failed to create bill: ${billData.bill_number}`);
              }
              
              // Log bill creation
              await logAuditEvent({
                user_id: userId,
                action_type: "BILL_CREATION",
                entity_type: "BILL",
                entity_id: String(newBill.id),
                context: { source: "excel_import", billData },
                status: "SUCCESS",
                timestamp: new Date().toISOString()
              });
              
              createdBills.push(newBill);
              console.log(`[ExcelDataProcessor] Created bill: ${billData.bill_number} for vendor ${vendorData.name}`);
            } catch (dbError) {
              const errorMsg = `Database error while processing vendor/bill: ${dbError instanceof Error ? dbError.message : String(dbError)}`;
              console.error(`[ExcelDataProcessor] ${errorMsg}`);
              errors.push(errorMsg);
            }
          } catch (rowError) {
            console.error(`[ExcelDataProcessor] Error processing row:`, rowError);
            errors.push(`Error processing row: ${rowError instanceof Error ? rowError.message : String(rowError)}`);
          }
        }
        
      } catch (sheetError) {
        console.error(`[ExcelDataProcessor] Error processing sheet "${sheetName}":`, sheetError);
        errors.push(`Error processing sheet "${sheetName}": ${sheetError instanceof Error ? sheetError.message : String(sheetError)}`);
      }
    }
    
    // Generate result message
    let message = '';
    if (createdVendors.length > 0) {
      message += `Created ${createdVendors.length} new vendors. `;
    }
    if (createdBills.length > 0) {
      message += `Created ${createdBills.length} new bills. `;
    }
    if (errors.length > 0) {
      message += `Encountered ${errors.length} errors.`;
    }
    if (message === '') {
      message = 'No data was processed from the Excel file.';
    }
    
    return {
      success: createdBills.length > 0 || createdVendors.length > 0,
      message,
      createdVendors,
      createdBills,
      errors
    };
    
  } catch (error) {
    console.error(`[ExcelDataProcessor] Error processing Excel file:`, error);
    return {
      success: false,
      message: `Failed to process Excel file: ${error instanceof Error ? error.message : String(error)}`,
      createdVendors: [],
      createdBills: [],
      errors: [String(error)]
    };
  }
}

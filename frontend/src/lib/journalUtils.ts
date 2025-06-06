import { Journal, JournalLine, createJournal } from '@/lib/accounting/journalQueries';
import { sql } from '@vercel/postgres';
import Anthropic from "@anthropic-ai/sdk";

/**
 * Interface for a simplified journal entry structure that AI can generate
 */
export interface AIJournalEntry {
  memo: string;
  journal_date: string;
  journal_type?: string;
  reference_number?: string;
  lines: {
    account_code_or_name: string;
    description: string;
    debit?: number;
    credit?: number;
    category?: string;
    location?: string;
    vendor?: string;
    funder?: string;
  }[];
}

/**
 * Find accounts by name or code for journal entry creation
 * @param accountSearch - Account name or code to search for
 */
export async function findAccountByNameOrCode(accountSearch: string): Promise<{id: number, name: string, code: string} | null> {
  // Normalize the search string
  const search = accountSearch.trim().toLowerCase();
  
  try {
    // First try to find by exact code match
    const exactCodeResult = await sql`
      SELECT id, name, code
      FROM accounts
      WHERE LOWER(code) = ${search}
      LIMIT 1
    `;
    
    if (exactCodeResult.rows.length > 0) {
      return exactCodeResult.rows[0] as {id: number, name: string, code: string};
    }
    
    // Then try by exact name match
    const exactNameResult = await sql`
      SELECT id, name, code
      FROM accounts
      WHERE LOWER(name) = ${search}
      LIMIT 1
    `;
    
    if (exactNameResult.rows.length > 0) {
      return exactNameResult.rows[0] as {id: number, name: string, code: string};
    }
    
    // Then try by partial matches
    const partialResult = await sql`
      SELECT id, name, code
      FROM accounts
      WHERE LOWER(name) LIKE ${'%' + search + '%'} OR LOWER(code) LIKE ${'%' + search + '%'}
      LIMIT 5
    `;
    
    if (partialResult.rows.length > 0) {
      // Return the first match
      return partialResult.rows[0] as {id: number, name: string, code: string};
    }
    
    return null;
  } catch (error) {
    console.error("[journalUtils] Error finding account:", error);
    return null;
  }
}

/**
 * Find an account using AI-powered matching
 * @param accountSearch - Account name or keyword to search for
 * @param transactionContext - Additional context about the transaction
 * @param isDebit - Whether this is a debit entry
 */
export async function findAccountWithAI(
  accountSearch: string, 
  transactionContext: string, 
  isDebit: boolean
): Promise<{id: number, name: string, code: string} | null> {
  // First try the existing database search methods
  const exactMatch = await findAccountByNameOrCode(accountSearch);
  if (exactMatch) {
    console.log(`[journalUtils] Found exact account match: ${exactMatch.code}: ${exactMatch.name}`);
    return exactMatch;
  }
  
  // If no exact match, use AI to find the most appropriate account
  console.log(`[journalUtils] Using AI to find appropriate account for: "${accountSearch}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    // Get all available accounts for context
    const availableAccounts = await getAccounts();
    
    if (availableAccounts.length === 0) {
      console.log('[journalUtils] No accounts available for AI matching');
      return await findFallbackAccount(isDebit ? 'expense' : 'revenue');
    }
    
    // Limit to a reasonable number of accounts to avoid token limitations
    const accountsForContext = availableAccounts.slice(0, 30);
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 150,
      temperature: 0.1,
      system: `You are an accounting AI that matches transaction descriptions to the most appropriate account.
      Given a transaction description and a list of available accounts, identify the most suitable account.
      Consider accounting principles and whether the amount is a debit or credit.
      
      Respond ONLY with the account code that best matches. Just the code, nothing else.`,
      messages: [
        { 
          role: "user", 
          content: `
            Transaction: "${accountSearch}"
            Transaction context: "${transactionContext}"
            Is debit_amount: ${isDebit ? "Yes" : "No"}
            
            Available accounts:
            ${accountsForContext.map(a => `Code: ${a.code}, Name: ${a.name}, Type: ${a.account_type}`).join('\n')}
            
            What is the most appropriate account code for this transaction?
          `
        }
      ]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    // Extract just the account code (remove any extra text)
    const accountCode = responseText.replace(/[^0-9a-zA-Z-]/g, '').trim();
    
    if (accountCode) {
      // Find the account with this code
      const account = availableAccounts.find(a => a.code === accountCode);
      if (account) {
        console.log(`[journalUtils] AI selected account ${account.code}: ${account.name}`);
        return { id: account.id, name: account.name, code: account.code };
      }
    }
    
    // If AI couldn't find a match, log and fall back to the existing fallback logic
    console.log(`[journalUtils] AI could not find a matching account, falling back to type-based matching`);
    return await findFallbackAccount(isDebit ? 'expense' : 'revenue'); 
  } catch (error) {
    console.error('[journalUtils] Error using AI for account matching:', error);
    return await findFallbackAccount(); // Fall back to existing method
  }
}

/**
 * Find a fallback account when the exact match isn't found
 * @param accountType - Optional type of account to look for
 */
export async function findFallbackAccount(accountType?: 'cash' | 'revenue' | 'expense'): Promise<{id: number, name: string, code: string} | null> {
  try {
    let query = '';
    
    if (accountType === 'cash') {
      // Look for cash or bank accounts
      query = `
        SELECT id, name, code
        FROM accounts
        WHERE LOWER(name) LIKE '%cash%' OR LOWER(name) LIKE '%bank%' OR 
              LOWER(account_type) = 'asset' AND (LOWER(name) LIKE '%checking%' OR LOWER(name) LIKE '%operating%')
        LIMIT 1
      `;
    } else if (accountType === 'revenue') {
      // Look for revenue/income accounts
      query = `
        SELECT id, name, code
        FROM accounts
        WHERE LOWER(account_type) = 'revenue' OR 
              LOWER(name) LIKE '%sales%' OR LOWER(name) LIKE '%revenue%' OR LOWER(name) LIKE '%income%'
        LIMIT 1
      `;
    } else if (accountType === 'expense') {
      // Look for expense accounts
      query = `
        SELECT id, name, code
        FROM accounts
        WHERE LOWER(account_type) = 'expense' OR
              LOWER(name) LIKE '%expense%' OR LOWER(name) LIKE '%cost%'
        LIMIT 1
      `;
    } else {
      // Generic fallback - try to find any account
      query = `
        SELECT id, name, code
        FROM accounts
        LIMIT 1
      `;
    }
    
    const result = await sql.query(query);
    
    if (result.rows.length > 0) {
      return result.rows[0] as {id: number, name: string, code: string};
    }
    
    return null;
  } catch (error) {
    console.error("[journalUtils] Error finding fallback account:", error);
    return null;
  }
}

/**
 * Get all active accounts from the database
 */
export async function getAccounts(): Promise<{id: number, name: string, code: string, account_type: string}[]> {
  try {
    const result = await sql`
      SELECT id, name, code, account_type
      FROM accounts
      WHERE is_active = true
      ORDER BY code
    `;
    
    return result.rows as {id: number, name: string, code: string, account_type: string}[];
  } catch (error) {
    console.error("[journalUtils] Error getting accounts:", error);
    return [];
  }
}

/**
 * Convert an AI-generated journal entry into the system's Journal format
 * @param aiJournal - The AI-generated journal entry
 * @param userId - The user creating the journal
 */
export async function convertAIJournalToSystem(aiJournal: AIJournalEntry, userId: string): Promise<{ journal: Journal, missingAccounts: string[] }> {
  const missingAccounts: string[] = [];
  const journalLines: JournalLine[] = [];
  
  // Calculate debit and credit totals to check balance
  let totalDebits = 0;
  let totalCredits = 0;
  
  // Process each journal line to find account IDs
  for (let i = 0; i < aiJournal.lines.length; i++) {
    const line = aiJournal.lines[i];
    
    // Validate line has either debit or credit
    if ((line.debit === undefined || line.debit === 0) && (line.credit === undefined || line.credit === 0)) {
      throw new Error(`Journal line ${i+1} must have either a debit or credit value`);
    }
    
    // Determine if this is a debit or credit line
    const isDebit = line.debit !== undefined && line.debit > 0;
    
    // Use AI to find the most appropriate account
    // Pass the full journal memo as transaction context for better matching
    const account = await findAccountWithAI(
      line.account_code_or_name,
      aiJournal.memo || '',
      isDebit
    );
    
    // If no account found, add to missing accounts
    if (!account) {
      missingAccounts.push(line.account_code_or_name);
      continue;
    }
    
    console.log(`[journalUtils] Using account ${account.code}: ${account.name} for '${line.account_code_or_name}'`);
    
    // Add to running totals for balance check
    totalDebits += line.debit || 0;
    totalCredits += line.credit || 0;
    
    // Create the journal line
    journalLines.push({
      line_number: i + 1,
      account_id: account.id,
      account_name: account.name,
      account_code: account.code,
      description: line.description,
      debit_amount: line.debit || 0,
      credit_amount: line.credit || 0,
      category: line.category,
      location: line.location,
      vendor: line.vendor,
      funder: line.funder
    });
  }
  
  // Check for balanced journal
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    // Attempt to auto-balance using suspense account 9999
    const diff = parseFloat((totalDebits - totalCredits).toFixed(2));
    const suspenseAccountSearch = '9999';
    const suspenseAccount = await findAccountByNameOrCode(suspenseAccountSearch);

    if (suspenseAccount) {
      journalLines.push({
        line_number: journalLines.length + 1,
        account_id: suspenseAccount.id,
        account_name: suspenseAccount.name,
        account_code: suspenseAccount.code,
        description: 'Auto-balancing entry',
        debit_amount: diff < 0 ? Math.abs(diff) : 0,
        credit_amount: diff > 0 ? diff : 0,
      });

      // Recalculate totals
      totalDebits += diff < 0 ? Math.abs(diff) : 0;
      totalCredits += diff > 0 ? diff : 0;
    } else {
      // If no suspense account found, abort with clear message
      throw new Error("Journal entry is not balanced and suspense account '9999' could not be found. Please create this account or ensure a valid balancing account is available.");
    }
  }

  // Re-check balance after auto-balancing
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry is not balanced. Total debits: ${totalDebits.toFixed(2)}, Total credits: ${totalCredits.toFixed(2)}`);
  }
  
  // Create the journal object
  const journal: Journal = {
    journal_date: aiJournal.journal_date,
    journal_type: aiJournal.journal_type || 'GJ',
    memo: aiJournal.memo,
    reference_number: aiJournal.reference_number,
    is_posted: true, // Set to posted status by default
    lines: journalLines,
    source: 'AI Assistant'
  };
  
  return { journal, missingAccounts };
}

/**
 * Create a journal entry from an AI-generated journal
 * @param aiJournal - The AI-generated journal
 * @param userId - The user creating the journal
 */
export async function createJournalFromAI(aiJournal: AIJournalEntry, userId: string): Promise<{
  success: boolean;
  journalId?: number;
  message: string;
  missingAccounts?: string[];
}> {
  console.log(`[journalUtils] Creating journal from AI with userId: ${userId}`);
  console.log(`[journalUtils] Journal data:`, {
    memo: aiJournal.memo,
    journal_date: aiJournal.journal_date,
    journal_type: aiJournal.journal_type,
    reference_number: aiJournal.reference_number,
    lineCount: aiJournal.lines?.length
  });
  try {
    // Convert AI journal format to system format
    const { journal, missingAccounts } = await convertAIJournalToSystem(aiJournal, userId);
    
    // If there are missing accounts, return error
    if (missingAccounts.length > 0) {
      return {
        success: false,
        message: `Could not find the following accounts: ${missingAccounts.join(', ')}`,
        missingAccounts
      };
    }
    
    // Check if journal has lines
    if (journal.lines.length === 0) {
      return {
        success: false,
        message: 'Journal must have at least one line'
      };
    }
    
    // Create the journal
    const journalId = await createJournal(journal, userId);
    
    return {
      success: true,
      journalId,
      message: `Journal entry created successfully with ID: ${journalId}`
    };
  } catch (error) {
    console.error("[journalUtils] Error creating journal:", error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error creating journal'
    };
  }
}

/**
 * Extract a potential journal entry from text using common patterns
 * @param text - Text containing journal entry details
 */
export function extractJournalEntryFromText(text: string): AIJournalEntry | null {
  // This is a simple implementation that could be improved with more sophisticated parsing
  try {
    // Check if there's structured journal data in the text
    const journalMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (journalMatch && journalMatch[1]) {
      try {
        // Try parsing JSON directly
        const journalData = JSON.parse(journalMatch[1]);
        if (journalData.memo && journalData.journal_date && Array.isArray(journalData.lines)) {
          return journalData as AIJournalEntry;
        }
      } catch (e) {
        console.warn("[journalUtils] Failed to parse JSON from text");
      }
    }
    
    // Fallback to more basic parsing for a simpler format
    return null;
  } catch (error) {
    console.error("[journalUtils] Error extracting journal entry from text:", error);
    return null;
  }
}

/**
 * Determine if a message is a request to create a journal entry
 * @param message - The user's message
 */
export function isJournalCreationQuery(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  
  // Check for higher-priority query types first
  if (isJournalPostingQuery(message)) {
    return false;
  }
  
  // Also check for edit queries to avoid confusion
  if (isJournalEditQuery(message)) {
    console.log('[isJournalCreationQuery] Detected potential edit query, not treating as creation');
    return false;
  }
  
  // Check for special blocking terms that indicate this is likely an edit, not a creation
  const editIndicators = ['change', 'update', 'modify', 'edit', 'set', 'change the value', 'update the amount'];
  if (editIndicators.some(term => normalizedMessage.includes(term))) {
    console.log('[isJournalCreationQuery] Contains edit indicators, not treating as creation');
    return false;
  }
  
  // List of keywords that suggest the user wants to create a journal entry
  const journalKeywords = [
    'create journal', 'make journal', 'new journal',
    'create entry', 'make entry', 'new entry',
    'record transaction', 'book entry',
    'log transaction', 'enter transaction', 'add transaction',
    'record revenue', 'record payment', 'record expense',
    'book revenue', 'book payment', 'book expense'
  ];
  
  // More exact match for 'journal entry' to prevent false positives
  if (normalizedMessage.includes('journal entry')) {
    return /(create|make|new|add)\s+journal\s+entry/.test(normalizedMessage);
  }
  
  return journalKeywords.some(keyword => normalizedMessage.includes(keyword));
}

/**
 * Determine if a message is asking for journal summary information
 * @param message - The user's message
 */
export function isJournalSummaryQuery(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  
  // List of keywords that suggest the user wants journal summary information
  const summaryKeywords = [
    'journal summary', 'summarize journals', 'summary of journals',
    'unposted journals', 'unpublished journals', 'draft journals',
    'journal status', 'journal report', 'ledger summary',
    'show me journals', 'list journals', 'pending journals',
    'journals overview', 'journal statistics', 'unposted journal entries',
    'summary of unposted', 'summary of my unposted'
  ];
  
  return summaryKeywords.some(keyword => normalizedMessage.includes(keyword));
}

/**
 * Get recent unposted journal entries
 * @param limit - Maximum number of journals to return (default: 20)
 */
export async function getUnpostedJournals(limit: number = 20): Promise<{ id: number, journal_date: string, memo: string, total_debits: number }[]> {
  try {
    const query = `
      SELECT id, journal_date, memo, total_debits
      FROM journals
      WHERE is_posted = false AND is_deleted = false
      ORDER BY journal_date DESC, id DESC
      LIMIT $1
    `;
    
    const result = await sql.query(query, [limit]);
    return result.rows;
  } catch (error) {
    console.error('[journalUtils] Error fetching unposted journals:', error);
    return [];
  }
}

/**
 * Use AI to detect if the user is requesting a specific journal ID
 * @param query - The user's query about posting journals
 * @returns The specific journal ID if detected, or null if not
 */
export async function detectSpecificJournalId(query: string): Promise<number | null> {
  console.log(`[journalUtils] Using AI to detect specific journal ID in: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 100,
      temperature: 0.1,
      system: `You extract the specific journal ID when a user is requesting to post a specific journal entry. 
      You ONLY respond with a single number or "null" if no specific journal ID is mentioned.
      - Return ONLY the numeric ID if the user is clearly asking about a specific journal ID.
      - Return "null" if the user is making a general request about multiple journals, all journals, or recent journals.
      - DO NOT include any other text, explanation or JSON formatting in your response.`,
      messages: [{ role: "user", content: `Query: "${query}"` }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text.trim() : '';
    
    if (responseText === "null" || responseText === "") {
      console.log(`[journalUtils] No specific journal ID detected`);
      return null;
    }
    
    const journalId = parseInt(responseText, 10);
    if (!isNaN(journalId)) {
      console.log(`[journalUtils] Detected specific journal ID: ${journalId}`);
      
      // Verify this journal exists and is unposted
      const verifyQuery = `
        SELECT id FROM journals 
        WHERE id = $1 AND is_posted = false AND is_deleted = false
      `;
      
      const verifyResult = await sql.query(verifyQuery, [journalId]);
      if (verifyResult.rows.length > 0) {
        console.log(`[journalUtils] Verified journal ID ${journalId} exists and is unposted`);
        return journalId;
      } else {
        console.log(`[journalUtils] Journal ID ${journalId} not found or already posted`);
        // Return the ID anyway, so we can generate an appropriate error message
        return journalId;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[journalUtils] Error detecting specific journal ID:', error);
    return null;
  }
}

/**
 * Find journals to post using AI-powered matching
 * @param query - The user's query about posting journals
 */
export async function findJournalsToPostWithAI(query: string): Promise<number[]> {
  console.log(`[journalUtils] Using AI to find journals to post from: "${query}"`);
  
  try {
    // First, check for specific journal ID using AI
    const specificJournalId = await detectSpecificJournalId(query);
    
    if (specificJournalId !== null) {
      // Before returning the ID, verify it exists and is unposted
      const verifyQuery = `
        SELECT id FROM journals 
        WHERE id = $1 AND is_posted = false AND is_deleted = false
      `;
      
      const verifyResult = await sql.query(verifyQuery, [specificJournalId]);
      if (verifyResult.rows.length > 0) {
        console.log(`[journalUtils] Verified journal ID ${specificJournalId} exists and is unposted`);
        return [specificJournalId];
      } else {
        console.log(`[journalUtils] Journal ID ${specificJournalId} not found or already posted`);
      }
    }
    
    // If no specific ID match or ID wasn't found, continue with AI approach
    // Get recent unposted journals
    const unpostedJournals = await getUnpostedJournals(20);
    
    if (unpostedJournals.length === 0) {
      console.log('[journalUtils] No unposted journals available');
      return [];
    }
    
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 250,
      temperature: 0.1,
      system: `You help identify which journal entries a user wants to post based on their natural language request.
      Given a list of unposted journals and a user query, determine which journals the user likely wants to post.
      Consider dates, amounts, descriptions, and any identifying information in the query.
      
      Respond with ONLY the journal IDs that match the user's intent, as a JSON array.`,
      messages: [
        { 
          role: "user", 
          content: `
            User query: "${query}"
            
            Available unposted journals:
            ${unpostedJournals.map(j => 
              `ID: ${j.id}, Date: ${j.journal_date}, Memo: ${j.memo}, Amount: $${j.total_debits}`
            ).join('\n')}
            
            Which journal IDs should be posted based on the query?
          `
        }
      ]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Extract JSON array from response
      const match = responseText.match(/\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]/);
      if (match) {
        const journalIds = JSON.parse(match[0]) as number[];
        console.log(`[journalUtils] AI identified journals to post: ${journalIds.join(', ')}`);
        return journalIds;
      }
    } catch (error) {
      console.error('[journalUtils] Error parsing journal IDs:', error);
    }
    
    return [];
  } catch (error) {
    console.error('[journalUtils] Error finding journals to post:', error);
    return [];
  }
}

/**
 * Determine if a message is asking to post journal entries
 * @param message - The user's message
 */
export function isJournalPostingQuery(message: string): boolean {
  // Normalize message
  const normalizedMessage = message.toLowerCase();
  
  // Patterns for journal posting requests
  const journalPostPatterns = [
    /post\s+(all\s+|the\s+|all\s+the\s+)?(journal|entry|entries)/i,
    /mark\s+(journal|entry|entries).+posted/i,
    /finalize\s+(journal|entry|entries)/i,
    /approve\s+(journal|entry|entries)/i,
    /confirm\s+(journal|entry|entries)/i,
    /complete\s+(journal|entry|entries)/i,
  ];
  
  // Check for ID numbers in posting requests
  const journalIdPostPatterns = [
    /post\s+(journal|entry|entries)\s+#?(\d+)/i,
    /post\s+#?(\d+)/i,
  ];
  
  // Check for general posting patterns
  const hasGeneralPostPattern = journalPostPatterns.some(pattern => 
    pattern.test(normalizedMessage)
  );
  
  // Check for ID-specific posting patterns
  const hasIdPostPattern = journalIdPostPatterns.some(pattern => 
    pattern.test(normalizedMessage)
  );
  
  // Additional string-based keywords check
  const stringKeywords = [
    'post all je', 'post these je', 'post journal entry', 'post unposted',
    'finalize journal', 'mark as posted', 'post all journals'
  ];
  const hasKeyword = stringKeywords.some(keyword => normalizedMessage.includes(keyword));
  
  return hasGeneralPostPattern || hasIdPostPattern || hasKeyword;
}

/**
 * Determine if a message is requesting to upload an attachment to a journal entry
 */
export function isJournalAttachmentQuery(message: string): boolean {
  const normalized = message.toLowerCase();

  // Regex to match patterns like "attach file to journal 123" or "upload attachment to journal id 45"
  const idPattern = /(attach|upload).*journal.*(id|#)?\s*(\d+)/i;
  if (idPattern.test(message)) return true;

  const keywords = [
    'attach to journal',
    'upload attachment',
    'attach file',
    'add attachment',
    'upload file',
    'attach document'
  ];

  return keywords.some(k => normalized.includes(k));
}

/**
 * Determine if a message is requesting to delete an attachment from a journal entry
 */
export function isDeleteAttachmentQuery(message: string): boolean {
  const normalized = message.toLowerCase();

  console.log('[isDeleteAttachmentQuery] Checking:', normalized);
  
  // Regex to match patterns like "delete attachment from journal 123" or "remove file from journal id 45"
  const idPattern = /(delete|remove|drop)\s+(the\s+)?(attachment|file|document).*from\s+journal.*(id|#)?\s*(\d+)/i;
  const simplePattern = /(delete|remove|drop)\s+(the\s+)?(attachment|file|document).*journal\s*(id|#)?\s*(\d+)/i;
  const fileIdPattern = /(delete|remove|drop)\s+(the\s+)?(attachment|file|document)\s*(id|#)?\s*(\d+)/i;
  
  if (idPattern.test(normalized)) {
    console.log('[isDeleteAttachmentQuery] Matched idPattern');
    return true;
  }
  
  if (simplePattern.test(normalized)) {
    console.log('[isDeleteAttachmentQuery] Matched simplePattern');
    return true;
  }
  
  if (fileIdPattern.test(normalized)) {
    console.log('[isDeleteAttachmentQuery] Matched fileIdPattern');
    return true;
  }
  
  const keywords = [
    'delete attachment',
    'remove attachment',
    'delete file from journal',
    'remove file from journal',
    'remove document from journal',
    'delete document from journal',
    'remove the attachment',
    'delete the attachment',
    'delete the file from the journal',
    'drop attachment'
  ];
  
  const matches = keywords.some(k => normalized.includes(k));
  if (matches) {
    console.log('[isDeleteAttachmentQuery] Matched keyword');
  }
  return matches;
}

/**
 * Determine if a message is requesting to edit/modify a journal entry
 */
export function isJournalEditQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  
  console.log('[isJournalEditQuery] Checking:', normalized);
  
  // Regex patterns to match edit requests with journal IDs
  const updatePattern = /(edit|update|modify|change|adjust)\s+(journal|entry|transaction)\s*(id|#)?\s*(\d+)/i;
  
  // Improved pattern to match "change the value of journal entry 72 to $2000"
  const valueChangePattern = /(change|update|modify|adjust|set)\s+(the\s+)?(value|amount|total|debit|credit)\s+of\s+(journal|entry|transaction)\s*(entry\s+)?(id|#)?\s*(\d+)(\s+to\s+[\$]?\d+)?/i;
  
  const journalNumberPattern = /(edit|update|modify|change|adjust)\s+journal\s+(entry\s+)?(number\s+)?(\d+)/i;
  
  // Special pattern for "to $X" format
  const toAmountPattern = /(journal|entry|transaction)\s*(entry\s+)?(id|#|number)?\s*(\d+)\s+to\s+[\$]?(\d+)/i;
  
  if (updatePattern.test(normalized)) {
    console.log('[isJournalEditQuery] Matched updatePattern');
    return true;
  }
  
  if (valueChangePattern.test(normalized)) {
    console.log('[isJournalEditQuery] Matched valueChangePattern');
    return true;
  }
  
  if (journalNumberPattern.test(normalized)) {
    console.log('[isJournalEditQuery] Matched journalNumberPattern');
    return true;
  }
  
  if (toAmountPattern.test(normalized)) {
    console.log('[isJournalEditQuery] Matched toAmountPattern');
    return true;
  }
  
  // Keywords that suggest journal editing
  const editKeywords = [
    'edit journal',
    'update journal',
    'modify journal',
    'change journal',
    'fix journal',
    'revise journal',
    'correct journal',
    'adjust journal',
    'edit entry',
    'update entry',
    'modify entry',
    'change entry',
    'change transaction',
    'update transaction',
    'edit transaction',
    'fix entry',
    'edit the amount',
    'change the amount',
    'update the value',
    'modify the debit',
    'modify the credit',
    'change the memo',
    'update the description',
    'edit the date',
    'change the account'
  ];
  
  const matches = editKeywords.some(k => normalized.includes(k));
  if (matches) {
    console.log('[isJournalEditQuery] Matched keyword');
  }
  return matches;
}

/**
 * Extract journal ID from a journal edit query
 */
export function extractJournalIdFromEditQuery(message: string): number | null {
  const normalized = message.toLowerCase();
  
  // Various regex patterns to match journal IDs in different contexts
  const patterns = [
    // Change the value of journal entry 72 to $2000
    /(change|update|set|modify)\s+(the\s+)?(value|amount|total|debit|credit)\s+of\s+(journal|entry)\s*(entry\s+)?(id|#)?\s*(\d+)\s+to\s+\$?(\d+(?:\.\d+)?)/i,
    
    // Entry 72 to $2000
    /(journal|entry|transaction)\s*(entry\s+)?(id|#|number)?\s*(\d+)\s+to\s+[\$]?(\d+)/i,
    
    // Edit journal ID 123
    /(edit|update|modify|change|adjust)\s+(journal|entry|transaction)\s*(id|#)?\s*(\d+)/i,
    
    // Edit journal number 123
    /(edit|update|modify|change|adjust)\s+journal\s+(entry\s+)?(number\s+)?(\d+)/i,
    
    // Journal 123
    /journal\s*(entry)?\s*(id|#)?\s*(\d+)/i,
    
    // Entry 123
    /entry\s*(id|#)?\s*(\d+)/i,
    
    // Transaction 123
    /transaction\s*(id|#)?\s*(\d+)/i,
    
    // The value in #123
    /(#|number|id)\s*(\d+)/i,
    
    // Just the number by itself if all else fails
    /(\d+)/i
  ];
  
  // Try each pattern in order
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      // Special handling for patterns with multiple numbers
      if (match.length > 5 && pattern.toString().includes('to')) {
        // For patterns like "change value of journal entry 72 to $2000"
        // we need to find the journal ID, not the amount
        for (let i = 0; i < match.length; i++) {
          // Check each capture group
          if (match[i] && !isNaN(parseInt(match[i]))) {
            // Look for the first number, which should be the journal ID
            // But make sure it's not the amount (typically after "to")
            const fullStr = match[0];
            const idIndex = fullStr.indexOf(match[i]);
            const toIndex = fullStr.toLowerCase().indexOf(' to ');
            
            // If this number appears before "to", it's likely the journal ID
            if (toIndex === -1 || idIndex < toIndex) {
              console.log(`[extractJournalIdFromEditQuery] Found ID ${match[i]} in pattern`);
              return parseInt(match[i]);
            }
          }
        }
      }
      
      // For simpler patterns
      const lastMatch = match[match.length - 1];
      if (lastMatch && !isNaN(parseInt(lastMatch))) {
        console.log(`[extractJournalIdFromEditQuery] Using last match: ${lastMatch}`);
        return parseInt(lastMatch);
      }
    }
  }
  
  return null;
}

/**
 * Extract edit details from a journal edit query
 */
export function extractJournalEditDetails(message: string): {
  field?: 'amount' | 'debit' | 'credit' | 'memo' | 'date' | 'account';
  value?: string | number;
  lineIndex?: number;
} {
  const normalized = message.toLowerCase();
  const result: ReturnType<typeof extractJournalEditDetails> = {};
  
  // Extract amount changes with the specific format "change the value of journal entry X to $Y"
  const valueOfJournalMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?(value|amount|total)\s+of\s+(journal|entry)\s*(entry\s+)?(id|#)?\s*(\d+)\s+to\s+\$?(\d+(?:\.\d+)?)/i);
  if (valueOfJournalMatch) {
    result.field = 'amount';
    result.value = parseFloat(valueOfJournalMatch[8]);
    console.log(`[extractJournalEditDetails] Parsed amount ${result.value} from 'value of journal' pattern`);
    return result;
  }
  
  // Extract amount changes with simpler format
  const amountMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?(value|amount|total)\s+to\s+\$?(\d+(?:\.\d+)?)/i);
  if (amountMatch) {
    result.field = 'amount';
    result.value = parseFloat(amountMatch[4]);
    console.log(`[extractJournalEditDetails] Parsed amount ${result.value} from simple pattern`);
    return result;
  }
  
  // Extract debit changes
  const debitMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?debit\s+to\s+\$?(\d+(?:\.\d+)?)/i);
  if (debitMatch) {
    result.field = 'debit';
    result.value = parseFloat(debitMatch[3]);
    return result;
  }
  
  // Extract credit changes
  const creditMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?credit\s+to\s+\$?(\d+(?:\.\d+)?)/i);
  if (creditMatch) {
    result.field = 'credit';
    result.value = parseFloat(creditMatch[3]);
    return result;
  }
  
  // Extract memo changes
  const memoMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?memo\s+to\s+["']([^"']+)["']/i);
  if (memoMatch) {
    result.field = 'memo';
    result.value = memoMatch[3];
    return result;
  }
  
  // Extract date changes
  const dateMatch = normalized.match(/(change|update|set|modify)\s+(the\s+)?date\s+to\s+["']([^"']+)["']/i);
  if (dateMatch) {
    result.field = 'date';
    result.value = dateMatch[3];
    return result;
  }
  
  // Try to determine field type from context
  if (!result.field && normalized.includes('value')) {
    result.field = 'amount';
  } else if (!result.field && normalized.includes('debit')) {
    result.field = 'debit';
  } else if (!result.field && normalized.includes('credit')) {
    result.field = 'credit';
  } else if (!result.field && normalized.includes('memo')) {
    result.field = 'memo';
  } else if (!result.field && normalized.includes('date')) {
    result.field = 'date';
  }

  // Generic value extraction (as fallback)
  const valueMatch = normalized.match(/to\s+\$?(\d+(?:\.\d+)?)/i);
  if (valueMatch) {
    result.value = parseFloat(valueMatch[1]);
    console.log(`[extractJournalEditDetails] Extracted value ${result.value} as fallback`);
    if (!result.field) {
      result.field = 'amount'; // Default to amount if no field specified
      console.log(`[extractJournalEditDetails] Defaulting to field type 'amount'`);
    }
  }
  
  return result;
}

/**
 * Determine if a message is requesting to reverse a journal entry
 */
export function isJournalReversalQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  console.log(`[DEBUG] isJournalReversalQuery checking: "${normalized}"`);
  
  // Super simple pattern that should catch all variations
  if (/(reverse|reversal|cancel|undo|offset).*?(journal|entry).*?(\d+)|(journal|entry).*?(\d+).*?(reverse|reversal|cancel|undo|offset)/i.test(normalized)) {
    console.log(`[DEBUG] Found journal reversal match with simple pattern`);
    return true;
  }
  
  // More specific patterns as fallback
  const reversalPatterns = [
    // Basic pattern for "reverse journal X" or "reverse entry X"
    /reverse\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "create reversal..."
    /create\s+(?:a\s+)?reversal\s+(?:for\s+)?(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "cancel..."
    /cancel\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "offset..."
    /offset\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "undo..."
    /undo\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i
  ];
  
  // Test each pattern individually for better debugging
  for (const pattern of reversalPatterns) {
    const isMatch = pattern.test(normalized);
    console.log(`[DEBUG] Pattern ${pattern.toString()} matches: ${isMatch}`);
    if (isMatch) {
      console.log(`[DEBUG] Found journal reversal match with pattern: ${pattern.toString()}`);
      return true;
    }
  }
  
  console.log(`[DEBUG] No journal reversal patterns matched for: "${normalized}"`);
  return false;
}

/**
 * Extract journal ID from a journal reversal query
 */
export function extractJournalIdFromReversalQuery(message: string): number | null {
  const normalized = message.toLowerCase();
  console.log(`[DEBUG] Extracting journal ID from: "${normalized}"`);
  
  // Super simple pattern that should catch both variations
  // Pattern 1: "reverse/cancel/etc"... "journal/entry"... "number"
  const simplePattern1 = /(reverse|reversal|cancel|undo|offset).*?(journal|entry).*?(\d+)/i;
  const match1 = normalized.match(simplePattern1);
  if (match1) {
    const journalId = parseInt(match1[3]);
    console.log(`[DEBUG] Found journal ID with simple pattern 1: ${journalId}`);
    return isNaN(journalId) ? null : journalId;
  }
  
  // Pattern 2: "journal/entry"... "number"... "reverse/cancel/etc"
  const simplePattern2 = /(journal|entry).*?(\d+).*?(reverse|reversal|cancel|undo|offset)/i;
  const match2 = normalized.match(simplePattern2);
  if (match2) {
    const journalId = parseInt(match2[2]);
    console.log(`[DEBUG] Found journal ID with simple pattern 2: ${journalId}`);
    return isNaN(journalId) ? null : journalId;
  }
  
  // More specific patterns as fallback
  const reversalPatterns = [
    // Basic pattern for "reverse journal X" or "reverse entry X"
    /reverse\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "create reversal..."
    /create\s+(?:a\s+)?reversal\s+(?:for\s+)?(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "cancel..."
    /cancel\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "offset..."
    /offset\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i,
    // Pattern for "undo..."
    /undo\s+(?:journal|entry|journal entry)(?:\s+#?|\s+number\s*|\s+)([0-9]+)/i
  ];
  
  for (const pattern of reversalPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      // The journal ID is now consistently in the first capturing group
      const journalId = parseInt(match[1]);
      console.log(`[DEBUG] Found journal ID with specific pattern: ${journalId}`);
      return isNaN(journalId) ? null : journalId;
    }
  }
  
  // Generic pattern for finding numbers that might be journal IDs
  const numberMatch = normalized.match(/\b(\d+)\b/);
  if (numberMatch && (normalized.includes('reverse') || normalized.includes('reversal'))) {
    const id = parseInt(numberMatch[1], 10);
    if (!isNaN(id)) {
      return id;
    }
  }
  
  return null;
}

/**
 * Update a journal entry
 */
export async function updateJournalEntry(journalId: number, updates: {
  memo?: string;
  date?: string;
  lineUpdates?: Array<{
    lineId?: number;
    lineIndex?: number;
    field: 'debit' | 'credit' | 'description' | 'account_id';
    value: string | number;
  }>;
}): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[updateJournalEntry] Updating journal ${journalId} with:`, updates);
    
    // First check if journal exists and is not posted
    const { rows: journalRows } = await sql`
      SELECT id, is_posted, is_deleted 
      FROM journals 
      WHERE id = ${journalId}
    `;
    
    if (journalRows.length === 0) {
      return { success: false, message: `Journal #${journalId} does not exist.` };
    }
    
    const journal = journalRows[0];
    
    if (journal.is_posted) {
      return { 
        success: false, 
        message: `Journal #${journalId} is already posted. You cannot edit posted journal entries.` 
      };
    }
    
    if (journal.is_deleted) {
      return { 
        success: false, 
        message: `Journal #${journalId} has been deleted. You cannot edit deleted journal entries.` 
      };
    }
    
    // Begin database transaction
    let updated = false;
    
    // Update journal header fields if provided
    if (updates.memo !== undefined || updates.date !== undefined) {
      const setValues = [];
      const queryParams = [];
      
      if (updates.memo !== undefined) {
        setValues.push('memo = $1');
        queryParams.push(updates.memo);
      }
      
      if (updates.date !== undefined) {
        const paramIndex = queryParams.length + 1;
        setValues.push(`journal_date = $${paramIndex}`);
        queryParams.push(updates.date);
      }
      
      if (setValues.length > 0) {
        const updateQuery = `
          UPDATE journals 
          SET ${setValues.join(', ')} 
          WHERE id = $${queryParams.length + 1}
        `;
        
        queryParams.push(journalId);
        
        await sql.query(updateQuery, queryParams);
        updated = true;
      }
    }
    
    // Update line items if provided
    if (updates.lineUpdates && updates.lineUpdates.length > 0) {
      try {
        // Since we can't use transactions directly, we'll check balance first then apply updates sequentially
        // Get current journal lines
        const { rows: allLines } = await sql`
          SELECT id, debit, credit, account_id, description
          FROM journal_lines
          WHERE journal_id = ${journalId}
          ORDER BY id
        `;
        
        // Create a local copy we can modify to verify balance
        const updatedLines = [...allLines];
        
        // Calculate current totals
        const currentDebitTotal = allLines.reduce((sum: number, line: any) => sum + parseFloat(line.debit || '0'), 0);
        const currentCreditTotal = allLines.reduce((sum: number, line: any) => sum + parseFloat(line.credit || '0'), 0);
        
        console.log(`[updateJournalEntry] Current totals - Debit: ${currentDebitTotal}, Credit: ${currentCreditTotal}`);
        
        // Apply updates to our local copy first to check for balance
        if (updates.lineUpdates) {
          for (const lineUpdate of updates.lineUpdates) {
            if (!lineUpdate.lineId && lineUpdate.lineIndex === undefined) {
              console.warn('[updateJournalEntry] Skip line update - no lineId or lineIndex provided', lineUpdate);
              continue;
            }
            
            let lineId: number | null = null;
            
            // Find the line to update
            if (!lineUpdate.lineId && lineUpdate.lineIndex !== undefined) {
              // Use line index to find the line
              if (lineUpdate.lineIndex >= 0 && lineUpdate.lineIndex < updatedLines.length) {
                lineId = updatedLines[lineUpdate.lineIndex].id;
              }
            } else {
              lineId = lineUpdate.lineId!;
            }
            
            if (!lineId) {
              console.warn('[updateJournalEntry] Could not find line to update');
              continue;
            }
            
            // Find the line in our local collection
            const lineIndex = updatedLines.findIndex((line: any) => line.id === lineId);
            if (lineIndex === -1) {
              console.warn(`[updateJournalEntry] Could not find line with ID ${lineId} in journal`);
              continue;
            }
            
            // Update our local version
            const oldValue = parseFloat(updatedLines[lineIndex][lineUpdate.field] || '0');
            const newValue = parseFloat(String(lineUpdate.value));
            
            console.log(`[updateJournalEntry] Will update line ${lineId}: ${lineUpdate.field} from ${oldValue} to ${newValue}`);
            
            // Apply the update to our local model
            updatedLines[lineIndex][lineUpdate.field] = newValue;
          }
        }
        
        // Calculate new totals to ensure balance
        const newDebitTotal = updatedLines.reduce((sum: number, line: any) => sum + parseFloat(line.debit || '0'), 0);
        const newCreditTotal = updatedLines.reduce((sum: number, line: any) => sum + parseFloat(line.credit || '0'), 0);
        
        console.log(`[updateJournalEntry] Projected totals after updates - Debit: ${newDebitTotal}, Credit: ${newCreditTotal}`);
        
        // Check if journal would be balanced after updates
        const tolerance = 0.001; // Small tolerance for floating point errors
        if (Math.abs(newDebitTotal - newCreditTotal) > tolerance) {
          throw new Error(`Journal entry must balance: debits (${newDebitTotal.toFixed(2)}) must equal credits (${newCreditTotal.toFixed(2)})`);
        }
        
        // If we reached here, the journal will be balanced after updates
        // Apply the actual updates to the database
        // For debit/credit updates on simple journals, we need a special approach due to the balance constraint
        // Check if we have exactly one debit and one credit update with the same value
        if (updates.lineUpdates && updates.lineUpdates.length === 2) {
          const debitUpdate = updates.lineUpdates.find(u => u.field === 'debit');
          const creditUpdate = updates.lineUpdates.find(u => u.field === 'credit');
          
          if (debitUpdate && creditUpdate && 
              debitUpdate.lineId && creditUpdate.lineId && 
              debitUpdate.value === creditUpdate.value) {
            
            console.log(`[updateJournalEntry] Executing combined update for debit line ${debitUpdate.lineId} and credit line ${creditUpdate.lineId} to value ${debitUpdate.value}`);
            
            // Use a simpler approach with a single transaction but separate updates
            // Use raw query to avoid SQL template string issues
            try {
              // Begin a transaction
              await sql.query('BEGIN');
              
              // Update debit line
              await sql.query(
                'UPDATE journal_lines SET debit = $1 WHERE id = $2',
                [debitUpdate.value, debitUpdate.lineId]
              );
              
              // Update credit line in the same transaction
              await sql.query(
                'UPDATE journal_lines SET credit = $1 WHERE id = $2',
                [creditUpdate.value, creditUpdate.lineId]
              );
              
              // Commit the transaction
              await sql.query('COMMIT');
              
              console.log(`[updateJournalEntry] Successfully updated both lines in a transaction`);
            } catch (e) {
              // Rollback on error
              console.error(`[updateJournalEntry] Error in transaction, rolling back:`, e);
              await sql.query('ROLLBACK');
              throw e;
            }
          } else {
            // Handle individual updates if they don't form a balanced pair
            for (const lineUpdate of updates.lineUpdates) {
              if (!lineUpdate.lineId) continue;
              
              console.log(`[updateJournalEntry] Warning: Executing individual update which might fail balance check: ${lineUpdate.field} = ${lineUpdate.value} for line ${lineUpdate.lineId}`);
              
              // Handle different field types
              if (lineUpdate.field === 'debit') {
                await sql`
                  UPDATE journal_lines
                  SET debit = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'credit') {
                await sql`
                  UPDATE journal_lines
                  SET credit = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'description') {
                await sql`
                  UPDATE journal_lines
                  SET description = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'account_id') {
                await sql`
                  UPDATE journal_lines
                  SET account_id = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              }
            }
          }
        } else {
          // Handle individual updates for non-paired cases
          if (updates.lineUpdates) {
            for (const lineUpdate of updates.lineUpdates) {
              if (!lineUpdate.lineId) continue;
              
              console.log(`[updateJournalEntry] Executing individual update: ${lineUpdate.field} = ${lineUpdate.value} for line ${lineUpdate.lineId}`);
              
              // Handle different field types
              if (lineUpdate.field === 'debit') {
                await sql`
                  UPDATE journal_lines
                  SET debit = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'credit') {
                await sql`
                  UPDATE journal_lines
                  SET credit = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'description') {
                await sql`
                  UPDATE journal_lines
                  SET description = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              } else if (lineUpdate.field === 'account_id') {
                await sql`
                  UPDATE journal_lines
                  SET account_id = ${lineUpdate.value}
                  WHERE id = ${lineUpdate.lineId}
                `;
              }
            }
          }
        }
        
        updated = true;
      } catch (error) {
        console.error('[updateJournalEntry] Update error:', error);
        throw error; // Re-throw to be caught by outer handler
      }
    }
    
    // Return success message with details about what was updated
    if (updated) {
      let detailMessage = '';
      
      // Add details about the specific updates made
      if (updates.memo) {
        detailMessage += ` Updated memo to "${updates.memo}".`;
      }
      
      if (updates.date) {
        detailMessage += ` Updated date to ${updates.date}.`;
      }
      
      if (updates.lineUpdates && updates.lineUpdates.length > 0) {
        // Count debit and credit updates
        const debitUpdates = updates.lineUpdates.filter(u => u.field === 'debit').length;
        const creditUpdates = updates.lineUpdates.filter(u => u.field === 'credit').length;
        
        if (debitUpdates > 0 && creditUpdates > 0) {
          detailMessage += ` Updated ${debitUpdates} debit line(s) and ${creditUpdates} credit line(s).`;
        } else if (debitUpdates > 0) {
          detailMessage += ` Updated ${debitUpdates} debit line(s).`;
        } else if (creditUpdates > 0) {
          detailMessage += ` Updated ${creditUpdates} credit line(s).`;
        }
      }
      
      return { 
        success: true, 
        message: `Journal #${journalId} has been updated successfully.${detailMessage}` 
      };
    } else {
      return { 
        success: true, 
        message: `No changes were made to journal #${journalId}.` 
      };
    }
  } catch (error) {
    console.error('[updateJournalEntry] Error:', error);
    
    // Create a user-friendly error message
    let errorMessage = 'An unknown error occurred while updating the journal.';
    
    if (error instanceof Error) {
      const errorText = error.message;
      
      if (errorText.includes('Journal entry must balance')) {
        errorMessage = 'Journal entries must have equal debits and credits. The update would create an imbalance.';
      } else if (errorText.includes('operator does not exist')) {
        errorMessage = 'There was a database type error. Please try again with a valid numeric amount.';
      } else if (errorText.includes('is posted')) {
        errorMessage = 'This journal entry has already been posted and cannot be modified. Only draft journals can be edited.';
      } else if (errorText.includes('violates foreign key constraint')) {
        errorMessage = 'The update refers to an account or other record that does not exist.';
      } else {
        // Use the original error message as fallback
        errorMessage = errorText;
      }
    }
    
    return {
      success: false,
      message: `Error updating journal: ${errorMessage}`
    };
  }
}

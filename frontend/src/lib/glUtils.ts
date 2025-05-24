import { sql } from '@vercel/postgres';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Create OpenAI client for embeddings
let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    try {
      openaiClient = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } catch (error) {
      console.error('[GLUtils] Error initializing OpenAI client:', error);
    }
  }
  return openaiClient;
}

/**
 * Uses AI to determine if a proposed account name is a duplicate of existing accounts
 * @param proposedName The new account name being proposed
 * @param existingAccounts Array of existing accounts with similar names
 * @returns Boolean indicating if this should be considered a duplicate
 */
async function checkIfDuplicateAccountName(
  proposedName: string,
  existingAccounts: Array<{code: string, name: string}>
): Promise<boolean> {
  try {
    console.log(`[GLUtils] Checking if '${proposedName}' is a duplicate of existing accounts:`, 
      existingAccounts.map(a => a.name));
    
    // Use Claude for more accurate duplicate detection
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 50,
      temperature: 0.1,
      system: `You are an AI assistant that helps determine if a proposed GL account name is a duplicate of existing accounts.
      
      A duplicate account means it represents the same accounting concept and would cause confusion or redundancy in the chart of accounts.
      Similar but distinct accounts (e.g., "Office Supplies" vs "Office Equipment") should NOT be considered duplicates.
      
      Respond with ONLY "true" if the proposed name is a duplicate, or "false" if it's sufficiently distinct.`,
      messages: [{ 
        role: "user", 
        content: `Proposed GL account name: "${proposedName}"

Existing similar account names:
${existingAccounts.map(a => `- ${a.name} (${a.code})`).join('\n')}

Is the proposed account name a duplicate? Answer with ONLY true or false.`
      }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text.trim().toLowerCase() : '';
    
    // Parse the response
    const isDuplicate = responseText === 'true';
    console.log(`[GLUtils] AI determined '${proposedName}' is ${isDuplicate ? 'a duplicate' : 'not a duplicate'}`);
    
    return isDuplicate;
  } catch (error) {
    console.error('[GLUtils] Error checking for duplicate account name:', error);
    // Default to false (not a duplicate) if there's an error with the AI check
    // This prevents blocking account creation due to AI service issues
    return false;
  }
}

/**
 * Retrieves all GL codes from the database
 * @returns Array of GL code objects with code, description and content
 */
export async function getAllGLCodes() {
  try {
    console.log('[GLUtils] Retrieving all GL codes');
    const { rows } = await sql`
      SELECT id, gl_code, description, content
      FROM gl_embeddings
    `;
    
    console.log(`[GLUtils] Retrieved ${rows.length} GL codes`);
    return rows;
  } catch (error) {
    console.error('[GLUtils] Error retrieving GL codes:', error);
    // Check if the error is due to the table not existing
    if (error instanceof Error && error.message.includes('relation "gl_embeddings" does not exist')) {
      console.warn('[GLUtils] GL embeddings table does not exist yet');
    }
    return [];
  }
}

/**
 * Generates an embedding vector for the given text using OpenAI
 * @param text The text to generate an embedding for
 * @returns The embedding vector as an array of numbers, or null if embedding fails
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getOpenAIClient();
  if (!client) {
    console.error('[GLUtils] OpenAI client not available - missing API key');
    return null;
  }
  
  try {
    console.log('[GLUtils] Generating embedding for text:', text.substring(0, 50) + '...');
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
      encoding_format: "float",
    });
    
    if (response.data && response.data[0]?.embedding) {
      return response.data[0].embedding;
    } else {
      console.error('[GLUtils] Unexpected OpenAI response format:', response);
      return null;
    }
  } catch (error) {
    console.error('[GLUtils] Error generating embedding:', error);
    return null;
  }
}

/**
 * Finds GL codes relevant to the user's query using semantic search
 * @param query The user query to find relevant GL codes for
 * @param limit Maximum number of codes to retrieve (default: 5)
 * @param threshold Similarity threshold between 0-1 (default: 0.7)
 * @returns Array of GL code objects sorted by relevance
 */
export async function findRelevantGLCodes(query: string, limit: number = 5, threshold: number = 0.7): Promise<any[]> {
  try {
    console.log(`[GLUtils] Finding GL codes relevant to: "${query}"`);
    // Explicit lookup for mentioned GL code numbers
    const codeMatches = query.match(/\b\d{3,6}\b/g);
    if (codeMatches && codeMatches.length > 0) {
      console.log(`[GLUtils] Query contains explicit GL code references: ${codeMatches.join(', ')}`);
      // Exact match lookup
      const codesArray = codeMatches.map(code => code.trim());
      const { rows: explicitRows } = await sql`
        SELECT id, gl_code, description, content
        FROM gl_embeddings
        WHERE gl_code = ANY(${codesArray as unknown as any}::varchar[])
        LIMIT ${limit}
      `;
      if (explicitRows.length > 0) {
        console.log(`[GLUtils] Found ${explicitRows.length} explicit GL codes`);
        return explicitRows;
      }
    }
    
    // Always proceed to semantic search, even if mightBeAboutGLCodes returns false
    // if (!mightBeAboutGLCodes(query)) {
    //   console.log('[GLUtils] Query does not appear to be about GL codes, continuing fallback');
    // }
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding) {
      console.error('[GLUtils] Failed to generate embedding for query. Falling back to text search.');
      // Fallback to text search
      return findGLCodesByTextSearch(query, limit);
    }
    
    // Convert JS array to vector literal string for Postgres vector type
    const vectorLiteral = '[' + queryEmbedding.join(',') + ']';
    // Search for similar embeddings in the database
    const { rows } = await sql`
      SELECT id, gl_code, description, content,
             embedding <=> ${vectorLiteral}::vector AS distance
      FROM gl_embeddings
      WHERE embedding IS NOT NULL
      ORDER BY distance ASC
      LIMIT ${limit}
    `;
    
    // Filter by threshold and return
    const filteredResults = rows.filter(row => row.distance <= threshold);
    console.log(`[GLUtils] Found ${filteredResults.length} relevant GL codes (embedding search)`);
    
    if (filteredResults.length === 0 && rows.length > 0) {
      // No results passed the threshold, but we have some results
      // Return the top one with a warning
      console.log('[GLUtils] No results passed threshold, returning top match');
      return [rows[0]];
    }
    
    return filteredResults;
  } catch (error) {
    console.error('[GLUtils] Error finding relevant GL codes:', error);
    
    // Fallback to text search on error
    console.log('[GLUtils] Falling back to text search');
    return findGLCodesByTextSearch(query, limit);
  }
}

/**
 * Fallback function to find GL codes by text search
 * @param query The user query
 * @param limit Maximum number of results
 * @returns Array of GL code objects
 */
async function findGLCodesByTextSearch(query: string, limit: number = 5): Promise<any[]> {
  try {
    // Extract GL code numbers from the query if present
    const codeMatches = query.match(/\b\d{3,6}\b/g);
    
    if (codeMatches && codeMatches.length > 0) {
      // If explicit codes are mentioned, prioritize them
      const codes = codeMatches.map(code => code.trim());
      console.log(`[GLUtils] Found explicit GL code references: ${codes.join(', ')}`);
      
      const { rows } = await sql`
        SELECT id, gl_code, description, content
        FROM gl_embeddings
        WHERE gl_code = ANY(${codes as unknown as any}::varchar[])
        LIMIT ${limit}
      `;
      
      if (rows.length > 0) {
        console.log(`[GLUtils] Found ${rows.length} GL codes by explicit reference`);
        return rows;
      }
    }
    
    // Fallback to full-text search
    const searchTerms = query
      .toLowerCase()
      .replace(/\b(what|is|the|gl|code|for|account|about|explain|tell|me|please|thank|you)\b/gi, '')
      .trim()
      .split(/\s+/)
      .filter(term => term.length > 2)
      .join(' | ');
    
    if (searchTerms) {
      const { rows } = await sql`
        SELECT id, gl_code, description, content,
               ts_rank(to_tsvector('english', content), to_tsquery('english', ${searchTerms})) AS rank
        FROM gl_embeddings
        WHERE to_tsvector('english', content) @@ to_tsquery('english', ${searchTerms})
        ORDER BY rank DESC
        LIMIT ${limit}
      `;
      
      console.log(`[GLUtils] Found ${rows.length} GL codes by text search`);
      return rows;
    }
    
    // If no specific search terms, just return a limited number of codes
    const { rows } = await sql`
      SELECT id, gl_code, description, content
      FROM gl_embeddings
      LIMIT ${limit}
    `;
    
    console.log(`[GLUtils] No specific search terms, returning ${rows.length} GL codes`);
    return rows;
  } catch (error) {
    console.error('[GLUtils] Error finding GL codes by text search:', error);
    return [];
  }
}

/**
 * Determine if a message is requesting to create a GL account
 */
export function isGLAccountCreationQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  
  // Patterns for GL account creation queries
  const glCreatePatterns = [
    // Basic patterns for creating GL accounts/codes
    /create\s+(new\s+)?(gl|g\.l\.|general\s+ledger)\s+(account|code)/i,
    /add\s+(new\s+)?(gl|g\.l\.|general\s+ledger)\s+(account|code)/i,
    /set\s+up\s+(new\s+)?(gl|g\.l\.|general\s+ledger)\s+(account|code)/i,
    
    // Patterns with prepositions
    /create\s+(an?\s+)?(account|code)\s+(in|for|to)\s+(the\s+)?(gl|g\.l\.|general\s+ledger|chart\s+of\s+accounts)/i,
    /add\s+(an?\s+)?(account|code)\s+(in|for|to)\s+(the\s+)?(gl|g\.l\.|general\s+ledger|chart\s+of\s+accounts)/i,
    
    // Additional patterns with 'call', 'called', 'named', etc.
    /create\s+(an?\s+)?(new\s+)?(gl|g\.l\.|general\s+ledger)\s+(account|code)\s+(call|called|name|named|with\s+name|with\s+description)/i,
    /add\s+(an?\s+)?(new\s+)?(gl|g\.l\.|general\s+ledger)\s+(account|code)\s+(call|called|name|named|with\s+name|with\s+description)/i,
    
    // Simplified patterns that should catch most variations
    /create\s+(an?\s+)?new\s+(account|code|gl\s+account|gl\s+code)/i,
    /add\s+(an?\s+)?new\s+(account|code|gl\s+account|gl\s+code)/i,
  ];
  
  console.log(`[GLUtils] Checking for GL account creation in: "${normalized}"`); 
  // Check if any pattern matches
  let isCreationQuery = glCreatePatterns.some(pattern => pattern.test(normalized));
  
  // Fallback check for when message contains key terms that suggest account creation
  if (!isCreationQuery) {
    // Check if message contains both GL account creation terms and numeric code indicators
    const hasGLAccountTerms = [
      /gl account/i, 
      /account#/i, 
      /account number/i, 
      /gl code/i,
      /create.+account/i,
      /new.+account/i,
      /add.+account/i
    ].some(pattern => pattern.test(normalized));
    
    const hasNumberIndicator = /[#]?\d{3,5}\b/.test(normalized);
    
    isCreationQuery = hasGLAccountTerms && hasNumberIndicator;
  }
  console.log(`[GLUtils] Is GL account creation query: ${isCreationQuery}`);
  return isCreationQuery;
}

/**
 * Extract GL account information from a creation query
 */
export function extractGLAccountInfoFromQuery(message: string): { code?: string; name?: string; notes?: string } {
  const result: { code?: string; name?: string; notes?: string } = {};
  const normalized = message.toLowerCase();
  
  console.log(`[GLUtils] Extracting GL account info from: "${normalized}"`);
  
  // Extract account code
  const codePatterns = [
    // Standard patterns with labels
    /code\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /account\s+number\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /gl\s+code\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /account\s+code\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /gl\s+account\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    
    // Variations with # symbol
    /account#\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /account\s+#\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /code\s+#\s*[:=]?\s*["']?([0-9]{3,6})["']?/i,
    /#\s*([0-9]{3,6})["']?/i,
    
    // Patterns with 'should be' or 'is'
    /(?:code|account|number)\s+(?:should|is|should be|is going to be|will be)\s+([0-9]{3,6})/i,
    /(?:should|is|should be|is going to be|will be)\s+([0-9]{3,6})/i,
    
    // Generic pattern for numbers that look like GL codes - last resort
    /\b([0-9]{3,6})\b/i
  ];
  
  for (const pattern of codePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.code = match[1];
      console.log(`[GLUtils] Found GL code: ${result.code}`);
      break;
    }
  }
  
  // Extract account name/description
  const namePatterns = [
    // Standard patterns
    /name\s*[:=]?\s*["']?([^"']+)["']?/i,
    /description\s*[:=]?\s*["']?([^"']+)["']?/i,
    /title\s*[:=]?\s*["']?([^"']+)["']?/i,
    
    // Called/named patterns - allow # in names but stop at certain keywords
    /called\s+["']?([^"']+?)(?:\s+(?:with|and|the|account|number|code|should|is|\bthe\s+account#\b)|$)/i,
    /call\s+["']?([^"']+?)(?:\s+(?:with|and|the|account|number|code|should|is|\bthe\s+account#\b)|$)/i,  // For "create a GL account call Test"
    /named\s+["']?([^"']+?)(?:\s+(?:with|and|the|account|number|code|should|is|\bthe\s+account#\b)|$)/i,
    
    // For patterns like "create a new GL account [name] with account# [code]"
    /account\s+([^\d]+?)\s+(?:with|and)\s+(?:account|code|#)/i,
    /gl\s+account\s+([^\d]+?)\s+(?:with|and)\s+(?:account|code|#)/i,
    
    // More generic patterns - use these as last resort, allow # in names
    /gl\s+account\s+([^\d]+?)\s+(?:should|is|account|number)/i,
    /new\s+account\s+([^\d]+?)\s+(?:should|is|account|number)/i,
    // After 'call' or 'called' up until 'the account'
    /(?:call|called)\s+([^\s]+[^\s]*?)\s+the\s+account/i
  ];
  
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.name = match[1].trim();
      console.log(`[GLUtils] Found GL name: ${result.name}`);
      break;
    }
  }
  
  // Post-processing to clean up extracted name if it's too long or contains keywords
  if (result.name) {
    // If the name contains keywords that indicate we've captured too much, trim it
    const cutoffWords = ['account', 'code', 'number', 'with', 'should', 'the account#'];
    for (const word of cutoffWords) {
      const index = result.name.toLowerCase().indexOf(` ${word}`);
      if (index > 0) {
        result.name = result.name.substring(0, index).trim();
        console.log(`[GLUtils] Trimmed GL name to: ${result.name}`);
      }
    }
    
    // Special handling for query like "account call Test#2 the account#"
    // which might leave "Test#2 the" as the name
    if (result.name && result.name.toLowerCase().endsWith(' the')) {
      result.name = result.name.substring(0, result.name.length - 4).trim();
      console.log(`[GLUtils] Removed trailing 'the' from GL name: ${result.name}`);
    }
    
    // Limit name length to something reasonable (e.g., 50 characters)
    if (result.name.length > 50) {
      result.name = result.name.substring(0, 50).trim();
      console.log(`[GLUtils] Truncated GL name to: ${result.name}`);
    }
  }
  
  // Extract notes if any
  const notesPatterns = [
    /notes?\s*[:=]?\s*["']?([^"']+)["']?/i,
    /description\s*[:=]?\s*["']?([^"']+)["']?/i,
    /comment\s*[:=]?\s*["']?([^"']+)["']?/i
  ];
  
  for (const pattern of notesPatterns) {
    const match = message.match(pattern);
    if (match && match[1] !== result.name) { // Ensure notes are different from name
      result.notes = match[1].trim();
      console.log(`[GLUtils] Found GL notes: ${result.notes}`);
      break;
    }
  }
  
  return result;
}

/**
 * Create a new GL account using the provided information
 * @param code The account code
 * @param name The account name/description
 * @param notes Optional notes for the account
 * @param userId The user creating the account
 * @param startingBalance Optional starting balance for the account
 * @param balanceDate Optional date for the starting balance (defaults to current date)
 * @param accountType Optional account type (asset, liability, equity, revenue, expense)
 */
/**
 * Helper function to determine account type from account code
 * This is a fallback when account type is not explicitly provided
 */
function getAccountTypeFromCode(code: string): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' {
  const accountCode = parseInt(code);
  
  // Asset accounts (1000-1999)
  if (accountCode >= 1000 && accountCode < 2000) {
    return 'asset';
  }
  // Liability accounts (2000-2999)
  else if (accountCode >= 2000 && accountCode < 3000) {
    return 'liability';
  }
  // Equity accounts (3000-3999)
  else if (accountCode >= 3000 && accountCode < 4000) {
    return 'equity';
  }
  // Revenue accounts (4000-4999)
  else if (accountCode >= 4000 && accountCode < 5000) {
    return 'revenue';
  }
  // Expense accounts (5000-5999)
  else if (accountCode >= 5000 && accountCode < 6000) {
    return 'expense';
  }
  
  // Default to expense if code doesn't match any range
  return 'expense';
}

export async function createGLAccount(
  code: string,
  name: string,
  notes?: string,
  userId?: string,
  startingBalance?: number,
  balanceDate?: string,
  accountType?: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense',
  parentId?: number | null
): Promise<{ success: boolean; message: string; account?: any; journalId?: number }> {
  try {
    console.log(`[GLUtils] Creating GL account: ${code} - ${name}`);
    
    if (!code || !name) {
      return { success: false, message: 'Both code and name are required to create a GL account.' };
    }
    
    // Check if account with this code or name already exists
    const { rows: existingAccountsByCode } = await sql`
      SELECT code, name FROM accounts WHERE code = ${code}
    `;
    
    if (existingAccountsByCode.length > 0) {
      return { 
        success: false, 
        message: `A GL account with code ${code} already exists (${existingAccountsByCode[0].name}).` 
      };
    }
    
    // Check for duplicate account names (exact match only)
    const { rows: existingAccountsByName } = await sql`
      SELECT code, name FROM accounts 
      WHERE LOWER(name) = LOWER(${name})
      LIMIT 1
    `;
    
    if (existingAccountsByName.length > 0) {
      // An account with the exact same name already exists
      return {
        success: false,
        message: `A GL account with name "${name}" already exists (${existingAccountsByName[0].code}).`
      };
    }
    
    // Start a transaction to ensure both account creation and journal entry (if needed) succeed or fail together
    const client = await sql.connect();
    let journalId: number | undefined;
    
    try {
      await client.query('BEGIN');
      
      // Insert the new account
      const accountResult = await client.query(`
        INSERT INTO accounts (code, name, notes, is_custom, account_type, parent_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, code, name, notes, is_custom, account_type, parent_id
      `, [code, name, notes ?? null, true, accountType || getAccountTypeFromCode(code), parentId || null]);
      
      const account = accountResult.rows[0];
      
      // If a starting balance is provided, create a journal entry
      if (startingBalance && startingBalance !== 0) {
        // Determine if this is a debit or credit balance based on account type
        // Get the account type from the parameter or from the account we just created
        const effectiveAccountType = accountType || account.account_type;
        let isDebitBalance = false;
        
        // Asset and Expense accounts typically have debit balances
        // Liability, Equity, and Revenue accounts typically have credit balances
        if (effectiveAccountType === 'asset' || effectiveAccountType === 'expense') {
          isDebitBalance = true;
        }
        
        // Format the date or use current date
        const transactionDate = balanceDate || new Date().toISOString().split('T')[0];
        
        // Get the equity account to balance against (typically Retained Earnings or Opening Balance Equity)
        const equityAccountQuery = await client.query(`
          SELECT id FROM accounts 
          WHERE (LOWER(name) LIKE '%retained earnings%' OR LOWER(name) LIKE '%opening balance%') 
          AND LOWER(account_type) = 'equity'
          LIMIT 1
        `);
        
        let equityAccountId: number;
        
        if (equityAccountQuery.rows.length > 0) {
          equityAccountId = equityAccountQuery.rows[0].id;
        } else {
          // Create an Opening Balance Equity account if none exists
          const openingBalanceResult = await client.query(`
            INSERT INTO accounts (code, name, account_type, is_custom)
            VALUES ('3900', 'Opening Balance Equity', 'equity', TRUE)
            RETURNING id
          `);
          equityAccountId = openingBalanceResult.rows[0].id;
        }
        
        // Create journal header - using transaction_date or date depending on schema
        // First check if transaction_date column exists
        const columnCheckQuery = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'journals' AND column_name = 'transaction_date'
        `);
        
        const dateColumnName = columnCheckQuery.rows.length > 0 ? 'transaction_date' : 'date';
        
        // Create journal header
        const journalResult = await client.query(`
          INSERT INTO journals (
            ${dateColumnName}, journal_type, memo, source, created_by, user_id, is_posted
          ) VALUES (
            $1, 'GJ', $2, 'System', $3, $4, true
          ) RETURNING id
        `, [
          transactionDate,
          `Initial balance for account ${code} - ${name}`,
          userId || 'system',
          userId || 'system'
        ]);
        
        journalId = journalResult.rows[0].id;
        
        // Create journal lines - always omit line_number since it's causing issues
        if (isDebitBalance) {
          // Debit the new account, credit equity
          await client.query(`
            INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, user_id)
            VALUES ($1, $2, $3, $4, 0, $5)
          `, [journalId, account.id, `Initial balance`, Math.abs(startingBalance), userId || 'system']);
          
          await client.query(`
            INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, user_id)
            VALUES ($1, $2, $3, 0, $4, $5)
          `, [journalId, equityAccountId, `Initial balance for ${code} - ${name}`, Math.abs(startingBalance), userId || 'system']);
        } else {
          // Credit the new account, debit equity
          await client.query(`
            INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, user_id)
            VALUES ($1, $2, $3, 0, $4, $5)
          `, [journalId, account.id, `Initial balance`, Math.abs(startingBalance), userId || 'system']);
          
          await client.query(`
            INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, user_id)
            VALUES ($1, $2, $3, $4, 0, $5)
          `, [journalId, equityAccountId, `Initial balance for ${code} - ${name}`, Math.abs(startingBalance), userId || 'system']);
        }
      }
      
      // Commit the transaction
      await client.query('COMMIT');
      
      // Return success with account info and journal ID if created
      return { 
        success: true, 
        message: `GL account ${code} - ${name} has been created successfully${startingBalance ? ' with initial balance of ' + startingBalance : ''}.`,
        account: accountResult.rows[0],
        journalId
      };
    } catch (error) {
      // Rollback the transaction if anything fails
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Release the client back to the pool
      client.release();
    }
  } catch (error) {
    console.error('[GLUtils] Error creating GL account:', error);
    let errorMessage = 'An unknown error occurred while creating the GL account.';
    
    if (error instanceof Error) {
      // Extract meaningful information from SQL errors if possible
      if (error.message.includes('duplicate key')) {
        errorMessage = `A GL account with code ${code} already exists.`;
      } else {
        errorMessage = `Error creating GL account: ${error.message}`;
      }
    }
    
    return { success: false, message: errorMessage };
  }
}

/**
 * Determines if a user message might be related to GL codes
 * @param message The user message to analyze
 * @returns Boolean indicating if the message might be about GL codes
 */
export function mightBeAboutGLCodes(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  
  // Keywords that indicate GL code questions
  const glCodeKeywords = [
    'gl code', 'gl-code', 'glcode', 'general ledger',
    'account code', 'account number', 'ledger code',
    'accounting code', 'chart of accounts', 'account description'
  ];
  
  // Check for explicit mentions of GL codes
  for (const keyword of glCodeKeywords) {
    if (lowerMessage.includes(keyword)) {
      console.log(`[GLUtils] Message matches GL code keyword: ${keyword}`);
      return true;
    }
  }
  
  // Check for patterns like "What is code 1000?" or "Tell me about account 2000"
  const codePattern = /\b(what|tell|explain|describe|definition|mean|where|how)\b.{1,30}\b(code|account)\b.{1,15}\b\d{3,6}\b/i;
  if (codePattern.test(message)) {
    console.log('[GLUtils] Message matches GL code pattern (code + number)');
    return true;
  }
  
  // Check for direct reference to numeric codes
  const directCodePattern = /\b(code|account)\s+\d{3,6}\b/i;
  if (directCodePattern.test(message)) {
    console.log('[GLUtils] Message directly references a numeric code');
    return true;
  }
  
  console.log('[GLUtils] Message does not appear to be about GL codes');
  return false;
}

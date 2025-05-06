/**
 * AI Embeddings Service
 * 
 * Functions for generating and working with vector embeddings
 * for AI-powered transaction classification and search.
 */

import OpenAI from 'openai';

// Initialize OpenAI client if API key is available
let openai: OpenAI | null = null;
let apiKeyStatus = 'not_configured';

// Try multiple possible environment variable names for the OpenAI API key
const getOpenAIKey = (): string | undefined => {
  // Check all possible env var names that might contain an OpenAI API key
  const possibleEnvVars = [
    'OPENAI_API_KEY', 
    'OPENAI_KEY',
    'OPEN_AI_KEY',
    'OPENAI_TOKEN',
    'REACT_APP_OPENAI_API_KEY'
  ];
  
  for (const varName of possibleEnvVars) {
    if (process.env[varName]) {
      console.log(`Found OpenAI API key in ${varName} environment variable`);
      return process.env[varName];
    }
  }
  
  // Also check if we might have an OpenAI key in a different format or variable name
  for (const [key, value] of Object.entries(process.env)) {
    if (value && 
        typeof value === 'string' && 
        (value.startsWith('sk-') || value.startsWith('openai-')) && 
        !key.includes('ANTHROPIC') && 
        !key.includes('CLAUDE')) {
      console.log(`Found potential OpenAI API key in ${key} environment variable`);
      return value;
    }
  }
  
  return undefined;
};

try {
  const apiKey = getOpenAIKey();
  
  if (apiKey) {
    // Log a masked version of the key for debugging
    const maskedKey = maskApiKey(apiKey);
    console.log(`Initializing OpenAI with API key: ${maskedKey}`);
    
    openai = new OpenAI({
      apiKey: apiKey
    });
    apiKeyStatus = 'configured';
  } else {
    console.warn('Could not find an OpenAI API key in any environment variable');
    console.warn('Available env vars:', Object.keys(process.env).filter(k => 
      !k.includes('SECRET') && 
      !k.includes('PASSWORD') && 
      !k.includes('TOKEN') && 
      !k.includes('KEY')).join(', '));
  }
} catch (error) {
  console.error('Error initializing OpenAI client:', error);
  apiKeyStatus = 'error';
}

/**
 * Generate an embedding vector for a text string
 * Returns null if OpenAI is not configured
 * @throws {Error} Will throw an error with a detailed message if embedding creation fails
 */
export async function createEmbedding(text: string): Promise<number[] | null> {
  if (!openai) {
    const errorMsg = 'OpenAI API key not configured, skipping embedding generation';
    console.log(errorMsg);
    throw new Error(errorMsg);
  }
  
  if (!text || text.trim().length === 0) {
    const errorMsg = 'Cannot create embedding for empty text';
    console.log(errorMsg);
    throw new Error(errorMsg);
  }
  
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.trim(),
    });
    
    if (!response.data[0].embedding) {
      throw new Error('Empty embedding returned from OpenAI');
    }
    
    return response.data[0].embedding;
  } catch (error: any) {
    const errorMsg = error.message || 'Unknown OpenAI API error';
    console.error('Error creating embedding:', errorMsg);
    throw new Error(`Failed to create embedding: ${errorMsg}`);
  }
}

/**
 * Get the status of the OpenAI API key configuration
 */
export function getApiKeyStatus(): string {
  return apiKeyStatus;
}

/**
 * Utility to mask an API key for safe logging
 */
function maskApiKey(key: string): string {
  if (!key) return 'undefined';
  if (key.length <= 8) return '***';
  
  // Just show first 4 and last 4 characters
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
}

/**
 * Search for similar journal entries based on text
 * 
 * @param searchText Text to search for
 * @param limit Maximum number of results to return
 * @returns Array of journal entries with similarity scores
 */
export async function findSimilarJournals(
  searchText: string,
  limit: number = 5
): Promise<any[]> {
  // Generate embedding for search text
  const searchEmbedding = await createEmbedding(searchText);
  
  if (!searchEmbedding) {
    return [];
  }
  
  // Use pgvector to find similar journal lines
  const { sql } = await import('@vercel/postgres');
  
  // Convert embedding array to string format for PostgreSQL
  const embeddingStr = `[${searchEmbedding.join(',')}]`;
  
  const { rows } = await sql.query(`
    SELECT 
      jl.id AS line_id,
      j.id AS journal_id,
      j.memo,
      j.transaction_date,
      jl.description,
      jl.debit,
      jl.credit,
      jl.account_id,
      a.name AS account_name,
      1 - (jl.embedding <-> $1::vector) AS similarity
    FROM 
      journal_lines jl
    JOIN 
      journals j ON jl.journal_id = j.id
    LEFT JOIN
      accounts a ON jl.account_id = a.id
    WHERE 
      j.is_deleted = false
    ORDER BY 
      jl.embedding <-> $1::vector
    LIMIT $2
  `, [embeddingStr, limit]);
  
  return rows;
}

/**
 * Classify a journal entry using existing data patterns
 * 
 * @param journalText Journal memo and line descriptions
 * @returns Suggested account IDs and confidence scores
 */
export async function suggestAccountsForJournal(
  journalText: string
): Promise<{ accountId: number; confidence: number }[]> {
  const similarJournals = await findSimilarJournals(journalText, 10);
  
  if (similarJournals.length === 0) {
    return [];
  }
  
  // Count account occurrences and calculate confidence
  const accountCounts: Record<number, number> = {};
  
  for (const entry of similarJournals) {
    accountCounts[entry.account_id] = (accountCounts[entry.account_id] || 0) + 1;
  }
  
  // Convert to array and sort by frequency
  const suggestions = Object.entries(accountCounts)
    .map(([accountId, count]) => ({
      accountId: parseInt(accountId),
      confidence: count / similarJournals.length,
    }))
    .sort((a, b) => b.confidence - a.confidence);
  
  return suggestions;
}

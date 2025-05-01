import { sql } from '@vercel/postgres';
import OpenAI from 'openai';

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
    
    // Check if the message might be about GL codes before proceeding
    if (!mightBeAboutGLCodes(query)) {
      console.log('[GLUtils] Query does not appear to be about GL codes, skipping search');
      return [];
    }
    
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);
    
    if (!queryEmbedding) {
      console.error('[GLUtils] Failed to generate embedding for query. Falling back to text search.');
      // Fallback to text search
      return findGLCodesByTextSearch(query, limit);
    }
    
    // Search for similar embeddings in the database
    const { rows } = await sql`
      SELECT id, gl_code, description, content, 
             embedding <=> ${queryEmbedding as unknown as any}::vector AS distance
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
    console.error('[GLUtils] Error in text search fallback:', error);
    return [];
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

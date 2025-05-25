// frontend/src/lib/statementEmbeddings.ts
import { sql } from '@vercel/postgres';
import { generateEmbedding } from '@/lib/glUtils';

/**
 * Interface for statement embedding records
 */
export interface StatementEmbedding {
  id?: number;
  user_id: string;
  account_id: number;
  account_number: string; // Visible account number (last 4 digits)
  statement_date: string;
  statement_number: string;
  statement_content: string; // Full text content of the statement
  embedding?: number[];
  embedding_model?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Create statement embeddings table if it doesn't exist
 */
export async function ensureStatementEmbeddingsTable(): Promise<boolean> {
  try {
    // First, enable the vector extension if not already enabled
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    
    // Check if the table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'statement_embeddings'
      ) as exists
    `;
    
    if (tableCheck.rows[0].exists) {
      console.log('[StatementEmbeddings] statement_embeddings table already exists');
      return true;
    }
    
    // Table doesn't exist, create it
    console.log('[StatementEmbeddings] Creating statement_embeddings table');
    
    await sql`
      CREATE TABLE statement_embeddings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        account_number TEXT NOT NULL,
        statement_date DATE NOT NULL,
        statement_number TEXT NOT NULL,
        statement_content TEXT NOT NULL,
        embedding vector(1536),
        embedding_model TEXT DEFAULT 'text-embedding-3-small',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, account_number, statement_date)
      )
    `;
    
    // Create an index for faster similarity searches
    try {
      await sql`
        CREATE INDEX statement_embeddings_embedding_idx 
        ON statement_embeddings 
        USING ivfflat (embedding vector_l2_ops)
        WITH (lists = 100)
      `;
      console.log('[StatementEmbeddings] Vector index created successfully');
    } catch (indexError) {
      console.warn('[StatementEmbeddings] Error creating vector index:', indexError);
      // Continue anyway since this is just an optimization
    }
    
    // Create additional indexes for efficient querying
    await sql`
      CREATE INDEX statement_embeddings_user_account_idx 
      ON statement_embeddings (user_id, account_number)
    `;
    
    await sql`
      CREATE INDEX statement_embeddings_date_idx 
      ON statement_embeddings (statement_date)
    `;
    
    console.log('[StatementEmbeddings] Successfully created statement_embeddings table with indexes');
    return true;
  } catch (error) {
    console.error('[StatementEmbeddings] Error ensuring statement_embeddings table:', error);
    return false;
  }
}

/**
 * Check if a statement embedding already exists
 */
export async function statementEmbeddingExists(
  userId: string,
  accountNumber: string,
  statementDate: string
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT id FROM statement_embeddings 
      WHERE user_id = ${userId} 
      AND account_number = ${accountNumber}
      AND statement_date = ${statementDate}
    `;
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('[StatementEmbeddings] Error checking if statement embedding exists:', error);
    return false;
  }
}

/**
 * Store a statement with its embedding in the vector database
 */
export async function storeStatementEmbedding(
  statementData: Omit<StatementEmbedding, 'id' | 'created_at' | 'updated_at'>
): Promise<StatementEmbedding | null> {
  try {
    // Ensure the statement_embeddings table exists
    await ensureStatementEmbeddingsTable();
    
    // Check if we already have this statement stored
    const exists = await statementEmbeddingExists(
      statementData.user_id,
      statementData.account_number,
      statementData.statement_date
    );
    
    if (exists) {
      console.log(`[StatementEmbeddings] Statement already exists for account ${statementData.account_number} on ${statementData.statement_date}`);
      
      // Return the existing record
      const existing = await sql`
        SELECT * FROM statement_embeddings 
        WHERE user_id = ${statementData.user_id} 
        AND account_number = ${statementData.account_number}
        AND statement_date = ${statementData.statement_date}
      `;
      
      return existing.rows[0] as StatementEmbedding || null;
    }
    
    // Generate embedding for the statement content
    console.log(`[StatementEmbeddings] Generating embedding for statement ${statementData.statement_number}`);
    const embedding = await generateEmbedding(statementData.statement_content);
    
    if (!embedding) {
      console.error('[StatementEmbeddings] Failed to generate embedding for statement');
      return null;
    }
    
    // Store the statement with its embedding
    const result = await sql`
      INSERT INTO statement_embeddings (
        user_id,
        account_id,
        account_number,
        statement_date,
        statement_number,
        statement_content,
        embedding,
        embedding_model
      ) VALUES (
        ${statementData.user_id},
        ${statementData.account_id},
        ${statementData.account_number},
        ${statementData.statement_date},
        ${statementData.statement_number},
        ${statementData.statement_content},
        ${JSON.stringify(embedding)},
        'text-embedding-3-small'
      )
      RETURNING *
    `;
    
    console.log(`[StatementEmbeddings] Successfully stored statement embedding for ${statementData.statement_number}`);
    
    return {
      ...statementData,
      id: result.rows[0].id,
      embedding,
      embedding_model: 'text-embedding-3-small',
      created_at: result.rows[0].created_at,
      updated_at: result.rows[0].updated_at
    };
  } catch (error) {
    console.error('[StatementEmbeddings] Error storing statement embedding:', error);
    return null;
  }
}

/**
 * Find similar statements based on content
 */
export async function findSimilarStatements(
  searchText: string,
  userId: string,
  limit: number = 5
): Promise<StatementEmbedding[]> {
  try {
    // Generate embedding for search text
    const searchEmbedding = await generateEmbedding(searchText);
    
    if (!searchEmbedding) {
      console.error('[StatementEmbeddings] Failed to generate search embedding');
      return [];
    }
    
    // Use pgvector to find similar statements
    const embeddingStr = JSON.stringify(searchEmbedding);
    
    const result = await sql`
      SELECT 
        *,
        1 - (embedding <-> ${embeddingStr}::vector) AS similarity
      FROM statement_embeddings
      WHERE user_id = ${userId}
      ORDER BY embedding <-> ${embeddingStr}::vector
      LIMIT ${limit}
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      account_id: row.account_id,
      account_number: row.account_number,
      statement_date: row.statement_date,
      statement_number: row.statement_number,
      statement_content: row.statement_content,
      embedding_model: row.embedding_model,
      created_at: row.created_at,
      updated_at: row.updated_at,
      similarity: row.similarity
    }));
  } catch (error) {
    console.error('[StatementEmbeddings] Error finding similar statements:', error);
    return [];
  }
}

/**
 * Get all statements for a specific account
 */
export async function getStatementsForAccount(
  userId: string,
  accountNumber: string
): Promise<StatementEmbedding[]> {
  try {
    const result = await sql`
      SELECT * FROM statement_embeddings
      WHERE user_id = ${userId}
      AND account_number = ${accountNumber}
      ORDER BY statement_date DESC
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      account_id: row.account_id,
      account_number: row.account_number,
      statement_date: row.statement_date,
      statement_number: row.statement_number,
      statement_content: row.statement_content,
      embedding_model: row.embedding_model,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  } catch (error) {
    console.error('[StatementEmbeddings] Error getting statements for account:', error);
    return [];
  }
}

/**
 * Delete a statement embedding
 */
export async function deleteStatementEmbedding(
  id: number,
  userId: string
): Promise<boolean> {
  try {
    const result = await sql`
      DELETE FROM statement_embeddings 
      WHERE id = ${id} AND user_id = ${userId}
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('[StatementEmbeddings] Error deleting statement embedding:', error);
    return false;
  }
}

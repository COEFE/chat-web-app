import { sql } from '@vercel/postgres';
import OpenAI from 'openai';
import { logAuditEvent } from './auditLogger';

// Initialize OpenAI client for embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY
});

// Interface for chat message with embedding data
export interface ChatEmbedding {
  id?: number;
  user_id: string;
  conversation_id: string;
  message_id: string; 
  role: string;  // 'user' or 'assistant'
  content: string;
  embedding?: number[];
  embedding_model?: string;
  created_at?: string;
}

/**
 * Create chat embeddings table if it doesn't exist
 */
export async function ensureChatEmbeddingsTable(): Promise<boolean> {
  try {
    // Check if the table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'chat_embeddings'
      ) as exists
    `;
    
    if (tableCheck.rows[0].exists) {
      console.log('[ChatEmbeddings] chat_embeddings table already exists');
      return true;
    }
    
    // Table doesn't exist, create it
    console.log('[ChatEmbeddings] Creating chat_embeddings table');
    
    // Check if vector extension is installed
    const vectorExtCheck = await sql`
      SELECT EXISTS (
        SELECT FROM pg_extension WHERE extname = 'vector'
      ) as exists
    `;
    
    if (!vectorExtCheck.rows[0].exists) {
      console.log('[ChatEmbeddings] Installing vector extension');
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    }
    
    // Create the chat_embeddings table
    await sql`
      CREATE TABLE chat_embeddings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        embedding_model TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(conversation_id, message_id)
      )
    `;
    
    // Create an index for faster similarity searches
    await sql`
      CREATE INDEX chat_embeddings_embedding_idx 
      ON chat_embeddings 
      USING ivfflat (embedding vector_l2_ops)
      WITH (lists = 100)
    `;
    
    console.log('[ChatEmbeddings] Successfully created chat_embeddings table with vector index');
    return true;
  } catch (error) {
    console.error('[ChatEmbeddings] Error ensuring chat_embeddings table:', error);
    return false;
  }
}

/**
 * Store a chat message with its embedding in the database
 */
export async function storeChatMessageWithEmbedding(message: ChatEmbedding): Promise<ChatEmbedding | null> {
  try {
    // Ensure the chat_embeddings table exists
    await ensureChatEmbeddingsTable();
    
    // Check if we already have this message stored
    const existing = await sql`
      SELECT id FROM chat_embeddings 
      WHERE conversation_id = ${message.conversation_id} 
      AND message_id = ${message.message_id}
    `;
    
    if (existing.rows.length > 0) {
      console.log(`[ChatEmbeddings] Message ${message.message_id} already exists in conversation ${message.conversation_id}`);
      return null;
    }
    
    // Generate embedding if not provided
    let embedding = message.embedding;
    if (!embedding) {
      const generatedEmbedding = await createEmbeddingForText(message.content);
      if (!generatedEmbedding) {
        console.error('[ChatEmbeddings] Failed to create embedding for message');
        return null;
      }
      embedding = generatedEmbedding;
    }
    
    // Convert embedding array to string
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // Store the message with its embedding
    const result = await sql`
      INSERT INTO chat_embeddings (
        user_id, conversation_id, message_id, role, content, embedding, embedding_model
      ) VALUES (
        ${message.user_id}, 
        ${message.conversation_id},
        ${message.message_id},
        ${message.role},
        ${message.content},
        ${embeddingStr}::vector,
        ${'text-embedding-3-small'}
      )
      RETURNING id, created_at
    `;
    
    if (result.rows.length === 0) {
      console.error('[ChatEmbeddings] Failed to insert chat embedding');
      return null;
    }
    
    // Log success
    await logAuditEvent({
      user_id: message.user_id,
      action_type: "CHAT_EMBEDDING_CREATED",
      entity_type: "CHAT_MESSAGE",
      entity_id: message.message_id,
      context: { conversation_id: message.conversation_id },
      status: "SUCCESS",
      timestamp: new Date().toISOString()
    });
    
    return {
      ...message,
      id: result.rows[0].id,
      embedding,
      embedding_model: 'text-embedding-3-small',
      created_at: result.rows[0].created_at
    };
  } catch (error) {
    console.error('[ChatEmbeddings] Error storing chat message with embedding:', error);
    return null;
  }
}

/**
 * Create embedding for a text string
 */
export async function createEmbeddingForText(text: string): Promise<number[] | null> {
  try {
    // Use OpenAI API to create embeddings
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });
    
    // Return the embedding
    return response.data[0].embedding;
  } catch (error) {
    console.error('[ChatEmbeddings] Error creating embedding:', error);
    return null;
  }
}

/**
 * Find similar chat messages for a given query
 */
export async function findSimilarChatMessages(
  query: string,
  userId: string,
  limit: number = 5,
  similarityThreshold: number = 0.75
): Promise<ChatEmbedding[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await createEmbeddingForText(query);
    if (!queryEmbedding) {
      return [];
    }
    
    // Convert to string
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    
    // Find similar chat messages
    const result = await sql`
      SELECT 
        id, user_id, conversation_id, message_id, role, content, 
        created_at, embedding_model,
        1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM chat_embeddings
      WHERE user_id = ${userId}
      AND 1 - (embedding <=> ${embeddingStr}::vector) > ${similarityThreshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      conversation_id: row.conversation_id,
      message_id: row.message_id,
      role: row.role,
      content: row.content,
      embedding_model: row.embedding_model,
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('[ChatEmbeddings] Error finding similar chat messages:', error);
    return [];
  }
}

/**
 * Get the most recent chat message embeddings for a user
 */
export async function getRecentChatEmbeddings(
  userId: string,
  limit: number = 20
): Promise<ChatEmbedding[]> {
  try {
    const result = await sql`
      SELECT 
        id, user_id, conversation_id, message_id, role, content,
        created_at, embedding_model
      FROM chat_embeddings
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      conversation_id: row.conversation_id,
      message_id: row.message_id,
      role: row.role,
      content: row.content,
      embedding_model: row.embedding_model,
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('[ChatEmbeddings] Error getting recent chat embeddings:', error);
    return [];
  }
}

/**
 * Get all embeddings for a specific conversation
 */
export async function getConversationEmbeddings(
  conversationId: string,
  userId: string
): Promise<ChatEmbedding[]> {
  try {
    const result = await sql`
      SELECT 
        id, user_id, conversation_id, message_id, role, content,
        created_at, embedding_model
      FROM chat_embeddings
      WHERE conversation_id = ${conversationId}
      AND user_id = ${userId}
      ORDER BY created_at ASC
    `;
    
    return result.rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      conversation_id: row.conversation_id,
      message_id: row.message_id,
      role: row.role,
      content: row.content,
      embedding_model: row.embedding_model,
      created_at: row.created_at
    }));
  } catch (error) {
    console.error('[ChatEmbeddings] Error getting conversation embeddings:', error);
    return [];
  }
}

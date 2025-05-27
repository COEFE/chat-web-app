import { sql } from "@vercel/postgres";
import { createEmbedding } from "./ai/embeddings";

export interface ReceiptEmbedding {
  id: string;
  user_id: string;
  vendor_name: string;
  receipt_date: string;
  total_amount: number;
  last_four_digits?: string;
  line_items: any; // JSON array of line items
  receipt_image_url?: string;
  receipt_content: string; // Text content for embedding
  embedding?: number[];
  embedding_model?: string;
  processed_status: 'pending' | 'processed' | 'error';
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Ensure the receipt_embeddings table exists
 */
export async function ensureReceiptEmbeddingsTable(): Promise<void> {
  try {
    console.log('[ReceiptEmbeddings] Ensuring receipt_embeddings table exists');
    
    // First, enable the vector extension if not already enabled
    await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
    
    // Create the receipt_embeddings table if it doesn't exist
    await sql`
      CREATE TABLE IF NOT EXISTS receipt_embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        vendor_name TEXT NOT NULL,
        receipt_date DATE NOT NULL,
        total_amount DECIMAL(10,2) NOT NULL,
        last_four_digits TEXT,
        line_items JSONB NOT NULL,
        receipt_image_url TEXT,
        receipt_content TEXT NOT NULL,
        embedding vector(1536),
        embedding_model TEXT DEFAULT 'text-embedding-3-small',
        processed_status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;
    
    // Create indexes for better performance
    await sql`
      CREATE INDEX IF NOT EXISTS receipt_embeddings_user_id_idx 
      ON receipt_embeddings(user_id)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS receipt_embeddings_date_idx 
      ON receipt_embeddings(receipt_date)
    `;
    
    await sql`
      CREATE INDEX IF NOT EXISTS receipt_embeddings_vendor_idx 
      ON receipt_embeddings(vendor_name)
    `;
    
    // Create vector index for similarity search
    try {
      await sql`
        CREATE INDEX IF NOT EXISTS receipt_embeddings_embedding_idx 
        ON receipt_embeddings 
        USING ivfflat (embedding vector_l2_ops)
      `;
    } catch (indexError) {
      // Vector index creation might fail if not enough data, that's okay
      console.warn('[ReceiptEmbeddings] Error creating vector index:', indexError);
    }
    
    console.log('[ReceiptEmbeddings] Successfully ensured receipt_embeddings table exists');
  } catch (error) {
    console.error('[ReceiptEmbeddings] Error ensuring table exists:', error);
    throw error;
  }
}

/**
 * Check if a receipt embedding already exists for the given parameters
 */
export async function receiptEmbeddingExists(
  userId: string,
  vendorName: string,
  receiptDate: string,
  totalAmount: number
): Promise<boolean> {
  try {
    const result = await sql`
      SELECT COUNT(*) as count 
      FROM receipt_embeddings 
      WHERE user_id = ${userId} 
      AND vendor_name = ${vendorName}
      AND receipt_date = ${receiptDate}
      AND total_amount = ${totalAmount}
    `;
    
    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    console.error('[ReceiptEmbeddings] Error checking if receipt exists:', error);
    return false;
  }
}

/**
 * Store a receipt with its embedding in the vector database
 */
export async function storeReceiptEmbedding(
  receiptData: Omit<ReceiptEmbedding, 'id' | 'created_at' | 'updated_at'>
): Promise<ReceiptEmbedding | null> {
  try {
    // Ensure the receipt_embeddings table exists
    await ensureReceiptEmbeddingsTable();
    
    // Check if we already have this receipt stored
    const exists = await receiptEmbeddingExists(
      receiptData.user_id,
      receiptData.vendor_name,
      receiptData.receipt_date,
      receiptData.total_amount
    );
    
    if (exists) {
      console.log(`[ReceiptEmbeddings] Receipt already exists for vendor ${receiptData.vendor_name} on ${receiptData.receipt_date}`);
      
      // Return the existing record
      const existing = await sql`
        SELECT * FROM receipt_embeddings 
        WHERE user_id = ${receiptData.user_id} 
        AND vendor_name = ${receiptData.vendor_name}
        AND receipt_date = ${receiptData.receipt_date}
        AND total_amount = ${receiptData.total_amount}
      `;
      
      return existing.rows[0] as ReceiptEmbedding || null;
    }
    
    // Generate embedding for the receipt content
    console.log(`[ReceiptEmbeddings] Generating embedding for receipt from ${receiptData.vendor_name}`);
    const embedding = await createEmbedding(receiptData.receipt_content);
    
    if (!embedding) {
      console.error('[ReceiptEmbeddings] Failed to generate embedding for receipt');
      return null;
    }
    
    // Store the receipt with its embedding
    const result = await sql`
      INSERT INTO receipt_embeddings (
        user_id,
        vendor_name,
        receipt_date,
        total_amount,
        last_four_digits,
        line_items,
        receipt_image_url,
        receipt_content,
        embedding,
        embedding_model,
        processed_status
      ) VALUES (
        ${receiptData.user_id},
        ${receiptData.vendor_name},
        ${receiptData.receipt_date},
        ${receiptData.total_amount},
        ${receiptData.last_four_digits || null},
        ${JSON.stringify(receiptData.line_items)},
        ${receiptData.receipt_image_url || null},
        ${receiptData.receipt_content},
        ${JSON.stringify(embedding)},
        'text-embedding-3-small',
        ${receiptData.processed_status}
      )
      RETURNING *
    `;
    
    if (result.rows.length === 0) {
      console.error('[ReceiptEmbeddings] Failed to store receipt embedding');
      return null;
    }
    
    const stored = result.rows[0] as ReceiptEmbedding;
    console.log(`[ReceiptEmbeddings] Successfully stored receipt embedding with ID: ${stored.id}`);
    
    return stored;
  } catch (error) {
    console.error('[ReceiptEmbeddings] Error storing receipt embedding:', error);
    return null;
  }
}

/**
 * Find similar receipts using vector similarity search
 */
export async function findSimilarReceipts(
  receiptContent: string,
  threshold: number = 0.8,
  limit: number = 5,
  userId: string
): Promise<any[]> {
  try {
    await ensureReceiptEmbeddingsTable();

    // Generate embedding for the search content
    const embedding = await createEmbedding(receiptContent);

    // Search for similar receipts using vector similarity
    const result = await sql`
      SELECT 
        id, vendor_name, receipt_date, total_amount, last_four_digits,
        line_items, receipt_image_url, processed_status,
        (embedding <=> ${JSON.stringify(embedding)}) as distance
      FROM receipt_embeddings
      WHERE user_id = ${userId}
        AND (embedding <=> ${JSON.stringify(embedding)}) < ${threshold}
      ORDER BY distance
      LIMIT ${limit}
    `;

    return result.rows.map(row => ({
      ...row,
      similarity: 1 - row.distance // Convert distance to similarity score
    }));
  } catch (error) {
    console.error("Error finding similar receipts:", error);
    return [];
  }
}

/**
 * Update receipt processing status
 */
export async function updateReceiptStatus(
  receiptId: string,
  status: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await sql`
      UPDATE receipt_embeddings 
      SET processed_status = ${status}, updated_at = NOW()
      WHERE id = ${receiptId} AND user_id = ${userId}
    `;
    
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error("Error updating receipt status:", error);
    return false;
  }
}

async function storeReceiptEmbeddingInternal(receiptData: any) {
  // Generate embedding for the receipt content
  const embedding = await createEmbedding(receiptData.receipt_content);

  // Insert the receipt with embedding
  const insertResult = await sql`
    INSERT INTO receipt_embeddings (
      user_id, vendor_name, receipt_date, total_amount, last_four_digits,
      line_items, receipt_image_url, receipt_content, embedding, processed_status
    ) VALUES (
      ${receiptData.user_id}, 
      ${receiptData.vendor_name}, 
      ${receiptData.receipt_date}, 
      ${receiptData.total_amount}, 
      ${receiptData.last_four_digits || null}, 
      ${JSON.stringify(receiptData.line_items)}, 
      ${receiptData.receipt_image_url || null}, 
      ${receiptData.receipt_content}, 
      ${JSON.stringify(embedding)}, 
      ${receiptData.processed_status}
    ) RETURNING *
  `;

  return insertResult.rows[0];
}

/**
 * Get all receipts for a user with optional filtering
 */
export async function getUserReceipts(
  userId: string,
  filters?: {
    vendorName?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: number;
    maxAmount?: number;
    status?: 'pending' | 'processed' | 'error';
  }
): Promise<ReceiptEmbedding[]> {
  try {
    // Build conditions and parameters dynamically
    const conditions = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (filters?.vendorName) {
      conditions.push(`vendor_name ILIKE $${paramIndex}`);
      params.push(`%${filters.vendorName}%`);
      paramIndex++;
    }
    
    if (filters?.dateFrom) {
      conditions.push(`receipt_date >= $${paramIndex}`);
      params.push(filters.dateFrom);
      paramIndex++;
    }
    
    if (filters?.dateTo) {
      conditions.push(`receipt_date <= $${paramIndex}`);
      params.push(filters.dateTo);
      paramIndex++;
    }
    
    if (filters?.minAmount) {
      conditions.push(`total_amount >= $${paramIndex}`);
      params.push(filters.minAmount);
      paramIndex++;
    }
    
    if (filters?.maxAmount) {
      conditions.push(`total_amount <= $${paramIndex}`);
      params.push(filters.maxAmount);
      paramIndex++;
    }
    
    if (filters?.status) {
      conditions.push(`processed_status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    // Build the complete query
    const queryText = `
      SELECT * FROM receipt_embeddings 
      WHERE ${conditions.join(' AND ')}
      ORDER BY receipt_date DESC, created_at DESC
    `;

    const result = await sql.query(queryText, params);
    return result.rows as ReceiptEmbedding[];
  } catch (error) {
    console.error('[ReceiptEmbeddings] Error getting user receipts:', error);
    return [];
  }
}

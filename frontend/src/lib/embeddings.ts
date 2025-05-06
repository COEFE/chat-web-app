/**
 * Utility functions for creating and working with embeddings
 * Used for semantic similarity comparison of transaction data
 */

// Default embedding model configuration
const EMBEDDING_MODEL = 'text-embedding-ada-002';
const EMBEDDING_DIMENSION = 1536; // Dimension for OpenAI's ada-002 model

/**
 * Creates an embedding vector for the given text
 * Uses OpenAI's embedding API or falls back to a simple hashing approach if API is not available
 * 
 * @param text The text to create an embedding for
 * @returns A numeric vector representing the text embedding
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    // Check if OpenAI API key is available
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (apiKey) {
      // Use OpenAI API to generate embeddings
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: EMBEDDING_MODEL
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result.data[0].embedding;
    } else {
      // Fallback to simple hashing approach if no API key
      return createSimpleEmbedding(text);
    }
  } catch (error) {
    console.error('Error creating embedding:', error);
    // Fallback to simple embedding on error
    return createSimpleEmbedding(text);
  }
}

/**
 * Creates a simple embedding vector using a deterministic hashing approach
 * This is a fallback when the OpenAI API is not available
 * 
 * @param text The text to create an embedding for
 * @returns A numeric vector representing the text embedding
 */
function createSimpleEmbedding(text: string): number[] {
  // Normalize text: lowercase, remove extra spaces, and non-alphanumeric chars
  const normalizedText = text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  
  // Create a fixed-size vector filled with zeros
  const dimension = 64; // Using a smaller dimension for the simple embedding
  const embedding = new Array(dimension).fill(0);
  
  // Simple feature extraction
  const words = normalizedText.split(/\s+/);
  
  // Fill embedding vector based on word hashes
  words.forEach(word => {
    // Simple hash function for the word
    const hash = simpleHash(word);
    const position = hash % dimension;
    
    // Increment the value at the hashed position
    embedding[position] += 1;
  });
  
  // Normalize the vector to unit length
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  
  if (magnitude > 0) {
    return embedding.map(val => val / magnitude);
  }
  
  return embedding;
}

/**
 * Simple string hashing function
 * 
 * @param str The string to hash
 * @returns A numeric hash value
 */
function simpleHash(str: string): number {
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash);
}

/**
 * Calculates the cosine similarity between two embedding vectors
 * 
 * @param a First embedding vector
 * @param b Second embedding vector
 * @returns A value between -1 and 1, where 1 means identical, 0 means orthogonal, and -1 means opposite
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

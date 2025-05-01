import { NextResponse, NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function POST(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;
  
  console.log('[GL DB Setup] Request authenticated:', userId);

  try {  
    // First, enable the vector extension if not already enabled
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
      console.log('Vector extension enabled or already exists');
    } catch (extensionError) {
      console.error('Error enabling vector extension:', extensionError);
      return NextResponse.json({
        error: 'Failed to enable vector extension. Please make sure pgvector is installed on your database.'
      }, { status: 500 });
    }

    // Create the gl_embeddings table if it doesn't exist (gl_code unique for ON CONFLICT)
    await sql`CREATE TABLE IF NOT EXISTS gl_embeddings (
      id SERIAL PRIMARY KEY,
      gl_code VARCHAR(50) NOT NULL UNIQUE,
      description TEXT,
      content TEXT NOT NULL,
      embedding VECTOR(1536)
    );`;

    // Deduplicate existing rows and add UNIQUE constraint for gl_code
    try {
      // Remove duplicates keeping the lowest id per gl_code
      await sql`
        DELETE FROM gl_embeddings a
        USING gl_embeddings b
        WHERE a.gl_code = b.gl_code
          AND a.id > b.id;
      `;
      // Create unique index if not exists (acts as unique constraint)
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS gl_embeddings_gl_code_idx ON gl_embeddings(gl_code);`;
    } catch (dupErr) {
      console.error('Error ensuring unique constraint:', dupErr);
      return NextResponse.json({ error: 'Failed to enforce unique constraint on gl_code. Please resolve duplicates manually.' }, { status: 500 });
    }

    // Create indexes on the gl_embeddings table
    await sql`CREATE INDEX IF NOT EXISTS idx_gl_code ON gl_embeddings(gl_code);`;
    await sql`CREATE INDEX IF NOT EXISTS idx_content_gin ON gl_embeddings USING gin(to_tsvector('english', content));`;
    
    // Create vector index in a separate query to handle potential errors better
    try {
      await sql`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes WHERE indexname = 'idx_embedding_cosine'
          ) THEN
            CREATE INDEX idx_embedding_cosine ON gl_embeddings 
            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
          END IF;
        END
        $$;
      `;
      console.log('Vector index created or already exists');
    } catch (indexError) {
      console.warn('Error creating vector index:', indexError);
      // We'll continue anyway since this is just an optimization
    }

    return NextResponse.json({ 
      success: true,
      message: 'GL codes database tables created successfully' 
    });
  } catch (error) {
    console.error('Error setting up database:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error setting up database';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

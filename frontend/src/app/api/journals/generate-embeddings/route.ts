import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { createEmbedding } from '@/lib/ai/embeddings';

/**
 * API endpoint to generate embeddings for all journal entries that don't have them
 * This is useful for populating the database with embeddings for existing entries
 * 
 * GET /api/journals/generate-embeddings
 */
export async function GET(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get all journal lines without embeddings
    const { rows: journalLines } = await sql.query(`
      SELECT 
        jl.id,
        jl.description,
        a.name as account_name,
        jl.debit,
        jl.credit
      FROM 
        journal_lines jl
      LEFT JOIN
        accounts a ON jl.account_id = a.id
      WHERE 
        jl.embedding IS NULL
      LIMIT 100
    `);
    
    console.log(`Found ${journalLines.length} journal lines without embeddings`);
    
    // Generate and store embeddings
    let successCount = 0;
    let errorCount = 0;
    
    for (const line of journalLines) {
      try {
        // Create text for embedding
        const textToEmbed = [
          line.description || '',
          line.account_name || '',
          `Debit: ${line.debit || 0}`,
          `Credit: ${line.credit || 0}`
        ].filter(Boolean).join(' ');
        
        if (textToEmbed.trim().length === 0) {
          continue; // Skip if no text to embed
        }
        
        // Generate embedding
        const embedding = await createEmbedding(textToEmbed);
        
        if (embedding) {
          // Convert embedding array to string for PostgreSQL
          const embeddingStr = `[${embedding.join(',')}]`;
          
          // Store embedding in database
          await sql.query(`
            UPDATE journal_lines
            SET embedding = $1::vector
            WHERE id = $2
          `, [embeddingStr, line.id]);
          
          successCount++;
        }
      } catch (error) {
        console.error(`Error generating embedding for line ${line.id}:`, error);
        errorCount++;
      }
    }
    
    return NextResponse.json({
      success: true,
      processed: journalLines.length,
      embedded: successCount,
      errors: errorCount,
      message: `Generated embeddings for ${successCount} journal lines, with ${errorCount} errors.`
    });
  } catch (error: any) {
    console.error('[generate-embeddings] Error:', error);
    
    return NextResponse.json({
      error: 'Failed to generate embeddings: ' + (error.message || 'Unknown error')
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { createEmbedding } from '@/lib/ai/embeddings';

/**
 * API endpoint to search for journal entries using vector embeddings
 * 
 * GET /api/journals/search?query=text+to+search
 */
export async function GET(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const query = url.searchParams.get('query');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const page = parseInt(url.searchParams.get('page') || '0');
    const offset = page * limit;
    
    // Check database schema to determine correct column names
    const schemaCheck = await sql.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transactionDate') as has_transaction_date_camel,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journalType') as has_journal_type_camel,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'isPosted') as has_is_posted_camel,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'created_at') as has_created_at,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'createdAt') as has_created_at_camel
    `);
    
    const schema = schemaCheck.rows[0];
    
    // Build column references based on actual schema
    const dateColumn = schema.has_transaction_date ? 'j.transaction_date' : 
                      schema.has_transaction_date_camel ? 'j."transactionDate"' : 
                      schema.has_date ? 'j.date' : 'CURRENT_DATE';
    
    const journalTypeColumn = schema.has_journal_type ? 'j.journal_type' : 
                            schema.has_journal_type_camel ? 'j."journalType"' : 
                            '\'GJ\'';
    
    const isPostedColumn = schema.has_is_posted ? 'j.is_posted' : 
                          schema.has_is_posted_camel ? 'j."isPosted"' : 
                          'TRUE';
    
    const createdAtColumn = schema.has_created_at ? 'j.created_at' : 
                           schema.has_created_at_camel ? 'j."createdAt"' : 
                           'CURRENT_TIMESTAMP';  
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({
        error: 'Search query is required'
      }, { status: 400 });
    }

    // Check if there are any journal lines without embeddings
    console.log(`[journals/search] Checking for entries without embeddings...`);
    const { rows: missingEmbeddings } = await sql.query(`
      SELECT COUNT(*) as count
      FROM journal_lines
      WHERE embedding IS NULL
      LIMIT 1
    `);
    
    console.log(`[journals/search] Found ${missingEmbeddings[0].count} entries without embeddings`);
    
    // If there are entries missing embeddings, process them first
    if (missingEmbeddings[0].count > 0) {
      console.log(`[journals/search] Found entries without embeddings, generating them first...`);
      try {
        // Get journal lines without embeddings (limit to a reasonable number)
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
          LIMIT 50
        `);
        
        // Generate and store embeddings
        let successCount = 0;
        
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
            const lineEmbedding = await createEmbedding(textToEmbed);
            
            if (lineEmbedding) {
              // Convert embedding array to string for PostgreSQL
              const embeddingStr = `[${lineEmbedding.join(',')}]`;
              
              // Update the journal line with the embedding
              await sql.query(`
                UPDATE journal_lines
                SET embedding = $1::vector
                WHERE id = $2
              `, [embeddingStr, line.id]);
              
              successCount++;
            }
          } catch (lineError) {
            console.error(`Error generating embedding for line ${line.id}:`, lineError);
          }
        }
        
        console.log(`[journals/search] Generated ${successCount} embeddings automatically`);
      } catch (batchError) {
        console.error('[journals/search] Error in auto-embedding generation:', batchError);
        // Continue with search even if embedding generation fails
      }
    }

    // Generate embedding for the search query
    let embedding: number[];
    try {
      const result = await createEmbedding(query);
      // Since we're throwing errors in createEmbedding now, this should never be null
      // But to be safe and fix lint errors, we'll check anyway
      if (!result) {
        throw new Error('Failed to generate embedding: null result returned');
      }
      embedding = result;
      console.log(`[journals/search] Successfully generated embedding for query: "${query}"`);
    } catch (error: any) {
      console.error(`[journals/search] Embedding error:`, error);
      
      return NextResponse.json({
        error: error.message || 'Unable to generate embedding for search query',
        hasNoEmbeddings: true,
        message: 'To use AI search, you need to configure an OpenAI API key. Click the Setup tab to enter your API key.'
      }, { status: 400 });
    }

    // Convert embedding array to a string for the SQL query
    const embeddingStr = `[${embedding.join(',')}]`;
    
    // Check if query is specifically about recent/latest transactions
    const isRecentQuery = query.toLowerCase().includes('latest') || 
                          query.toLowerCase().includes('recent') || 
                          query.toLowerCase().includes('last') || 
                          query.toLowerCase().includes('newest') || 
                          query.toLowerCase().includes('just created') || 
                          query.toLowerCase().includes('just posted');
                          
    console.log(`[journals/search] Query contains 'recent/latest' terms: ${isRecentQuery}`);
    
    // Use vector search to find similar journal entries
    // This uses pgvector's <-> operator for cosine distance
    // For recent/latest queries, we'll adjust the ranking to favor recent entries
    const { rows: results } = await sql.query(`
      WITH journal_matches AS (
        SELECT 
          jl.journal_id,
          MIN(jl.embedding <-> $1::vector) as min_distance,
          MAX(j.id) as journal_id_value, -- Higher IDs are typically more recent
          MAX(${createdAtColumn}) as created_date
        FROM 
          journal_lines jl
        JOIN
          journals j ON jl.journal_id = j.id
        WHERE 
          jl.embedding IS NOT NULL
        GROUP BY 
          jl.journal_id
        ORDER BY 
          ${isRecentQuery ? 
            // For recent queries, prioritize both relevance AND recency
            // Using MAX(created_at) from the GROUP BY to avoid the SQL error
            'MIN(jl.embedding <-> $1::vector) * 0.25 + (1.0 / EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - MAX(' + createdAtColumn + '))) * -1.0 * 0.75)' : 
            // Default: prioritize semantic similarity
            'min_distance'}
        LIMIT $2
        OFFSET $3
      )
      SELECT 
        j.id,
        ${dateColumn} as transaction_date,
        j.memo,
        ${journalTypeColumn} as journal_type,
        j.source,
        ${createdAtColumn} as created_at,
        ${isPostedColumn} as is_posted,
        (
          SELECT json_agg(
            json_build_object(
              'id', jl.id,
              'account_id', jl.account_id,
              'account_name', a.name,
              'account_code', a.code,
              'description', jl.description,
              'debit', jl.debit,
              'credit', jl.credit
            )
          )
          FROM journal_lines jl
          LEFT JOIN accounts a ON jl.account_id = a.id
          WHERE jl.journal_id = j.id
        ) as lines,
        jm.min_distance as similarity_score
      FROM 
        journals j
      JOIN 
        journal_matches jm ON j.id = jm.journal_id
      WHERE 
        j.is_deleted = false
      ORDER BY 
        similarity_score
    `, [embeddingStr, limit, offset]);

    // Calculate total for pagination
    const { rows: countRows } = await sql`
      SELECT COUNT(DISTINCT jl.journal_id) as total
      FROM journal_lines jl
      WHERE jl.embedding IS NOT NULL
    `;
    
    const total = parseInt(countRows[0]?.total || '0');
    
    if (total === 0) {
      // Check if we have any journal lines at all
      const { rows: journalCount } = await sql`
        SELECT COUNT(*) as count FROM journal_lines
      `;
      
      const hasSomeJournals = parseInt(journalCount[0]?.count || '0') > 0;
      
      let message = "";
      
      if (hasSomeJournals) {
        message = "No journal entries with embeddings found. You have entries in the system, but they don't have embeddings generated yet. For each new journal entry you post, embeddings will be automatically generated."; 
      } else {
        message = "No journal entries found in the system. Start by creating journal entries, and embeddings will be automatically generated when you post them.";
      }
      
      return NextResponse.json({
        query,
        results: [],
        message,
        hasNoEmbeddings: true,
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    // Format the response
    const formattedResults = results.map(result => ({
      ...result,
      similarity: 1 - parseFloat(result.similarity_score), // Convert distance to similarity (0-1)
      transaction_date: result.transaction_date?.toISOString?.().split('T')[0] || result.transaction_date, // Format date as YYYY-MM-DD
    }));

    return NextResponse.json({
      query,
      results: formattedResults,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('[journals/search] Error searching journals:', error);
    
    return NextResponse.json({
      error: 'Failed to search journals: ' + (error.message || 'Unknown error')
    }, { status: 500 });
  }
}

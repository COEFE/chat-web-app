import { NextResponse, NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { generateEmbedding } from '@/lib/glUtils';
import { POST as dbSetup } from './db-setup/route';

// Interface for GL code data
interface GLCode {
  code: string;
  description: string;
  notes?: string;
}

export async function GET(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    console.log('[GL Codes API] Fetching GL codes for user:', userId);
    
    // Query all GL codes from the database
    const { rows } = await sql`
      SELECT id, gl_code, description, content FROM gl_embeddings
      ORDER BY gl_code
    `;
    
    console.log(`[GL Codes API] Retrieved ${rows.length} GL codes`);
    return NextResponse.json({ glCodes: rows });
  } catch (dbError) {
    console.error('[GL Codes API] Error fetching GL codes:', dbError);
    
    // Check if the error is due to the table not existing
    if (dbError instanceof Error && dbError.message.includes('relation "gl_embeddings" does not exist')) {
      return NextResponse.json({ 
        error: 'GL codes table does not exist. Please set up the database first.',
        setupRequired: true 
      }, { status: 404 });
    }
    
    return NextResponse.json({ 
      error: 'Failed to fetch GL codes',
      message: dbError instanceof Error ? dbError.message : 'Unknown database error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  // Ensure DB schema and indexes exist before insert
  const setupResponse = await dbSetup(request);
  if (setupResponse.status !== 200) return setupResponse;

  try {
    // Parse request body
    const { glCodes }: { glCodes: GLCode[] } = await request.json();
    
    if (!Array.isArray(glCodes) || glCodes.length === 0) {
      return NextResponse.json({ error: 'Invalid input: expected non-empty array of GL codes' }, { status: 400 });
    }

    console.log(`[GL Codes API] Processing ${glCodes.length} GL codes for user: ${userId}`);

    // Process each GL code
    const results = [];
    for (const glCode of glCodes) {
      // Validate the code
      if (!glCode.code || !glCode.description) {
        results.push({
          code: glCode.code || 'Unknown',
          status: 'error',
          message: 'GL code and description are required'
        });
        continue;
      }

      // Format the content for display
      const content = `GL Code ${glCode.code}: ${glCode.description}${glCode.notes ? ` - ${glCode.notes}` : ''}`;
      
      try {
        // Generate the embedding
        const embedding = await generateEmbedding(content);
        const embeddingStr = JSON.stringify(embedding);
        
        if (!embedding) {
          results.push({
            code: glCode.code,
            status: 'error',
            message: 'Failed to generate embedding'
          });
          continue;
        }
        
        // Insert into database, use ON CONFLICT to handle duplicates
        await sql`
          INSERT INTO gl_embeddings (gl_code, description, content, embedding)
          VALUES (${glCode.code}, ${glCode.description}, ${content}, ${embeddingStr}::vector)
          ON CONFLICT (gl_code) DO UPDATE
          SET description = ${glCode.description}, 
              content = ${content},
              embedding = ${embeddingStr}::vector
        `;
        
        results.push({
          code: glCode.code,
          status: 'success',
          message: 'GL code added successfully'
        });
      } catch (embedError) {
        console.error(`[GL Codes API] Error processing GL code ${glCode.code}:`, embedError);
        
        // Try inserting without embedding as fallback
        try {
          await sql`
            INSERT INTO gl_embeddings (gl_code, description, content)
            VALUES (${glCode.code}, ${glCode.description}, ${content})
            ON CONFLICT (gl_code) DO UPDATE
            SET description = ${glCode.description}, content = ${content}
          `;
          
          results.push({
            code: glCode.code,
            status: 'partial',
            message: 'GL code added without embedding (fallback)'
          });
        } catch (dbError) {
          results.push({
            code: glCode.code,
            status: 'error',
            message: embedError instanceof Error ? embedError.message : 'Unknown error'
          });
        }
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('[GL Codes API] Error processing GL codes:', error);
    return NextResponse.json({ 
      error: 'Error processing GL codes',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

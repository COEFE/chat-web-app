import { NextResponse, NextRequest } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * Simple API endpoint to test the GL codes functionality
 * GET - Returns all GL codes in the database
 * POST - Creates a single test GL code
 */

// GET endpoint to fetch all GL codes
export async function GET(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    // Use a simple query to test database access
    const { rows } = await sql`
      SELECT * FROM gl_embeddings
      ORDER BY gl_code
    `;
    
    console.log(`[GL API] Retrieved ${rows.length} GL codes`);
    return NextResponse.json({ success: true, glCodes: rows });
  } catch (dbError) {
    console.error('[GL API] Error fetching GL codes:', dbError);
    
    // Try to create the table if it doesn't exist
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS gl_embeddings (
          id SERIAL PRIMARY KEY,
          gl_code VARCHAR(50) NOT NULL,
          description TEXT,
          content TEXT NOT NULL
        );
      `;
      return NextResponse.json({ 
        success: false, 
        message: 'Created GL codes table. Please try again.',
        error: dbError instanceof Error ? dbError.message : 'Unknown database error'
      }, { status: 500 });
    } catch (createError) {
      return NextResponse.json({ 
        success: false, 
        error: `Error accessing database: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
        debug: {
          originalError: dbError instanceof Error ? dbError.message : 'Unknown',
          createTableError: createError instanceof Error ? createError.message : 'Unknown'
        }
      }, { status: 500 });
    }
  }
}

// POST endpoint to add a test GL code
export async function POST(request: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(request);
  if (error) return error;

  try {
    // Create a simple test GL code
    const testCode = {
      gl_code: "1000",
      description: "Test GL Code",
      content: "GL Code 1000: Test GL Code - This is a test general ledger code"
    };

    // Insert the test code
    const result = await sql`
      INSERT INTO gl_embeddings (gl_code, description, content)
      VALUES (${testCode.gl_code}, ${testCode.description}, ${testCode.content})
      ON CONFLICT (gl_code) DO UPDATE
      SET description = ${testCode.description}, content = ${testCode.content}
      RETURNING *
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'Test GL code created successfully',
      code: result.rows[0]
    });
  } catch (dbError) {
    console.error('[GL API] Error creating test GL code:', dbError);
    
    // Try to create the table if it doesn't exist
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS gl_embeddings (
          id SERIAL PRIMARY KEY,
          gl_code VARCHAR(50) NOT NULL UNIQUE,
          description TEXT,
          content TEXT NOT NULL
        );
      `;
      
      // Try again with the table created
      const result = await sql`
        INSERT INTO gl_embeddings (gl_code, description, content)
        VALUES ('1000', 'Test GL Code', 'GL Code 1000: Test GL Code - This is a test general ledger code')
        RETURNING *
      `;
      
      return NextResponse.json({ 
        success: true, 
        message: 'Created table and test GL code successfully',
        code: result.rows[0]
      });
    } catch (createError) {
      return NextResponse.json({ 
        success: false, 
        error: `Error accessing database: ${createError instanceof Error ? createError.message : 'Unknown error'}`,
        debug: {
          originalError: dbError instanceof Error ? dbError.message : 'Unknown',
          createTableError: createError instanceof Error ? createError.message : 'Unknown'
        }
      }, { status: 500 });
    }
  }
}

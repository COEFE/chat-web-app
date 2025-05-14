import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * API endpoint to create the statement_trackers table
 * This table tracks processed bank and credit card statements to avoid duplicate processing
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(req);
    
    // If authentication failed, return the error
    if (error) {
      return error;
    }
    
    // If no userId, return unauthorized
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Check if the table already exists
    const { rows: existingTables } = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'statement_trackers'
    `;
    
    if (existingTables.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'Statement trackers table already exists',
        alreadyExists: true
      });
    }
    
    // Create the statement_trackers table
    await sql`
      CREATE TABLE statement_trackers (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL,
        statement_number VARCHAR(255) NOT NULL,
        statement_date DATE NOT NULL,
        last_four VARCHAR(4) NOT NULL,
        is_starting_balance BOOLEAN DEFAULT FALSE,
        processed_date TIMESTAMP NOT NULL DEFAULT NOW(),
        user_id VARCHAR(255) NOT NULL,
        CONSTRAINT fk_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `;
    
    // Create indexes for faster lookups
    await sql`
      CREATE INDEX idx_statement_trackers_account_id ON statement_trackers (account_id)
    `;
    
    await sql`
      CREATE INDEX idx_statement_trackers_statement_number ON statement_trackers (statement_number)
    `;
    
    await sql`
      CREATE INDEX idx_statement_trackers_last_four ON statement_trackers (last_four)
    `;
    
    await sql`
      CREATE INDEX idx_statement_trackers_user_id ON statement_trackers (user_id)
    `;
    
    return NextResponse.json({
      success: true,
      message: 'Statement trackers table created successfully'
    });
  } catch (error) {
    console.error('Error creating statement trackers table:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

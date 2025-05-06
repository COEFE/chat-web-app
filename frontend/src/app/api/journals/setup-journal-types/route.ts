import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// API route to ensure journal_types table exists and has default values
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Check if journal_types table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_types'
      ) as exists;
    `;
    
    const tableExists = tableCheck.rows[0].exists;
    
    if (!tableExists) {
      // Create journal_types table first (for foreign key references)
      await sql`
        CREATE TABLE IF NOT EXISTS journal_types (
          code VARCHAR(10) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          requires_approval BOOLEAN DEFAULT FALSE,
          default_memo TEXT,
          auto_numbering_prefix VARCHAR(10),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
    }
    
    // Insert default journal types (will not overwrite existing ones)
    await sql`
      INSERT INTO journal_types (code, name, description) 
      VALUES 
        ('GJ', 'General Journal', 'For general accounting entries'),
        ('AP', 'Accounts Payable', 'For vendor bills and payments'),
        ('AR', 'Accounts Receivable', 'For customer invoices and payments'),
        ('ADJ', 'Adjusting Entries', 'For period-end adjustments')
      ON CONFLICT (code) DO NOTHING;
    `;
    
    // Verify journal types exist
    const journalTypes = await sql`SELECT * FROM journal_types ORDER BY code`;
    
    return NextResponse.json({ 
      success: true, 
      message: tableExists ? 'Journal types verified' : 'Journal types table created',
      types: journalTypes.rows
    });
    
  } catch (error: any) {
    console.error('Error setting up journal types:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Failed to set up journal types' 
    }, { status: 500 });
  }
}

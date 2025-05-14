import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';

// POST /api/journals/db-setup – create journals tables
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
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
    
    // Insert default journal types
    await sql`
      INSERT INTO journal_types (code, name, description) 
      VALUES 
        ('GJ', 'General Journal', 'For general accounting entries'),
        ('AP', 'Accounts Payable', 'For vendor bills and payments'),
        ('AR', 'Accounts Receivable', 'For customer invoices and payments'),
        ('ADJ', 'Adjusting Entries', 'For period-end adjustments')
      ON CONFLICT (code) DO NOTHING;
    `;

    // Create journals table - header information for each transaction
    await sql`
      CREATE TABLE IF NOT EXISTS journals (
        id SERIAL PRIMARY KEY,
        transaction_date DATE NOT NULL,
        journal_number VARCHAR(50),
        journal_type VARCHAR(10) REFERENCES journal_types(code),
        reference_number VARCHAR(100),
        memo TEXT NOT NULL,
        source VARCHAR(100),
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        is_posted BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE
      );
    `;
    
    // For backwards compatibility, check if the date column exists and migrate data if needed
    try {
      // Check if the old date column exists
      const dateColumnExists = await sql`
        SELECT EXISTS (
          SELECT 1 
          FROM information_schema.columns 
          WHERE table_name = 'journals' AND column_name = 'date'
        ) as exists;
      `;
      
      // If the date column exists, we need to check if transaction_date exists
      if (dateColumnExists.rows[0].exists) {
        // Check if transaction_date column exists
        const transactionDateExists = await sql`
          SELECT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'journals' AND column_name = 'transaction_date'
          ) as exists;
        `;
        
        // If transaction_date doesn't exist yet, add it
        if (!transactionDateExists.rows[0].exists) {
          console.log('Adding transaction_date column...');
          await sql`ALTER TABLE journals ADD COLUMN transaction_date DATE;`;
        }
        
        console.log('Migrating date column to transaction_date...');
        await sql`
          UPDATE journals 
          SET transaction_date = date 
          WHERE transaction_date IS NULL;
        `;
        
        // Only drop the column if it's safe (all data migrated)
        const nullDateCheck = await sql`
          SELECT COUNT(*) as count FROM journals 
          WHERE transaction_date IS NULL;
        `;
        
        if (parseInt(nullDateCheck.rows[0].count) === 0) {
          console.log('All data migrated, dropping date column...');
          await sql`ALTER TABLE journals DROP COLUMN IF EXISTS date;`;
        }
      }
    } catch (e) {
      console.error('Error checking/migrating date column:', e);
      // Non-fatal error, continue with setup
    }

    // Create journal_lines table - individual line items for each journal entry
    await sql`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        debit NUMERIC(15, 2) DEFAULT 0,
        credit NUMERIC(15, 2) DEFAULT 0,
        description TEXT,
        embedding VECTOR(1536) -- For AI classification (pgvector extension)
      );
    `;

    // Create journal_audit table - audit trail for changes to journal entries
    await sql`
      CREATE TABLE IF NOT EXISTS journal_audit (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        changed_by VARCHAR(100) NOT NULL,
        changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        before JSONB,
        after JSONB
      );
    `;

    // Create budgets table - for budget vs actual reporting
    await sql`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        period VARCHAR(7) NOT NULL, -- Format: YYYY-MM
        amount NUMERIC(15, 2) NOT NULL,
        memo TEXT,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(account_id, period)
      );
    `;

    // Create journal_attachments table - for storing document references
    await sql`
      CREATE TABLE IF NOT EXISTS journal_attachments (
        id SERIAL PRIMARY KEY,
        journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_url TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_type VARCHAR(100),
        file_size INTEGER,
        uploaded_by VARCHAR(100) NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Ensure legacy installations have file_path column
    await sql`
      ALTER TABLE journal_attachments ADD COLUMN IF NOT EXISTS file_path TEXT;
    `;

    // Add constraint to ensure debits = credits for each journal entry
    // This is a critical accounting constraint for double-entry bookkeeping
    // Use text template to avoid SQL injection and ensure proper escaping
    const balanceFunctionSQL = `
      CREATE OR REPLACE FUNCTION check_journal_balance()
      RETURNS TRIGGER AS $$
      DECLARE
        total_debits NUMERIC;
        total_credits NUMERIC;
      BEGIN
        SELECT 
          COALESCE(SUM(debit), 0), 
          COALESCE(SUM(credit), 0)
        INTO 
          total_debits, 
          total_credits
        FROM 
          journal_lines
        WHERE 
          journal_id = NEW.journal_id;
          
        IF total_debits != total_credits THEN
          RAISE EXCEPTION 'Journal entry must balance: debits (%) must equal credits (%)', 
            total_debits, 
            total_credits;
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    // Execute as raw SQL to avoid prepared statement issues
    await sql.query(balanceFunctionSQL);

    // Drop trigger if exists (separate statement)
    try {
      await sql`DROP TRIGGER IF EXISTS check_journal_balance_trigger ON journal_lines;`;
    } catch (triggerErr) {
      console.warn('[journals/db-setup] Warning dropping trigger:', triggerErr);
      // Continue anyway, as the trigger might not exist
    }
    
    // Create trigger (separate statement)
    const triggerSQL = `
      CREATE CONSTRAINT TRIGGER check_journal_balance_trigger
      AFTER INSERT OR UPDATE ON journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      EXECUTE FUNCTION check_journal_balance();
    `;
    
    // Execute as raw SQL to avoid prepared statement issues
    await sql.query(triggerSQL);

    return NextResponse.json({ 
      success: true, 
      message: 'Journal tables created successfully' 
    });
  } catch (err: any) {
    console.error('[journals/db-setup] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

-- Journal Types Structure Implementation
-- This migration script creates and populates the journal_types table
-- and adds journal_type support to the journals table

-- Check if journal_types table exists, create if it doesn't
CREATE TABLE IF NOT EXISTS journal_types (
  code VARCHAR(3) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  default_memo TEXT,
  auto_numbering_prefix VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed with standard journal types if table is empty
INSERT INTO journal_types (code, name, description, requires_approval, default_memo, auto_numbering_prefix)
SELECT * FROM (VALUES
  ('GJ', 'General Journal', 'For miscellaneous transactions that don''t fit into specialized journals', TRUE, NULL, 'GJ-'),
  ('AP', 'Accounts Payable', 'For vendor bills and payment transactions', TRUE, 'Vendor payment: ', 'AP-'),
  ('AR', 'Accounts Receivable', 'For customer invoices and receipt transactions', TRUE, 'Customer invoice: ', 'AR-'),
  ('CR', 'Cash Receipts', 'For incoming cash and payments from various sources', FALSE, 'Cash receipt: ', 'CR-'),
  ('CD', 'Cash Disbursements', 'For outgoing cash and payments for various purposes', TRUE, 'Payment for: ', 'CD-'),
  ('PR', 'Payroll', 'For employee compensation, benefits, and tax withholdings', TRUE, 'Payroll period: ', 'PR-'),
  ('FA', 'Fixed Assets', 'For capital asset purchases, depreciation, and disposals', TRUE, 'Asset transaction: ', 'FA-'),
  ('ADJ', 'Adjusting Entries', 'For period-end adjustments and corrections', TRUE, 'Adjustment: ', 'ADJ-')
) AS values (code, name, description, requires_approval, default_memo, auto_numbering_prefix)
WHERE NOT EXISTS (SELECT 1 FROM journal_types);

-- Check if journals table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'journals') THEN
    -- Add journal_type column if it doesn't exist
    IF NOT EXISTS (SELECT FROM information_schema.columns 
                  WHERE table_name = 'journals' AND column_name = 'journal_type') THEN
      ALTER TABLE journals ADD COLUMN journal_type VARCHAR(3) REFERENCES journal_types(code);
      
      -- Create index on journal_type for faster filtering
      CREATE INDEX idx_journals_journal_type ON journals(journal_type);
      
      -- Set default value for existing records
      UPDATE journals SET journal_type = 'GJ' WHERE journal_type IS NULL;
    END IF;
  ELSE
    -- Create journals table with journal_type support
    CREATE TABLE journals (
      id SERIAL PRIMARY KEY,
      journal_number VARCHAR(50) UNIQUE,
      journal_type VARCHAR(3) REFERENCES journal_types(code) NOT NULL DEFAULT 'GJ',
      transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
      post_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      memo TEXT,
      source VARCHAR(100),
      reference_number VARCHAR(100),
      is_posted BOOLEAN DEFAULT FALSE,
      is_recurring BOOLEAN DEFAULT FALSE,
      created_by VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create index on journal_type for faster filtering
    CREATE INDEX idx_journals_journal_type ON journals(journal_type);
    
    -- Create index on transaction_date for date range queries
    CREATE INDEX idx_journals_transaction_date ON journals(transaction_date);
    
    -- Table for journal lines (debits and credits)
    CREATE TABLE journal_lines (
      id SERIAL PRIMARY KEY,
      journal_id INTEGER REFERENCES journals(id) ON DELETE CASCADE,
      line_number INTEGER,
      account_id INTEGER REFERENCES accounts(id),
      description TEXT,
      debit NUMERIC(15, 2) DEFAULT 0,
      credit NUMERIC(15, 2) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT ck_debit_credit CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0))
    );
    
    -- Create index for faster journal lookup
    CREATE INDEX idx_journal_lines_journal_id ON journal_lines(journal_id);
    
    -- Create index for account-based reporting
    CREATE INDEX idx_journal_lines_account_id ON journal_lines(account_id);
    
    -- Table for journal attachments
    CREATE TABLE journal_attachments (
      id SERIAL PRIMARY KEY,
      journal_id INTEGER REFERENCES journals(id) ON DELETE CASCADE,
      file_name VARCHAR(255) NOT NULL,
      file_url TEXT NOT NULL,
      file_path VARCHAR(1000) NOT NULL,
      file_size INTEGER,
      file_type VARCHAR(100),
      uploaded_by VARCHAR(255),
      uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create index for faster journal lookup
    CREATE INDEX idx_journal_attachments_journal_id ON journal_attachments(journal_id);
    
    -- Table for journal audit trail
    CREATE TABLE journal_audit (
      id SERIAL PRIMARY KEY,
      journal_id INTEGER REFERENCES journals(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'POST', 'UNPOST'
      action_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      changed_by VARCHAR(255),
      before_state JSONB,
      after_state JSONB
    );
    
    -- Create index for faster journal lookup
    CREATE INDEX idx_journal_audit_journal_id ON journal_audit(journal_id);
  END IF;
END $$;

-- Create a function to enforce balanced debits and credits within a journal
CREATE OR REPLACE FUNCTION check_journal_balance() RETURNS TRIGGER AS $$
DECLARE
  debit_sum NUMERIC;
  credit_sum NUMERIC;
  diff NUMERIC;
BEGIN
  -- Calculate the sum of debits and credits for the affected journal
  SELECT 
    COALESCE(SUM(debit), 0) AS debit_total,
    COALESCE(SUM(credit), 0) AS credit_total
  INTO debit_sum, credit_sum
  FROM journal_lines
  WHERE journal_id = NEW.journal_id;
  
  -- Calculate the difference (should be zero for balanced journals)
  diff := debit_sum - credit_sum;
  
  -- Allow a small rounding difference (less than one cent)
  IF ABS(diff) > 0.01 THEN
    RAISE EXCEPTION 'Journal entries must balance. Debits: %.2f, Credits: %.2f, Difference: %.2f', 
      debit_sum, credit_sum, diff;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger only if journals table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables 
            WHERE table_name = 'journals' AND table_name = 'journal_lines') THEN
    
    -- Drop the trigger if it already exists
    DROP TRIGGER IF EXISTS check_journal_balance_trigger ON journal_lines;
    
    -- Create the trigger for insert or update operations
    CREATE CONSTRAINT TRIGGER check_journal_balance_trigger
    AFTER INSERT OR UPDATE ON journal_lines
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION check_journal_balance();
  END IF;
END $$;

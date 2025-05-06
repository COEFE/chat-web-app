-- Migration to update the journals table with new columns for journal types and numbering

-- First, check if the journal_types table exists, if not create it
CREATE TABLE IF NOT EXISTS journal_types (
  code VARCHAR(10) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  default_memo TEXT,
  auto_numbering_prefix VARCHAR(10),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default journal types if they don't exist
INSERT INTO journal_types (code, name, description) 
VALUES 
  ('GJ', 'General Journal', 'For general accounting entries')
ON CONFLICT (code) DO NOTHING;

INSERT INTO journal_types (code, name, description) 
VALUES 
  ('AP', 'Accounts Payable', 'For vendor bills and payments')
ON CONFLICT (code) DO NOTHING;

INSERT INTO journal_types (code, name, description) 
VALUES 
  ('AR', 'Accounts Receivable', 'For customer invoices and payments')
ON CONFLICT (code) DO NOTHING;

INSERT INTO journal_types (code, name, description) 
VALUES 
  ('ADJ', 'Adjusting Entries', 'For period-end adjustments')
ON CONFLICT (code) DO NOTHING;

-- Add missing columns to the journals table if they don't exist
DO $$
BEGIN
  -- Add journal_number column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') THEN
    ALTER TABLE journals ADD COLUMN journal_number VARCHAR(50);
  END IF;

  -- Add journal_type column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') THEN
    ALTER TABLE journals ADD COLUMN journal_type VARCHAR(10) DEFAULT 'GJ' REFERENCES journal_types(code);
  END IF;

  -- Add reference_number column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') THEN
    ALTER TABLE journals ADD COLUMN reference_number VARCHAR(100);
  END IF;

  -- Rename date column to transaction_date if needed
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') AND 
     NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') THEN
    ALTER TABLE journals RENAME COLUMN date TO transaction_date;
  END IF;
  
  -- Otherwise add transaction_date if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') THEN
    ALTER TABLE journals ADD COLUMN transaction_date DATE DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Update existing journals to have GJ as the journal type if they don't have one
UPDATE journals SET journal_type = 'GJ' WHERE journal_type IS NULL;

-- Create index on journal_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_journals_number ON journals(journal_number);

-- Create index on journal_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_journals_type ON journals(journal_type);

-- Create index on transaction_date for faster date-based queries
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(transaction_date);

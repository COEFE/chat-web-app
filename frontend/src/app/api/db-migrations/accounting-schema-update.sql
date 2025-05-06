-- Accounting System Schema Updates
-- This migration adds account types, check constraints, and indexes

-- 1. Add account_type to accounts table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'account_type'
  ) THEN
    ALTER TABLE accounts ADD COLUMN account_type VARCHAR(20) DEFAULT 'other' NOT NULL;
    
    -- Set account types based on account code ranges
    UPDATE accounts SET account_type = 'asset' WHERE code LIKE '1%';
    UPDATE accounts SET account_type = 'liability' WHERE code LIKE '2%';
    UPDATE accounts SET account_type = 'equity' WHERE code LIKE '3%';
    UPDATE accounts SET account_type = 'revenue' WHERE code LIKE '4%';
    UPDATE accounts SET account_type = 'expense' WHERE code LIKE '5%' OR code LIKE '6%';
  END IF;
END $$;

-- 2. Add is_active flag to accounts if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL;
  END IF;
END $$;

-- 3. Create a function to check if journal entries are balanced
CREATE OR REPLACE FUNCTION check_journal_balanced()
RETURNS TRIGGER AS $$
DECLARE
  journal_total DECIMAL(15,2);
BEGIN
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) INTO journal_total
  FROM journal_lines
  WHERE journal_id = NEW.journal_id;
  
  -- Allow a small rounding error (less than 1 cent)
  IF ABS(journal_total) >= 0.01 THEN
    RAISE EXCEPTION 'Journal entry is not balanced. Difference: %', journal_total;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create or replace the trigger for balanced journal entries
DROP TRIGGER IF EXISTS ensure_journal_balanced ON journal_lines;
CREATE TRIGGER ensure_journal_balanced
AFTER INSERT OR UPDATE ON journal_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_balanced();

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_id ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_parent_id ON accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_journal_audit_journal_id ON journal_audit(journal_id);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(date);
CREATE INDEX IF NOT EXISTS idx_journals_is_posted ON journals(is_posted);

-- 6. Add check constraint to journal_lines to prevent negative values
ALTER TABLE journal_lines DROP CONSTRAINT IF EXISTS check_positive_amounts;
ALTER TABLE journal_lines ADD CONSTRAINT check_positive_amounts 
  CHECK (debit >= 0 AND credit >= 0);

-- 7. Ensure pgvector extension is created
CREATE EXTENSION IF NOT EXISTS vector;

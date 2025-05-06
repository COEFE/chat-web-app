-- Accounting Schema Enhancements
-- This migration adds full double-entry accounting capabilities
-- including account types, balance constraints, and vector embeddings

-- 1. Update accounts table with account type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'type') THEN
    ALTER TABLE accounts ADD COLUMN type VARCHAR(20);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'is_active') THEN
    ALTER TABLE accounts ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
  END IF;
END
$$;

-- Create index for faster account lookups
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

-- 2. Create account_types reference table
CREATE TABLE IF NOT EXISTS account_types (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  normal_balance VARCHAR(10) NOT NULL CHECK (normal_balance IN ('debit', 'credit')),
  financial_statement VARCHAR(20) CHECK (financial_statement IN ('balance_sheet', 'income_statement', 'cash_flow', 'other')),
  is_system BOOLEAN DEFAULT FALSE
);

-- Insert standard account types if they don't exist
INSERT INTO account_types (code, name, normal_balance, financial_statement, is_system)
VALUES 
  ('asset', 'Assets', 'debit', 'balance_sheet', TRUE),
  ('liability', 'Liabilities', 'credit', 'balance_sheet', TRUE),
  ('equity', 'Equity', 'credit', 'balance_sheet', TRUE),
  ('revenue', 'Revenue', 'credit', 'income_statement', TRUE),
  ('expense', 'Expenses', 'debit', 'income_statement', TRUE),
  ('other_income', 'Other Income', 'credit', 'income_statement', TRUE),
  ('other_expense', 'Other Expenses', 'debit', 'income_statement', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 3. Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 4. Add constraint to ensure debits = credits for each journal
-- First, create a function to check balance
CREATE OR REPLACE FUNCTION check_journal_balance()
RETURNS TRIGGER AS $$
DECLARE
  total_debits NUMERIC;
  total_credits NUMERIC;
BEGIN
  -- Calculate totals for the journal entry
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
  
  -- Check if totals match (with small rounding tolerance)
  IF ABS(total_debits - total_credits) > 0.01 THEN
    RAISE EXCEPTION 'Journal entry % is not balanced. Debits (%) do not equal credits (%)', 
      NEW.journal_id, total_debits, total_credits;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for balance check
DROP TRIGGER IF EXISTS check_balance_trigger ON journal_lines;
CREATE TRIGGER check_balance_trigger
AFTER INSERT OR UPDATE ON journal_lines
FOR EACH ROW
EXECUTE FUNCTION check_journal_balance();

-- 5. Enhance journal_lines for better performance and AI 
-- Create index for faster account-based reporting
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_id ON journal_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_id ON journal_lines(journal_id);

-- If embedding column doesn't exist, add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'journal_lines' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE journal_lines ADD COLUMN embedding VECTOR(1536);
  END IF;
END
$$;

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

-- 4. Ensure journal balance check is handled by '001_journal_balance_constraints.sql'
-- The row-level trigger previously here has been removed to avoid redundancy
-- with the deferred constraint trigger, which is more appropriate for journal balancing.

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

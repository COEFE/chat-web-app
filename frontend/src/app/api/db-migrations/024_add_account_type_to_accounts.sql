-- Migration: Add account_type column to accounts table
-- This migration adds an account_type column to the accounts table and populates it
-- based on the first digit of each account's code.

-- Step 1: Add the account_type column to the accounts table
ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS account_type VARCHAR(50);

-- Step 2: Update existing accounts with their respective account_type
-- based on the first digit of their 'code'.

UPDATE accounts
SET account_type = 'Asset'
WHERE code LIKE '1%' AND account_type IS NULL;

UPDATE accounts
SET account_type = 'Liability'
WHERE code LIKE '2%' AND account_type IS NULL;

UPDATE accounts
SET account_type = 'Equity'
WHERE code LIKE '3%' AND account_type IS NULL;

UPDATE accounts
SET account_type = 'Revenue'
WHERE code LIKE '4%' AND account_type IS NULL;

UPDATE accounts
SET account_type = 'Cost of Goods Sold'
WHERE code LIKE '5%' AND account_type IS NULL;

UPDATE accounts
SET account_type = 'Expense'
WHERE (code LIKE '6%' OR code LIKE '7%' OR code LIKE '8%' OR code LIKE '9%') AND account_type IS NULL;

-- Optional: Add an index to the new column to improve query performance
CREATE INDEX IF NOT EXISTS idx_accounts_account_type ON accounts(account_type);

-- Optional: Output verification counts
DO $$
BEGIN
    RAISE NOTICE 'Account types updated:';
    RAISE NOTICE 'Assets: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Asset');
    RAISE NOTICE 'Liabilities: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Liability');
    RAISE NOTICE 'Equity: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Equity');
    RAISE NOTICE 'Revenue: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Revenue');
    RAISE NOTICE 'Cost of Goods Sold: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Cost of Goods Sold');
    RAISE NOTICE 'Expenses: %', (SELECT COUNT(*) FROM accounts WHERE account_type = 'Expense');
END $$;

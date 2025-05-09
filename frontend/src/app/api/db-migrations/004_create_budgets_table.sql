-- Migration: 004_create_budgets_table.sql
-- Description: Creates the budgets table for storing account budgets per period.
-- Date: 2025-05-07

BEGIN;

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL,
    period DATE NOT NULL, -- Represents the first day of the budget period (e.g., YYYY-MM-01 for monthly)
    amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_budgets_account_id FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE CASCADE,

    -- Ensure only one budget entry per account per period
    CONSTRAINT uq_budgets_account_period UNIQUE (account_id, period)
);

-- Index for faster lookups by account_id and period
CREATE INDEX IF NOT EXISTS idx_budgets_account_id_period ON budgets(account_id, period);

-- Comments for documentation
COMMENT ON TABLE budgets IS 'Stores budget amounts for specific accounts and periods (e.g., monthly).';
COMMENT ON COLUMN budgets.period IS 'The start date of the budget period (e.g., 2025-01-01 for January 2025). Typically the first day of the month.';
COMMENT ON COLUMN budgets.amount IS 'The budgeted amount for the account during the specified period.';

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_budgets_update_updated_at ON budgets;
CREATE TRIGGER trg_budgets_update_updated_at
BEFORE UPDATE ON budgets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

COMMIT;

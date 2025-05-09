-- Add soft-delete support to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
-- Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_accounts_is_deleted ON accounts(is_deleted);

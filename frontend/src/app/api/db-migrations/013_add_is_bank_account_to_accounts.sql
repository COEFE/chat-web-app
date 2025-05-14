-- Add is_bank_account column to accounts table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'accounts' AND column_name = 'is_bank_account'
  ) THEN
    ALTER TABLE accounts ADD COLUMN is_bank_account BOOLEAN DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS idx_accounts_is_bank_account ON accounts(is_bank_account);
  END IF;
END
$$;

-- Create bank_accounts table for bank reconciliation feature
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  account_number VARCHAR(255) NOT NULL,
  routing_number VARCHAR(255),
  institution_name VARCHAR(255) NOT NULL,
  gl_account_id INTEGER NOT NULL REFERENCES accounts(id),
  last_reconciled_date DATE,
  last_reconciled_balance DECIMAL(15, 2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bank_accounts_name ON bank_accounts(name);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_gl_account_id ON bank_accounts(gl_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_deleted ON bank_accounts(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_is_active ON bank_accounts(is_active);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_account_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_account_timestamp
BEFORE UPDATE ON bank_accounts
FOR EACH ROW
EXECUTE PROCEDURE update_bank_account_timestamp();

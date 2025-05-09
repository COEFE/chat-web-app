-- Create bank_transactions table for bank reconciliation feature
CREATE TABLE IF NOT EXISTS bank_transactions (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  transaction_date DATE NOT NULL,
  post_date DATE,
  description TEXT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL, -- 'credit' or 'debit'
  status VARCHAR(50) NOT NULL DEFAULT 'unmatched', -- 'unmatched', 'matched', 'reconciled'
  matched_transaction_id INTEGER,
  match_type VARCHAR(50), -- 'payment', 'bill', 'invoice', 'journal', 'manual'
  reference_number VARCHAR(255),
  check_number VARCHAR(255),
  notes TEXT,
  import_batch_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bank_transactions_bank_account_id ON bank_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_transaction_date ON bank_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_is_deleted ON bank_transactions(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_import_batch_id ON bank_transactions(import_batch_id);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_transaction_timestamp
BEFORE UPDATE ON bank_transactions
FOR EACH ROW
EXECUTE PROCEDURE update_bank_transaction_timestamp();

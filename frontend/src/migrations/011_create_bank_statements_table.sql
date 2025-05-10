-- Create bank_statements table for bank reconciliation feature
CREATE TABLE IF NOT EXISTS bank_statements (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  starting_balance DECIMAL(15, 2) NOT NULL,
  ending_balance DECIMAL(15, 2) NOT NULL,
  is_reconciled BOOLEAN DEFAULT FALSE,
  reconciled_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bank_statements_bank_account_id ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_is_reconciled ON bank_statements(is_reconciled);
CREATE INDEX IF NOT EXISTS idx_bank_statements_is_deleted ON bank_statements(is_deleted);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_bank_statement_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_bank_statement_timestamp
BEFORE UPDATE ON bank_statements
FOR EACH ROW
EXECUTE PROCEDURE update_bank_statement_timestamp();

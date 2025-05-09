-- Create reconciliation_sessions table for bank reconciliation feature
CREATE TABLE IF NOT EXISTS reconciliation_sessions (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  starting_balance DECIMAL(15, 2) NOT NULL,
  ending_balance DECIMAL(15, 2) NOT NULL,
  bank_statement_balance DECIMAL(15, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned'
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_bank_account_id ON reconciliation_sessions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_status ON reconciliation_sessions(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sessions_is_deleted ON reconciliation_sessions(is_deleted);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_reconciliation_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_reconciliation_session_timestamp
BEFORE UPDATE ON reconciliation_sessions
FOR EACH ROW
EXECUTE PROCEDURE update_reconciliation_session_timestamp();

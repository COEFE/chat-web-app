-- Create reconciliation_matches table for tracking matched transactions
CREATE TABLE IF NOT EXISTS reconciliation_matches (
  id SERIAL PRIMARY KEY,
  reconciliation_session_id INTEGER NOT NULL REFERENCES reconciliation_sessions(id),
  bank_transaction_ids JSONB NOT NULL, -- Array of bank transaction IDs that are matched
  gl_transaction_ids JSONB NOT NULL, -- Array of GL transaction IDs that are matched
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255) NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_session_id ON reconciliation_matches(reconciliation_session_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_matches_is_deleted ON reconciliation_matches(is_deleted);

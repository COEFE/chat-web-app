-- Create gl_reconciliations table for tracking reconciled GL entries
CREATE TABLE IF NOT EXISTS gl_reconciliations (
  id SERIAL PRIMARY KEY,
  gl_transaction_id INTEGER NOT NULL,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  reconciliation_session_id INTEGER NOT NULL REFERENCES reconciliation_sessions(id),
  reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reconciled_by VARCHAR(255) NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(gl_transaction_id, bank_account_id)
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_gl_reconciliations_gl_transaction_id ON gl_reconciliations(gl_transaction_id);
CREATE INDEX IF NOT EXISTS idx_gl_reconciliations_bank_account_id ON gl_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_gl_reconciliations_session_id ON gl_reconciliations(reconciliation_session_id);
CREATE INDEX IF NOT EXISTS idx_gl_reconciliations_is_deleted ON gl_reconciliations(is_deleted);

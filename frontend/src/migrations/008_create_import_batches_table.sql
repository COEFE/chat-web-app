-- Create import_batches table for tracking CSV imports
CREATE TABLE IF NOT EXISTS import_batches (
  id SERIAL PRIMARY KEY,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id),
  file_name VARCHAR(255) NOT NULL,
  record_count INTEGER NOT NULL,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  imported_by VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'processing', 'completed', 'completed_with_errors', 'failed'
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_import_batches_bank_account_id ON import_batches(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_is_deleted ON import_batches(is_deleted);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_import_batch_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_import_batch_timestamp
BEFORE UPDATE ON import_batches
FOR EACH ROW
EXECUTE PROCEDURE update_import_batch_timestamp();

-- Add bank_transaction_id to journal_lines to link to bank_transactions
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS bank_transaction_id INTEGER;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_journal_lines_bank_transaction_id ON journal_lines(bank_transaction_id);

-- Add foreign key constraint
ALTER TABLE journal_lines 
ADD CONSTRAINT fk_journal_lines_bank_transaction_id 
FOREIGN KEY (bank_transaction_id) 
REFERENCES bank_transactions(id) 
ON DELETE SET NULL;

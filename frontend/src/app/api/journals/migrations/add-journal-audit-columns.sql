-- First check if the table exists, if not create it
CREATE TABLE IF NOT EXISTS journal_audit (
    id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Add standard audit columns that might be missing
    action VARCHAR(50) -- This is the column referenced in your code
);

-- Now add individual columns if they don't exist
DO $$ 
BEGIN 
    -- Check and add 'action' column if it doesn't exist
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'action'
    ) THEN 
        ALTER TABLE journal_audit ADD COLUMN action VARCHAR(50);
    END IF;
    
    -- Check and add 'details' column for additional audit information (optional)
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'details'
    ) THEN 
        ALTER TABLE journal_audit ADD COLUMN details JSONB;
    END IF;
    
    -- Add more column checks as needed
END $$;

-- Create an index on journal_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_journal_audit_journal_id ON journal_audit(journal_id);

-- Add a foreign key constraint if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_journal_audit_journal_id' 
    ) THEN
        ALTER TABLE journal_audit 
        ADD CONSTRAINT fk_journal_audit_journal_id
        FOREIGN KEY (journal_id) REFERENCES journals(id);
    END IF;
EXCEPTION
    -- Constraint might not be created if the referenced table doesn't have proper PK
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create foreign key constraint: %', SQLERRM;
END $$;

-- Sample comment for documentation
COMMENT ON TABLE journal_audit IS 'Tracks all actions performed on journal entries';

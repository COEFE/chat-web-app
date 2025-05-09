-- First check if the table exists, if not create it
CREATE TABLE IF NOT EXISTS journal_audit (
    id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL,
    performed_by VARCHAR(255) NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    action VARCHAR(50) NOT NULL, 
    before_state JSONB NULL,    
    after_state JSONB NULL     
);

-- Now add individual columns if they don't exist (idempotency)
DO $$ 
BEGIN 
    -- Check and add 'action' column if it doesn't exist or ensure it's NOT NULL
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'action'
    ) THEN 
        ALTER TABLE journal_audit ADD COLUMN action VARCHAR(50) NOT NULL;
    ELSE
        ALTER TABLE journal_audit ALTER COLUMN action SET NOT NULL;
    END IF;

    -- Check and add 'before_state' column if it doesn't exist
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'before_state'
    ) THEN 
        ALTER TABLE journal_audit ADD COLUMN before_state JSONB NULL;
    END IF;

    -- Check and add 'after_state' column if it doesn't exist
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'after_state'
    ) THEN 
        ALTER TABLE journal_audit ADD COLUMN after_state JSONB NULL;
    END IF;
    
    -- Check and remove 'details' column if it exists, as its purpose is covered by before_state/after_state
    IF EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_audit' AND column_name = 'details'
    ) THEN 
        ALTER TABLE journal_audit DROP COLUMN details;
    END IF;
END $$;

-- Create an index on journal_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_journal_audit_journal_id ON journal_audit(journal_id);

-- Add a foreign key constraint if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_journal_audit_journal_id' AND table_name = 'journal_audit'
    ) THEN
        ALTER TABLE journal_audit 
        ADD CONSTRAINT fk_journal_audit_journal_id
        FOREIGN KEY (journal_id) REFERENCES journals(id) ON DELETE CASCADE; 
    END IF;
EXCEPTION
    -- Constraint might not be created if the referenced table doesn't have proper PK or other issues
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not create or verify foreign key constraint fk_journal_audit_journal_id: %', SQLERRM;
END $$;

-- Sample comment for documentation
COMMENT ON TABLE journal_audit IS 'Tracks all actions (create, update, delete) performed on journal entries, including before and after states for changes.';
COMMENT ON COLUMN journal_audit.before_state IS 'JSONB representation of the journal (or relevant parts) before the action was performed.';
COMMENT ON COLUMN journal_audit.after_state IS 'JSONB representation of the journal (or relevant parts) after the action was performed.';

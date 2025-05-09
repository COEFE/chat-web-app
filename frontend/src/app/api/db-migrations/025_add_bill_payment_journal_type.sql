-- Migration: Add BP (Bill Payment) journal type
-- This migration adds the missing BP journal type needed for bill payments

-- Check if the journal_types table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'journal_types') THEN
        -- Add the 'BP' journal type if it doesn't already exist
        INSERT INTO journal_types (code, name, description)
        VALUES ('BP', 'Bill Payment', 'Journal entries created when recording bill payments')
        ON CONFLICT (code) DO NOTHING;
        
        RAISE NOTICE 'Added BP (Bill Payment) journal type to journal_types table';
    ELSE
        RAISE NOTICE 'The journal_types table does not exist. Migration cannot proceed.';
    END IF;
END $$;

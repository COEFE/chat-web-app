-- Migration: Add bill refund journal type
-- This migration adds the 'BR' (Bill Refund) journal type to the journal_types table

-- First check if the journal_types table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_types') THEN
        -- Check if the BR journal type already exists
        IF NOT EXISTS (SELECT 1 FROM journal_types WHERE code = 'BR') THEN
            -- Insert the BR journal type
            INSERT INTO journal_types (code, name, description)
            VALUES ('BR', 'Bill Refund', 'Refund for a vendor bill');
            
            RAISE NOTICE 'Added BR (Bill Refund) journal type';
        ELSE
            RAISE NOTICE 'BR (Bill Refund) journal type already exists';
        END IF;
    ELSE
        RAISE NOTICE 'journal_types table does not exist, skipping migration';
    END IF;
END
$$;

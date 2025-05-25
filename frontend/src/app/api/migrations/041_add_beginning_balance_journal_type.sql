-- Migration: 041_add_beginning_balance_journal_type.sql
-- Description: Adds 'BB' (Beginning Balance) journal type for recording starting balances
-- for credit card accounts and other accounts when they are first set up.

-- Check if journal_types table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_types'
    ) THEN
        -- Add Beginning Balance journal type
        INSERT INTO journal_types (code, name, description)
        VALUES ('BB', 'Beginning Balance', 'For recording beginning balances when setting up accounts')
        ON CONFLICT (code) DO NOTHING;
        
        RAISE NOTICE 'Beginning Balance journal type added successfully';
    ELSE
        RAISE EXCEPTION 'journal_types table does not exist';
    END IF;
END
$$;

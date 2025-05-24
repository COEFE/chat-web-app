-- Migration: 039_add_credit_card_journal_types.sql
-- Description: Adds 'CCP' (Credit Card Purchase) and 'CCY' (Credit Card Payment) journal types
-- to the journal_types table for better categorization of credit card transactions.

-- Check if journal_types table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_types'
    ) THEN
        -- Add Credit Card Purchase journal type
        INSERT INTO journal_types (code, name, description)
        VALUES ('CCP', 'Credit Card Purchase', 'For recording credit card purchases and expenses')
        ON CONFLICT (code) DO NOTHING;
        
        -- Add Credit Card Payment journal type
        INSERT INTO journal_types (code, name, description)
        VALUES ('CCY', 'Credit Card Payment', 'For recording payments made to credit card accounts')
        ON CONFLICT (code) DO NOTHING;
        
        RAISE NOTICE 'Credit card journal types added successfully';
    ELSE
        RAISE EXCEPTION 'journal_types table does not exist';
    END IF;
END
$$;

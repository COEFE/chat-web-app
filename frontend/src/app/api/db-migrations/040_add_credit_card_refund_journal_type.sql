-- Migration: 040_add_credit_card_refund_journal_type.sql
-- Description: Adds 'CCR' (Credit Card Refund) journal type
-- to the journal_types table for recording credit card refunds and returns.

-- Check if journal_types table exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_types'
    ) THEN
        -- Add Credit Card Refund journal type
        INSERT INTO journal_types (code, name, description, requires_approval, default_memo, auto_numbering_prefix)
        VALUES (
            'CCR', 
            'Credit Card Refund', 
            'For recording credit card refunds, returns, and chargebacks',
            FALSE,
            'Credit card refund: ',
            'CCR-'
        )
        ON CONFLICT (code) DO NOTHING;
        
        RAISE NOTICE 'Credit Card Refund journal type added successfully';
    ELSE
        RAISE EXCEPTION 'journal_types table does not exist';
    END IF;
END
$$;

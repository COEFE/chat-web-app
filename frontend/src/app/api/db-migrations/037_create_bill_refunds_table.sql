-- Migration: Create bill_refunds table
-- This migration adds a table to track refunds for vendor bills

-- First check if the table already exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bill_refunds') THEN
        -- Create the bill_refunds table
        CREATE TABLE bill_refunds (
            id SERIAL PRIMARY KEY,
            bill_id INTEGER NOT NULL REFERENCES bills(id),
            refund_date DATE NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            refund_account_id INTEGER NOT NULL REFERENCES accounts(id),
            refund_method VARCHAR(50),
            reference_number VARCHAR(100),
            journal_id INTEGER REFERENCES journals(id),
            reason TEXT,
            user_id VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Add indexes for better performance
        CREATE INDEX idx_bill_refunds_bill_id ON bill_refunds(bill_id);
        CREATE INDEX idx_bill_refunds_refund_date ON bill_refunds(refund_date);
        CREATE INDEX idx_bill_refunds_user_id ON bill_refunds(user_id);
        CREATE INDEX idx_bill_refunds_journal_id ON bill_refunds(journal_id);

        -- Add a comment to the table
        COMMENT ON TABLE bill_refunds IS 'Tracks refunds for vendor bills';
    END IF;
END
$$;

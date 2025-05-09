-- Migration: 009_create_bill_payments_table.sql
-- Created at: {{TIMESTAMP}}

BEGIN;

CREATE TABLE IF NOT EXISTS bill_payments (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE RESTRICT, -- Prevent deleting bill if payments exist
    payment_date DATE NOT NULL,
    amount_paid DECIMAL(12, 2) NOT NULL,
    payment_account_id INTEGER NOT NULL REFERENCES accounts(id), -- Account from which payment was made (e.g., Bank, Cash)
    payment_method VARCHAR(100), -- e.g., Check, Card, Transfer, Cash
    reference_number VARCHAR(255), -- e.g., Check number, Transaction ID
    journal_id INTEGER REFERENCES journals(id) ON DELETE SET NULL, -- Link to the journal entry for this payment
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE bill_payments IS 'Stores payment information made against vendor bills.';
COMMENT ON COLUMN bill_payments.id IS 'Unique identifier for the bill payment.';
COMMENT ON COLUMN bill_payments.bill_id IS 'Foreign key referencing the bill that was paid.';
COMMENT ON COLUMN bill_payments.payment_date IS 'Date the payment was made.';
COMMENT ON COLUMN bill_payments.amount_paid IS 'Amount paid in this transaction.';
COMMENT ON COLUMN bill_payments.payment_account_id IS 'Foreign key referencing the account used for payment (e.g., bank account).';
COMMENT ON COLUMN bill_payments.payment_method IS 'Method of payment (e.g., Check, EFT, Credit Card).';
COMMENT ON COLUMN bill_payments.reference_number IS 'Reference for the payment (e.g., check number, transaction ID).';
COMMENT ON COLUMN bill_payments.journal_id IS 'Foreign key referencing the journal entry created for this payment.';
COMMENT ON COLUMN bill_payments.created_at IS 'Timestamp of when the payment record was created.';
COMMENT ON COLUMN bill_payments.updated_at IS 'Timestamp of when the payment record was last updated.';

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_id ON bill_payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_payments_payment_account_id ON bill_payments(payment_account_id);

-- Trigger to update 'updated_at' timestamp on any row modification
-- (Re-using the function created in 006_create_vendors_table.sql)
CREATE TRIGGER set_bill_payments_updated_at
BEFORE UPDATE ON bill_payments
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMIT;

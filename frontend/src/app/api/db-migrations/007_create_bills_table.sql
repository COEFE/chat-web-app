-- Migration: 007_create_bills_table.sql
-- Created at: {{TIMESTAMP}}

BEGIN;

CREATE TABLE IF NOT EXISTS bills (
    id SERIAL PRIMARY KEY,
    vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT, -- Prevent deleting vendor if bills exist
    bill_number VARCHAR(255), -- Vendor's own bill number
    bill_date DATE NOT NULL,
    due_date DATE NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    amount_paid DECIMAL(12, 2) DEFAULT 0.00,
    status VARCHAR(50) NOT NULL DEFAULT 'Draft', -- e.g., Draft, Open, Partially Paid, Paid, Void
    terms VARCHAR(255),
    memo TEXT,
    ap_account_id INTEGER NOT NULL REFERENCES accounts(id), -- AP Control Account from Chart of Accounts
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE bills IS 'Stores vendor bills for accounts payable.';
COMMENT ON COLUMN bills.id IS 'Unique identifier for the bill.';
COMMENT ON COLUMN bills.vendor_id IS 'Foreign key referencing the vendor for this bill.';
COMMENT ON COLUMN bills.bill_number IS 'The bill number provided by the vendor.';
COMMENT ON COLUMN bills.bill_date IS 'Date the bill was issued.';
COMMENT ON COLUMN bills.due_date IS 'Date the bill is due for payment.';
COMMENT ON COLUMN bills.total_amount IS 'Total amount of the bill.';
COMMENT ON COLUMN bills.amount_paid IS 'Amount of the bill that has been paid so far.';
COMMENT ON COLUMN bills.status IS 'Current status of the bill (e.g., Draft, Open, Partially Paid, Paid, Void).';
COMMENT ON COLUMN bills.terms IS 'Payment terms for the bill (e.g., Net 30).';
COMMENT ON COLUMN bills.memo IS 'Internal memo or notes about the bill.';
COMMENT ON COLUMN bills.ap_account_id IS 'The Accounts Payable (liability) account associated with this bill.';
COMMENT ON COLUMN bills.created_at IS 'Timestamp of when the bill was created in the system.';
COMMENT ON COLUMN bills.updated_at IS 'Timestamp of when the bill was last updated.';
COMMENT ON COLUMN bills.is_deleted IS 'Flag to indicate if the bill has been soft-deleted/voided.';
COMMENT ON COLUMN bills.deleted_at IS 'Timestamp of when the bill was soft-deleted/voided.';

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_bills_vendor_id ON bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);

-- Trigger to update 'updated_at' timestamp on any row modification
-- (Re-using the function created in 006_create_vendors_table.sql)
CREATE TRIGGER set_bills_updated_at
BEFORE UPDATE ON bills
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMIT;

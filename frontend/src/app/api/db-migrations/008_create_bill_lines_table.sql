-- Migration: 008_create_bill_lines_table.sql
-- Created at: {{TIMESTAMP}}

BEGIN;

CREATE TABLE IF NOT EXISTS bill_lines (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE, -- If a bill is deleted, its lines are also deleted
    expense_account_id INTEGER NOT NULL REFERENCES accounts(id), -- The expense account to debit
    description TEXT,
    quantity DECIMAL(10, 2) DEFAULT 1.00,
    unit_price DECIMAL(10, 2) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL, -- Should be (quantity * unit_price)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE bill_lines IS 'Stores individual line items for each vendor bill.';
COMMENT ON COLUMN bill_lines.id IS 'Unique identifier for the bill line item.';
COMMENT ON COLUMN bill_lines.bill_id IS 'Foreign key referencing the bill this line item belongs to.';
COMMENT ON COLUMN bill_lines.expense_account_id IS 'Foreign key referencing the expense account related to this line item.';
COMMENT ON COLUMN bill_lines.description IS 'Description of the product or service for this line item.';
COMMENT ON COLUMN bill_lines.quantity IS 'Quantity of the product or service.';
COMMENT ON COLUMN bill_lines.unit_price IS 'Unit price of the product or service.';
COMMENT ON COLUMN bill_lines.amount IS 'Total amount for this line item (quantity * unit_price).';
COMMENT ON COLUMN bill_lines.created_at IS 'Timestamp of when the bill line item was created.';
COMMENT ON COLUMN bill_lines.updated_at IS 'Timestamp of when the bill line item was last updated.';

-- Constraint to ensure amount is correctly calculated (optional, can be handled by application logic)
-- ALTER TABLE bill_lines ADD CONSTRAINT chk_amount_calculation CHECK (amount = quantity * unit_price);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS idx_bill_lines_bill_id ON bill_lines(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_lines_expense_account_id ON bill_lines(expense_account_id);

-- Trigger to update 'updated_at' timestamp on any row modification
-- (Re-using the function created in 006_create_vendors_table.sql)
CREATE TRIGGER set_bill_lines_updated_at
BEFORE UPDATE ON bill_lines
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMIT;

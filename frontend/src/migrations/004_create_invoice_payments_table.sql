-- Create invoice_payments table for Accounts Receivable
CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount_received DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  deposit_to_account_id INTEGER NOT NULL REFERENCES accounts(id),
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  journal_id INTEGER REFERENCES journals(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date ON invoice_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_journal_id ON invoice_payments(journal_id);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_payment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_payment_timestamp
BEFORE UPDATE ON invoice_payments
FOR EACH ROW
EXECUTE PROCEDURE update_invoice_payment_timestamp();

-- Add trigger to update invoice amount_paid and status when payment is added/updated/deleted
CREATE OR REPLACE FUNCTION update_invoice_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
    total_paid DECIMAL(12, 2);
    invoice_total DECIMAL(12, 2);
    new_status VARCHAR(50);
BEGIN
    -- If deleting a payment, we need to use the OLD invoice_id
    IF TG_OP = 'DELETE' THEN
        -- Calculate total payments for this invoice
        SELECT COALESCE(SUM(amount_received), 0) INTO total_paid
        FROM invoice_payments
        WHERE invoice_id = OLD.invoice_id;
        
        -- Get invoice total
        SELECT total_amount INTO invoice_total
        FROM invoices
        WHERE id = OLD.invoice_id;
    ELSE
        -- Calculate total payments for this invoice
        SELECT COALESCE(SUM(amount_received), 0) INTO total_paid
        FROM invoice_payments
        WHERE invoice_id = NEW.invoice_id;
        
        -- Get invoice total
        SELECT total_amount INTO invoice_total
        FROM invoices
        WHERE id = NEW.invoice_id;
    END IF;
    
    -- Determine new status based on payment amount
    IF total_paid >= invoice_total THEN
        new_status := 'Paid';
    ELSIF total_paid > 0 THEN
        new_status := 'Partially Paid';
    ELSE
        -- Keep current status if no payments
        SELECT status INTO new_status
        FROM invoices
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    END IF;
    
    -- Update invoice
    UPDATE invoices
    SET 
        amount_paid = total_paid,
        status = new_status,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_payment_totals
AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
FOR EACH ROW
EXECUTE PROCEDURE update_invoice_payment_totals();

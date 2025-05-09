-- Create invoice_lines table for Accounts Receivable
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_or_service_id INTEGER, -- For future product/service catalog integration
  revenue_account_id INTEGER NOT NULL REFERENCES accounts(id),
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_revenue_account_id ON invoice_lines(revenue_account_id);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_line_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_line_timestamp
BEFORE UPDATE ON invoice_lines
FOR EACH ROW
EXECUTE PROCEDURE update_invoice_line_timestamp();

-- Add trigger to calculate amount from quantity and unit_price
CREATE OR REPLACE FUNCTION calculate_invoice_line_amount()
RETURNS TRIGGER AS $$
BEGIN
   NEW.amount = NEW.quantity * NEW.unit_price;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_invoice_line_amount
BEFORE INSERT OR UPDATE ON invoice_lines
FOR EACH ROW
EXECUTE PROCEDURE calculate_invoice_line_amount();

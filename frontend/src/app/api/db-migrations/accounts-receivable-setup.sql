-- Accounts Receivable Database Setup

-- Create customers table for Accounts Receivable
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  billing_address TEXT,
  shipping_address TEXT,
  default_revenue_account_id INTEGER REFERENCES accounts(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_is_deleted ON customers(is_deleted);

-- Add trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customer_timestamp ON customers;
CREATE TRIGGER update_customer_timestamp
BEFORE UPDATE ON customers
FOR EACH ROW
EXECUTE PROCEDURE update_customer_timestamp();

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  customer_name VARCHAR(255) NOT NULL,
  invoice_number VARCHAR(50),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  terms VARCHAR(100),
  memo_to_customer TEXT,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Draft',
  ar_account_id INTEGER NOT NULL REFERENCES accounts(id),
  ar_account_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_is_deleted ON invoices(is_deleted);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);

-- Add trigger for invoices updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invoice_timestamp ON invoices;
CREATE TRIGGER update_invoice_timestamp
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE PROCEDURE update_invoice_timestamp();

-- Create invoice lines table
CREATE TABLE IF NOT EXISTS invoice_lines (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  revenue_account_id INTEGER NOT NULL REFERENCES accounts(id),
  revenue_account_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for invoice lines
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

-- Add trigger for invoice_lines updated_at timestamp
CREATE OR REPLACE FUNCTION update_invoice_line_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = CURRENT_TIMESTAMP;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invoice_line_timestamp ON invoice_lines;
CREATE TRIGGER update_invoice_line_timestamp
BEFORE UPDATE ON invoice_lines
FOR EACH ROW
EXECUTE PROCEDURE update_invoice_line_timestamp();

-- Create invoice payments table
CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount_received DECIMAL(15, 2) NOT NULL,
  deposit_to_account_id INTEGER NOT NULL REFERENCES accounts(id),
  deposit_account_name VARCHAR(255) NOT NULL,
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  journal_id INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for invoice payments
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_payment_date ON invoice_payments(payment_date);

-- Add trigger to update invoice status and amount_paid when payment is recorded
CREATE OR REPLACE FUNCTION update_invoice_after_payment()
RETURNS TRIGGER AS $$
DECLARE
  total_paid DECIMAL(15, 2);
  invoice_total DECIMAL(15, 2);
BEGIN
  -- Calculate new total paid amount
  SELECT COALESCE(SUM(amount_received), 0) INTO total_paid
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id;
  
  -- Get invoice total amount
  SELECT total_amount INTO invoice_total
  FROM invoices
  WHERE id = NEW.invoice_id;
  
  -- Update invoice amount_paid
  UPDATE invoices
  SET 
    amount_paid = total_paid,
    status = CASE
      WHEN total_paid >= invoice_total THEN 'Paid'
      WHEN total_paid > 0 THEN 'Partially Paid'
      ELSE status
    END
  WHERE id = NEW.invoice_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invoice_after_payment ON invoice_payments;
CREATE TRIGGER update_invoice_after_payment
AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_after_payment();

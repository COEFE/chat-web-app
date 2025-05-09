-- Migration: 006_create_vendors_table.sql
-- Created at: {{TIMESTAMP}}

BEGIN;

CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,
    default_expense_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL, -- Allow setting default expense account
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE vendors IS 'Stores vendor information for accounts payable.';
COMMENT ON COLUMN vendors.id IS 'Unique identifier for the vendor.';
COMMENT ON COLUMN vendors.name IS 'Name of the vendor.';
COMMENT ON COLUMN vendors.contact_person IS 'Primary contact person at the vendor.';
COMMENT ON COLUMN vendors.email IS 'Email address of the vendor.';
COMMENT ON COLUMN vendors.phone IS 'Phone number of the vendor.';
COMMENT ON COLUMN vendors.address IS 'Physical or mailing address of the vendor.';
COMMENT ON COLUMN vendors.default_expense_account_id IS 'Default expense account to be used when creating bills for this vendor.';
COMMENT ON COLUMN vendors.created_at IS 'Timestamp of when the vendor was created.';
COMMENT ON COLUMN vendors.updated_at IS 'Timestamp of when the vendor was last updated.';
COMMENT ON COLUMN vendors.is_deleted IS 'Flag to indicate if the vendor has been soft-deleted.';
COMMENT ON COLUMN vendors.deleted_at IS 'Timestamp of when the vendor was soft-deleted.';

-- Trigger to update 'updated_at' timestamp on any row modification
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

COMMIT;

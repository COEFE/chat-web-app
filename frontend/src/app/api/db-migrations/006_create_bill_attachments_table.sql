-- Create bill_attachments table for storing bill attachment metadata
-- This follows the same pattern as journal_attachments

CREATE TABLE IF NOT EXISTS bill_attachments (
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_path TEXT,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by VARCHAR(255),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_bill_attachments_bill_id ON bill_attachments(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_by ON bill_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_bill_attachments_uploaded_at ON bill_attachments(uploaded_at);

-- Add comment for documentation
COMMENT ON TABLE bill_attachments IS 'Stores metadata for files attached to bills (receipts, invoices, supporting documents)';
COMMENT ON COLUMN bill_attachments.bill_id IS 'References the bills table';
COMMENT ON COLUMN bill_attachments.file_url IS 'URL for accessing the file (typically a proxy URL)';
COMMENT ON COLUMN bill_attachments.file_path IS 'Storage path in Firebase Storage';
COMMENT ON COLUMN bill_attachments.uploaded_by IS 'User ID who uploaded the attachment';

-- Migration: 005_create_journal_attachments_table.sql
-- Description: Creates the journal_attachments table for storing references to journal entry attachments.
-- Date: 2025-05-07

BEGIN;

CREATE TABLE IF NOT EXISTS journal_attachments (
    id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_path VARCHAR(1024) NOT NULL, -- e.g., S3 bucket/key or local path
    uploaded_by VARCHAR(255), -- User ID or name
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_journal_attachments_journal_id FOREIGN KEY (journal_id)
        REFERENCES journals(id) ON DELETE CASCADE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_journal_attachments_journal_id ON journal_attachments(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_attachments_file_name ON journal_attachments(file_name);

-- Comments for documentation
COMMENT ON TABLE journal_attachments IS 'Stores metadata and storage paths for files attached to journal entries.';
COMMENT ON COLUMN journal_attachments.storage_path IS 'The path or key where the file is stored (e.g., an S3 URL or a local file system path).';

COMMIT;

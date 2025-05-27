-- Migration: 005_create_journal_attachments_table.sql
-- Description: Creates the journal_attachments table for storing references to journal entry attachments.
-- Date: 2025-05-07

BEGIN;

CREATE TABLE IF NOT EXISTS journal_attachments (
    id SERIAL PRIMARY KEY,
    journal_id INTEGER NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size INTEGER,
    uploaded_by VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_journal_attachments_journal_id FOREIGN KEY (journal_id)
        REFERENCES journals(id) ON DELETE CASCADE
);

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_journal_attachments_journal_id ON journal_attachments(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_attachments_file_name ON journal_attachments(file_name);

-- Ensure legacy installations have file_path column (for compatibility)
ALTER TABLE journal_attachments ADD COLUMN IF NOT EXISTS file_path TEXT;

-- Comments for documentation
COMMENT ON TABLE journal_attachments IS 'Stores metadata and storage paths for files attached to journal entries.';
COMMENT ON COLUMN journal_attachments.file_path IS 'The path or key where the file is stored (e.g., Firebase Storage path).';

COMMIT;

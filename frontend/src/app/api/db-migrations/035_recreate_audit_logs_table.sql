-- New migration to ensure audit_logs table creation
-- This table will store detailed information about user actions for accountability and traceability

-- Drop existing table if it exists but is not properly set up
DROP TABLE IF EXISTS audit_logs;

-- Create audit_logs table
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  user_id VARCHAR(255),
  user_name VARCHAR(255),
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(100),
  changes_made JSONB,
  source_ip VARCHAR(50),
  status VARCHAR(20) NOT NULL,
  error_details TEXT,
  context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);

-- Full text search index on changes_made and context
CREATE INDEX IF NOT EXISTS idx_audit_logs_changes_made ON audit_logs USING GIN (changes_made);
CREATE INDEX IF NOT EXISTS idx_audit_logs_context ON audit_logs USING GIN (context);

-- Create migrations table if it doesn't exist
CREATE TABLE IF NOT EXISTS db_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applied_by VARCHAR(255)
);

-- Check if migration has already been recorded
DO $$
DECLARE
  migration_exists BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM db_migrations 
    WHERE filename = '035_recreate_audit_logs_table.sql'
  ) INTO migration_exists;
  
  IF NOT migration_exists THEN
    -- Record this migration
    INSERT INTO db_migrations (filename, applied_by)
    VALUES ('035_recreate_audit_logs_table.sql', 'system');
  END IF;
END$$;

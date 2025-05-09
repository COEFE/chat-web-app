-- Migration to create audit_logs table for storing application audit trails
-- This table will store detailed information about user actions for accountability and traceability

-- Check if the table exists before creating it
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_logs') THEN
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
    CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
    CREATE INDEX idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
    
    -- Full text search index on changes_made and context
    CREATE INDEX idx_audit_logs_changes_made ON audit_logs USING GIN (changes_made);
    CREATE INDEX idx_audit_logs_context ON audit_logs USING GIN (context);

    RAISE NOTICE 'Created audit_logs table and associated indexes';
  ELSE
    RAISE NOTICE 'audit_logs table already exists, skipping creation';
  END IF;
END
$$;

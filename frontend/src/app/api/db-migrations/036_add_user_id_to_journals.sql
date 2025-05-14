-- 036_add_user_id_to_journals.sql
-- CRITICAL SECURITY UPDATE: Adds user_id column to journals table for proper data isolation between user accounts

-- Check if user_id column already exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journals' AND column_name = 'user_id'
  ) THEN
    -- Add user_id column to journals table (nullable at first)
    ALTER TABLE journals 
    ADD COLUMN user_id VARCHAR(128) NULL;
    
    -- Create index on user_id for better query performance
    CREATE INDEX idx_journals_user_id ON journals(user_id);
    
    -- Log the migration
    RAISE NOTICE 'Added user_id column to journals table and created index';
    
    -- NOTE: After running this migration, you need to associate existing journals with users
    -- This can be done by running the API endpoint: POST /api/journals/add-user-id-column
    -- which will update existing journals and add the NOT NULL constraint
    
    RAISE NOTICE 'IMPORTANT: After this migration completes, run the API endpoint POST /api/journals/add-user-id-column to associate existing journals with users';
  ELSE
    RAISE NOTICE 'user_id column already exists in journals table';
  END IF;
END $$;

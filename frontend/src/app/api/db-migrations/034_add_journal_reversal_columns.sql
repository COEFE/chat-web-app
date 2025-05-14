-- Add columns for journal reversal relationships
DO $$
BEGIN
  -- Add reversal_of_journal_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'journals' AND column_name = 'reversal_of_journal_id'
  ) THEN
    ALTER TABLE journals ADD COLUMN reversal_of_journal_id INTEGER REFERENCES journals(id);
  END IF;

  -- Add reversed_by_journal_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_name = 'journals' AND column_name = 'reversed_by_journal_id'
  ) THEN
    ALTER TABLE journals ADD COLUMN reversed_by_journal_id INTEGER REFERENCES journals(id);
  END IF;
  
  -- Log the migration
  RAISE NOTICE 'Migration completed: Added journal reversal relationship columns';
END
$$;

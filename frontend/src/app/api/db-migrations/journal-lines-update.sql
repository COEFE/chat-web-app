-- Migration to update the journal_lines table with a line_number column

-- Add line_number column to journal_lines if it doesn't exist
DO $$
BEGIN
  -- Add line_number column
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_lines' AND column_name = 'line_number') THEN
    ALTER TABLE journal_lines ADD COLUMN line_number INTEGER DEFAULT 0;
  END IF;
END $$;

-- Create index on line_number for faster ordering
CREATE INDEX IF NOT EXISTS idx_journal_lines_number ON journal_lines(journal_id, line_number);

-- Update existing journal_lines to have sequential line numbers if they don't have them
DO $$
DECLARE
  j_record RECORD;
  line_count INTEGER;
BEGIN
  -- Loop through all journals
  FOR j_record IN SELECT DISTINCT journal_id FROM journal_lines ORDER BY journal_id
  LOOP
    line_count := 0;
    
    -- Update line numbers for each journal sequentially
    UPDATE journal_lines
    SET line_number = subquery.new_line_number
    FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) as new_line_number
      FROM journal_lines
      WHERE journal_id = j_record.journal_id
    ) as subquery
    WHERE journal_lines.id = subquery.id AND (journal_lines.line_number IS NULL OR journal_lines.line_number = 0);
  END LOOP;
END $$;

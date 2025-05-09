-- Migration to add category, location, vendor, and funder fields to journal_lines
-- Execute with caution in production environments

-- Add the new fields if they don't exist
DO $$
BEGIN
  -- Add category field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_lines' AND column_name = 'category') THEN
    ALTER TABLE journal_lines ADD COLUMN category TEXT;
  END IF;

  -- Add location field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_lines' AND column_name = 'location') THEN
    ALTER TABLE journal_lines ADD COLUMN location TEXT;
  END IF;

  -- Add vendor field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_lines' AND column_name = 'vendor') THEN
    ALTER TABLE journal_lines ADD COLUMN vendor TEXT;
  END IF;

  -- Add funder field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'journal_lines' AND column_name = 'funder') THEN
    ALTER TABLE journal_lines ADD COLUMN funder TEXT;
  END IF;

  -- Create indexes for faster searches on these fields
  CREATE INDEX IF NOT EXISTS idx_journal_lines_category ON journal_lines(category);
  CREATE INDEX IF NOT EXISTS idx_journal_lines_vendor ON journal_lines(vendor);
  
  -- Log the changes
  RAISE NOTICE 'Journal lines table updated with category, location, vendor, and funder fields';
END$$;

-- Update the embedding generation function to include the new fields when generating embeddings
CREATE OR REPLACE FUNCTION generate_journal_line_text(
  p_description TEXT,
  p_account_name TEXT,
  p_debit NUMERIC,
  p_credit NUMERIC,
  p_category TEXT,
  p_location TEXT,
  p_vendor TEXT,
  p_funder TEXT
) RETURNS TEXT AS $$
BEGIN
  RETURN CONCAT_WS(' ', 
    COALESCE(p_description, ''),
    COALESCE(p_account_name, ''),
    'Debit: ' || COALESCE(p_debit, 0)::TEXT,
    'Credit: ' || COALESCE(p_credit, 0)::TEXT,
    CASE WHEN p_category IS NOT NULL THEN 'Category: ' || p_category ELSE '' END,
    CASE WHEN p_location IS NOT NULL THEN 'Location: ' || p_location ELSE '' END,
    CASE WHEN p_vendor IS NOT NULL THEN 'Vendor: ' || p_vendor ELSE '' END,
    CASE WHEN p_funder IS NOT NULL THEN 'Funder: ' || p_funder ELSE '' END
  );
END;
$$ LANGUAGE plpgsql;

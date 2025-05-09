-- Migration: 022_add_fields_to_bill_lines.sql
-- Add category, location, vendor, and funder fields to bill_lines table
-- Created at: 2025-05-08

BEGIN;

-- Add the new fields if they don't exist
DO $$
BEGIN
  -- Add category field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bill_lines' AND column_name = 'category') THEN
    ALTER TABLE bill_lines ADD COLUMN category TEXT;
  END IF;

  -- Add location field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bill_lines' AND column_name = 'location') THEN
    ALTER TABLE bill_lines ADD COLUMN location TEXT;
  END IF;

  -- Add vendor field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bill_lines' AND column_name = 'vendor') THEN
    ALTER TABLE bill_lines ADD COLUMN vendor TEXT;
  END IF;

  -- Add funder field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'bill_lines' AND column_name = 'funder') THEN
    ALTER TABLE bill_lines ADD COLUMN funder TEXT;
  END IF;

  -- Create indexes for faster searches on these fields
  CREATE INDEX IF NOT EXISTS idx_bill_lines_category ON bill_lines(category);
  CREATE INDEX IF NOT EXISTS idx_bill_lines_vendor ON bill_lines(vendor);
  
  -- Log the changes
  RAISE NOTICE 'Bill lines table updated with category, location, vendor, and funder fields';
END$$;

-- Add comments for the new columns
COMMENT ON COLUMN bill_lines.category IS 'Optional category classification for this line item.';
COMMENT ON COLUMN bill_lines.location IS 'Optional location associated with this line item.';
COMMENT ON COLUMN bill_lines.vendor IS 'Optional specific vendor associated with this line item (may differ from the bill vendor).';
COMMENT ON COLUMN bill_lines.funder IS 'Optional funding source or grant associated with this line item.';

COMMIT;

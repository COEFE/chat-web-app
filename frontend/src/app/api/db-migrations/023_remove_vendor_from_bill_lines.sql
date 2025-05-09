-- Migration: 023_remove_vendor_from_bill_lines.sql
-- Remove vendor field from bill_lines table since it's redundant with the bill's vendor_id

DO $$
BEGIN
  -- Drop the index first
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE indexname = 'idx_bill_lines_vendor'
  ) THEN
    DROP INDEX idx_bill_lines_vendor;
  END IF;

  -- Drop the column
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'bill_lines' AND column_name = 'vendor'
  ) THEN
    ALTER TABLE bill_lines DROP COLUMN vendor;
  END IF;
END $$;

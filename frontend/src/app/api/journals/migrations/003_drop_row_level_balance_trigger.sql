-- Migration: 003_drop_row_level_balance_trigger.sql
-- Description: Remove row-level balance trigger that conflicts with statement-level trigger
-- Date: 2025-05-05

BEGIN;

-- Drop the older row-level trigger (fires for each row) that causes false imbalance errors
DROP TRIGGER IF EXISTS ensure_journal_balanced ON journal_lines;

-- Drop the corresponding function as it is no longer needed
DROP FUNCTION IF EXISTS check_journal_balanced();

COMMIT;

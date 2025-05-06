-- Migration: 002_statement_level_trigger.sql
-- Description: Replace row-level journal balance trigger with statement-level trigger
-- Date: 2025-05-04

BEGIN;

-- Drop existing row-level trigger if it exists
DROP TRIGGER IF EXISTS journal_balance_chk ON journal_lines;

-- Re-create as statement-level trigger
CREATE TRIGGER journal_balance_chk
AFTER INSERT OR UPDATE ON journal_lines
FOR EACH STATEMENT
EXECUTE FUNCTION ensure_journal_balances();

COMMIT;

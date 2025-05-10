-- Migration: 027_fix_journal_balance_trigger.sql
-- Description: Convert journal balance trigger to a deferrable constraint trigger
-- so that the balance check runs only once per transaction, after all lines for
-- a journal entry have been inserted or updated. This prevents false positives
-- when multi-line journals are saved one row at a time.

BEGIN;

-- Remove the existing (row-level, non-deferrable) trigger if it exists
DROP TRIGGER IF EXISTS ensure_journal_balanced ON journal_lines;

-- Re-create the trigger as a CONSTRAINT trigger that fires once per affected
-- row but is DEFERRABLE INITIALLY DEFERRED, meaning it will run at COMMIT time
-- instead of immediately after each row insert/update.  The existing
-- check_journal_balanced() function is reused.

CREATE CONSTRAINT TRIGGER ensure_journal_balanced
AFTER INSERT OR UPDATE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_balanced();

COMMIT;

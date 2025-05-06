-- Migration: 001_journal_balance_constraints.sql
-- Description: Adds constraints to ensure journal entries remain balanced
-- Date: 2025-05-04

-- Start with a clean slate
BEGIN;
-- First, drop any existing triggers and functions
DROP TRIGGER IF EXISTS check_journal_balance_trigger ON journal_lines;
DROP TRIGGER IF EXISTS journal_balance_chk ON journal_lines;
DROP FUNCTION IF EXISTS check_journal_balance();
DROP FUNCTION IF EXISTS ensure_journal_balances();
COMMIT;

-- Transaction 2: Create the balance check function
BEGIN;
-- Create a clean, statement-level function to check journal balance
CREATE OR REPLACE FUNCTION ensure_journal_balances()
RETURNS TRIGGER AS $$
DECLARE
  diff NUMERIC;
  journal_id_val INTEGER;
BEGIN
  -- Get the journal_id from the modified row
  journal_id_val := NEW.journal_id;
  
  -- Calculate the difference between debits and credits
  SELECT COALESCE(SUM(debit) - SUM(credit), 0)
    INTO diff
    FROM journal_lines
   WHERE journal_id = journal_id_val;

  -- If difference is not zero (allowing for small rounding errors)
  IF ABS(diff) > 0.01 THEN
    -- Get the actual totals for better error messages
    DECLARE
      total_debits NUMERIC;
      total_credits NUMERIC;
    BEGIN
      SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO total_debits, total_credits
        FROM journal_lines
       WHERE journal_id = journal_id_val;
       
      RAISE EXCEPTION 'Journal #% is out of balance: debits (%.2f) must equal credits (%.2f)',
        journal_id_val, total_debits, total_credits;
    END;
  END IF;

  RETURN NULL; -- Statement-level trigger ignores the result
END;
$$ LANGUAGE plpgsql;
COMMIT;

-- Transaction 3: Fix existing data
BEGIN;
-- Fix lines with both debit and credit values
UPDATE journal_lines
SET credit = 0
WHERE debit > 0 AND credit > 0;

-- Fix lines with negative values
UPDATE journal_lines
SET debit = ABS(debit), credit = ABS(credit);

-- Fix lines with both debit and credit equal to zero
DELETE FROM journal_lines
WHERE debit = 0 AND credit = 0;
COMMIT;

-- Transaction 4: Add column constraints
BEGIN;
-- Now add column-level constraints for additional data integrity
-- Ensure amounts are non-negative
ALTER TABLE journal_lines ADD CONSTRAINT chk_positive_amounts
  CHECK (debit >= 0 AND credit >= 0);

-- Ensure each line is one-sided (either debit or credit, not both)
ALTER TABLE journal_lines ADD CONSTRAINT chk_one_sided
  CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0));
COMMIT;

-- Transaction 5: Add trigger and documentation
BEGIN;
-- Create the deferred constraint trigger
CREATE CONSTRAINT TRIGGER journal_balance_chk
AFTER INSERT OR UPDATE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION ensure_journal_balances();

-- Add comment to document the constraints
COMMENT ON CONSTRAINT journal_balance_chk ON journal_lines IS 
  'Ensures that for each journal entry, the sum of debits equals the sum of credits';
COMMENT ON CONSTRAINT chk_positive_amounts ON journal_lines IS
  'Ensures that debit and credit amounts are always non-negative';
COMMENT ON CONSTRAINT chk_one_sided ON journal_lines IS
  'Ensures that each journal line has either a debit or a credit, but not both';
COMMIT;

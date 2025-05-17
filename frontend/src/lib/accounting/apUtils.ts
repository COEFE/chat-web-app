import { sql } from '@vercel/postgres';
import { BillPayment, BillWithVendor } from './accountingTypes';

/**
 * Creates a journal entry for a bill payment using direct SQL.
 * This function handles its own database transaction.
 * @param payment - The bill payment object.
 * @param bill - The bill object with vendor information.
 * @param userId - The ID of the user performing the action.
 * @returns The ID of the created journal entry, or null if an error occurred.
 */
export async function createJournalEntryForBillPaymentSQL(
  payment: BillPayment,
  bill: BillWithVendor,
  userId: string
): Promise<number | null> {
  const journalMemo = `Payment for Bill ${bill.bill_number || bill.id} to ${bill.vendor_name || 'vendor'}`;
  const debitDescription = `Payment to ${bill.vendor_name || 'vendor'} for bill #${bill.bill_number || bill.id}`;
  const creditDescription = payment.reference_number
    ? `Ref: ${payment.reference_number}`
    : `Payment for Bill ${bill.bill_number || bill.id}`;
  
  // Ensure amount_paid is treated as a number and rounded
  const amountPaidNum = Math.round(Number(payment.amount_paid) * 100) / 100;

  if (isNaN(amountPaidNum) || amountPaidNum <= 0) {
    console.error('[apUtils.createJournalEntryForBillPaymentSQL] Invalid amount_paid:', payment.amount_paid);
    return null;
  }

  if (!bill.ap_account_id) {
    console.error('[apUtils.createJournalEntryForBillPaymentSQL] Missing AP account ID in bill:', bill);
    return null;
  }

  if (!payment.payment_account_id) {
    console.error('[apUtils.createJournalEntryForBillPaymentSQL] Missing payment account ID in payment:', payment);
    return null;
  }

  const client = await sql.connect();
  try {
    await client.query('BEGIN');

    const schemaCheck = await client.query(`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
    `);
    const journalSchema = schemaCheck.rows[0];
    const dateColumnName = journalSchema.has_transaction_date ? 'transaction_date' : 'date';

    const journalResult = await client.query(
      `INSERT INTO journals 
        (${dateColumnName}, memo, source, journal_type, is_posted, created_by, user_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [payment.payment_date, journalMemo, 'AP', 'BP', true, userId, userId]
    );
    const journalId = journalResult.rows[0].id;

    const lineNumberCheck = await client.query(`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journal_lines' AND column_name = 'line_number') as has_line_number
    `);
    const hasLineNumber = lineNumberCheck.rows[0].has_line_number;

    let lineQuery, lineValues;
    if (hasLineNumber) {
      lineQuery = `INSERT INTO journal_lines (journal_id, line_number, account_id, description, debit, credit, user_id) VALUES ($1, 1, $2, $3, $4, 0, $5), ($1, 2, $6, $7, 0, $8, $5) RETURNING id`;
      lineValues = [journalId, bill.ap_account_id, debitDescription, amountPaidNum, userId, payment.payment_account_id, creditDescription, amountPaidNum];
    } else {
      lineQuery = `INSERT INTO journal_lines (journal_id, account_id, description, debit, credit, user_id) VALUES ($1, $2, $3, $4, 0, $5), ($1, $6, $7, 0, $8, $5) RETURNING id`;
      lineValues = [journalId, bill.ap_account_id, debitDescription, amountPaidNum, userId, payment.payment_account_id, creditDescription, amountPaidNum];
    }
    await client.query(lineQuery, lineValues);
    
    await client.query('COMMIT');
    console.log(`[apUtils.createJournalEntryForBillPaymentSQL] Journal ${journalId} created successfully for bill payment.`);
    return journalId;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[apUtils.createJournalEntryForBillPaymentSQL] Error creating journal entry:', error);
    return null;
  } finally {
    client.release();
  }
}

import { sql } from '@vercel/postgres';

/**
 * Checks which date column exists in the journals table
 * @returns The name of the date column ('transaction_date' or 'date')
 */
export async function getJournalDateColumn() {
  try {
    const { rows } = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
    `;
    const schema = rows[0];
    return schema.has_transaction_date ? 'transaction_date' : 'date';
  } catch (error) {
    console.error('Error checking journal date column:', error);
    // Default to transaction_date if there's an error
    return 'transaction_date';
  }
}

/**
 * Checks the schema of the journals table to determine what columns exist
 * @returns Object with boolean flags for various columns
 */
export async function checkJournalSchema() {
  try {
    const { rows } = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_types') as has_journal_types_table
    `;
    return rows[0];
  } catch (error) {
    console.error('Error checking journal schema:', error);
    return {
      has_transaction_date: true,
      has_journal_number: false,
      has_journal_type: true,
      has_date: false,
      has_journal_types_table: false
    };
  }
}

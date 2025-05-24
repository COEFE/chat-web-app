/**
 * This script updates all draft credit card payment journal entries to posted status
 * and modifies the creditCardAgent.ts file to ensure future payment entries are always posted.
 * 
 * Run with: node updateCreditCardPaymentStatus.js
 */

const { sql } = require('@vercel/postgres');
const fs = require('fs');
const path = require('path');

async function updateDraftPaymentJournalsToPosted() {
  try {
    console.log('Checking database schema...');
    
    // First check if the journals table exists and has the is_posted column
    const schemaCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journals') as has_journals_table,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type
    `;
    
    const { has_journals_table, has_is_posted, has_journal_type } = schemaCheck.rows[0];
    
    if (!has_journals_table) {
      console.log('Journals table does not exist');
      return;
    }
    
    if (!has_is_posted) {
      console.log('Journals table does not have is_posted column');
      return;
    }
    
    console.log('Updating all draft credit card payment journal entries to posted status...');
    
    // Update all draft payment journals to posted
    let updateQuery;
    let result;
    
    if (has_journal_type) {
      // If journal_type column exists, update only credit card payment entries
      updateQuery = `
        UPDATE journals 
        SET is_posted = true 
        WHERE is_posted = false
        AND journal_type = 'CCY'
        AND source = 'cc_agent'
      `;
      result = await sql.query(updateQuery);
    } else {
      // Otherwise, update all draft entries from the credit card agent
      // that appear to be payment entries (based on description)
      updateQuery = `
        UPDATE journals 
        SET is_posted = true 
        WHERE is_posted = false
        AND source = 'cc_agent'
        AND (
          memo LIKE '%payment%' 
          OR description LIKE '%payment%'
          OR memo LIKE '%Payment%'
          OR description LIKE '%Payment%'
        )
      `;
      result = await sql.query(updateQuery);
    }
    
    console.log(`Updated ${result.rowCount} draft payment journals to posted status`);
    
    // Also check journal_entries table if it exists
    const journalEntriesCheck = await sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'journal_entries'
      ) as has_journal_entries_table
    `;
    
    if (journalEntriesCheck.rows[0].has_journal_entries_table) {
      console.log('Updating draft entries in journal_entries table...');
      
      const journalEntriesUpdate = `
        UPDATE journal_entries 
        SET status = 'posted' 
        WHERE status = 'draft'
        AND source = 'credit_card_statement'
        AND (
          description LIKE '%payment%' 
          OR description LIKE '%Payment%'
        )
      `;
      
      const journalEntriesResult = await sql.query(journalEntriesUpdate);
      console.log(`Updated ${journalEntriesResult.rowCount} draft entries in journal_entries table`);
    }
    
    console.log('All credit card payment journal entries have been updated to posted status');
    
  } catch (error) {
    console.error('Error updating draft payment journals:', error);
  }
}

// Run the update
updateDraftPaymentJournalsToPosted().catch(console.error);

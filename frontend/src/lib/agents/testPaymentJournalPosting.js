/**
 * Test script to verify that payment journal entries are being created with posted status
 */

const { sql } = require('@vercel/postgres');

async function testPaymentJournalPosting() {
  try {
    console.log('Testing payment journal posting...');
    
    // Check if we have any recent payment journal entries
    const recentPayments = await sql`
      SELECT 
        id,
        date,
        memo,
        journal_type,
        is_posted,
        source,
        created_at
      FROM journals 
      WHERE source IN ('credit_card_statement', 'cc_agent')
      AND (memo LIKE '%Payment%' OR journal_type = 'CCY')
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    console.log('\n=== Recent Payment Journal Entries ===');
    if (recentPayments.rows.length === 0) {
      console.log('No recent payment journal entries found.');
    } else {
      recentPayments.rows.forEach((entry, index) => {
        console.log(`${index + 1}. ID: ${entry.id}`);
        console.log(`   Date: ${entry.date}`);
        console.log(`   Memo: ${entry.memo}`);
        console.log(`   Journal Type: ${entry.journal_type}`);
        console.log(`   Is Posted: ${entry.is_posted} ${entry.is_posted ? '✅' : '❌'}`);
        console.log(`   Source: ${entry.source}`);
        console.log(`   Created: ${entry.created_at}`);
        console.log('');
      });
    }
    
    // Check for any draft payment entries that shouldn't exist
    const draftPayments = await sql`
      SELECT COUNT(*) as count
      FROM journals 
      WHERE source IN ('credit_card_statement', 'cc_agent')
      AND is_posted = false
      AND (memo LIKE '%Payment%' OR journal_type = 'CCY')
    `;
    
    const draftCount = draftPayments.rows[0].count;
    console.log(`\n=== Draft Payment Entries Check ===`);
    console.log(`Draft payment entries found: ${draftCount}`);
    
    if (draftCount > 0) {
      console.log('❌ WARNING: Found draft payment entries that should be posted!');
      
      // Show the draft entries
      const draftEntries = await sql`
        SELECT id, date, memo, journal_type, created_at
        FROM journals 
        WHERE source IN ('credit_card_statement', 'cc_agent')
        AND is_posted = false
        AND (memo LIKE '%Payment%' OR journal_type = 'CCY')
        ORDER BY created_at DESC
      `;
      
      console.log('\nDraft entries that need attention:');
      draftEntries.rows.forEach((entry, index) => {
        console.log(`${index + 1}. ID: ${entry.id}, Date: ${entry.date}, Memo: ${entry.memo}`);
      });
    } else {
      console.log('✅ SUCCESS: No draft payment entries found!');
    }
    
    // Check schema to ensure is_posted column exists
    const schemaCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type
    `;
    
    const schema = schemaCheck.rows[0];
    console.log(`\n=== Schema Check ===`);
    console.log(`has_is_posted column: ${schema.has_is_posted ? '✅' : '❌'}`);
    console.log(`has_journal_type column: ${schema.has_journal_type ? '✅' : '❌'}`);
    
    return {
      success: true,
      recentPaymentsCount: recentPayments.rows.length,
      draftPaymentsCount: draftCount,
      hasRequiredColumns: schema.has_is_posted && schema.has_journal_type
    };
    
  } catch (error) {
    console.error('Error testing payment journal posting:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  testPaymentJournalPosting()
    .then(result => {
      console.log('\n=== Test Result ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testPaymentJournalPosting };

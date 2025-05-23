/**
 * Script to fix the user_id in bill_credits table
 * This script updates any bill credits with user_id = '0' to use the correct user ID
 */

const { sql } = require('@vercel/postgres');

async function fixBillCreditUserId(userId) {
  try {
    console.log(`[fixBillCreditUserId] Updating bill credits with user_id = '0' to use user_id = '${userId}'`);
    
    // First, check if there are any bill credits with user_id = '0'
    const checkResult = await sql`
      SELECT COUNT(*) as count
      FROM bill_credits
      WHERE user_id = '0'
    `;
    
    const count = checkResult.rows[0].count;
    console.log(`[fixBillCreditUserId] Found ${count} bill credits with user_id = '0'`);
    
    if (count > 0) {
      // Update the bill credits
      const updateResult = await sql`
        UPDATE bill_credits
        SET user_id = ${userId}
        WHERE user_id = '0'
        RETURNING id
      `;
      
      console.log(`[fixBillCreditUserId] Updated ${updateResult.rows.length} bill credits`);
      console.log(`[fixBillCreditUserId] Updated bill credit IDs:`, updateResult.rows.map(row => row.id));
      
      return {
        success: true,
        message: `Updated ${updateResult.rows.length} bill credits`,
        updatedIds: updateResult.rows.map(row => row.id)
      };
    } else {
      return {
        success: true,
        message: 'No bill credits with user_id = 0 found'
      };
    }
  } catch (error) {
    console.error('[fixBillCreditUserId] Error updating bill credits:', error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

module.exports = { fixBillCreditUserId };

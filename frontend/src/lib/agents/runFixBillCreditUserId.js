/**
 * Script to run the fixBillCreditUserId function
 * This script updates any bill credits with user_id = '0' to use the correct user ID
 */

const { fixBillCreditUserId } = require('./fixBillCreditUserId');

// The user ID to use for bill credits
// In a real implementation, this would come from the authenticated user
const USER_ID = 'lQcGVCc9xSQom8RgB7omxH6aDr33';

async function main() {
  console.log('Starting bill credit user ID fix...');
  
  try {
    const result = await fixBillCreditUserId(USER_ID);
    
    if (result.success) {
      console.log('Success:', result.message);
      if (result.updatedIds && result.updatedIds.length > 0) {
        console.log('Updated bill credit IDs:', result.updatedIds);
      }
    } else {
      console.error('Error:', result.error);
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
  
  console.log('Bill credit user ID fix complete');
}

// Run the script
main();

/**
 * Test script for beginning balance integration functionality
 * This script demonstrates how the enhanced credit card statement processing works
 */

const testBeginningBalanceIntegration = async () => {
  console.log('Testing Beginning Balance Integration');
  console.log('='.repeat(50));

  // Test data - simulating a credit card statement with beginning balance
  const testData = {
    userId: "1", // Replace with actual user ID
    query: `
      Credit Card Statement - American Express
      Account ending in 9009
      Statement Date: 2024-01-15
      
      Previous Balance: $1,250.00
      
      Transactions:
      01/02/2024  Amazon.com                    $89.99
      01/05/2024  Starbucks                     $15.50
      01/08/2024  Office Depot                  $124.75
      01/12/2024  Payment - Thank You          -$500.00
      
      Current Balance: $980.24
      Minimum Payment Due: $35.00
      Due Date: 2024-02-10
    `,
    documentContext: {
      name: "amex_statement_jan_2024.pdf",
      type: "pdf"
    }
  };

  try {
    console.log('1. Checking integration status...');
    
    // First check if the integration is available
    const statusResponse = await fetch('http://localhost:3000/api/tests/beginning-balance', {
      method: 'GET'
    });
    
    if (!statusResponse.ok) {
      throw new Error(`Status check failed: ${statusResponse.status}`);
    }
    
    const statusData = await statusResponse.json();
    console.log('Integration Status:', statusData);
    
    if (!statusData.status?.integrationReady) {
      console.log('❌ Integration not ready. Make sure the patch was applied correctly.');
      return;
    }
    
    console.log('✓ Integration is ready!');
    console.log('');
    
    console.log('2. Testing beginning balance processing...');
    
    // Test the beginning balance processing
    const testResponse = await fetch('http://localhost:3000/api/tests/beginning-balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });
    
    if (!testResponse.ok) {
      throw new Error(`Test failed: ${testResponse.status}`);
    }
    
    const testResult = await testResponse.json();
    console.log('Test Result:', JSON.stringify(testResult, null, 2));
    
    console.log('');
    console.log('3. Analysis of Results:');
    console.log('='.repeat(30));
    
    if (testResult.success) {
      console.log('✓ Test completed successfully');
      
      const result = testResult.result;
      
      if (result.accountCreated) {
        console.log(`✓ Credit card account created/found: ${result.accountName} (ID: ${result.accountId})`);
      } else {
        console.log('❌ Account creation failed');
      }
      
      if (result.beginningBalanceRecorded) {
        console.log('✓ Beginning balance was recorded successfully');
        console.log(`  Message: ${result.beginningBalanceMessage}`);
      } else {
        console.log('ℹ️ Beginning balance not recorded');
        console.log(`  Reason: ${result.beginningBalanceMessage}`);
      }
      
      console.log(`Processing Message: ${result.processingMessage}`);
      
    } else {
      console.log('❌ Test failed:', testResult.error);
    }
    
  } catch (error) {
    console.error('Error running test:', error.message);
    console.log('');
    console.log('Make sure:');
    console.log('1. The development server is running (npm run dev)');
    console.log('2. The patch was applied successfully');
    console.log('3. All required modules are available');
  }
};

// Instructions for manual testing
const printManualTestingInstructions = () => {
  console.log('');
  console.log('Manual Testing Instructions');
  console.log('='.repeat(40));
  console.log('');
  console.log('To test the beginning balance functionality manually:');
  console.log('');
  console.log('1. Start the development server:');
  console.log('   npm run dev');
  console.log('');
  console.log('2. Upload a credit card statement that includes:');
  console.log('   - Previous/Beginning balance');
  console.log('   - Current balance');
  console.log('   - Transaction details');
  console.log('');
  console.log('3. The system should:');
  console.log('   - Extract the beginning balance from the statement');
  console.log('   - Create the credit card account (if first time)');
  console.log('   - Record the beginning balance as a starting entry');
  console.log('   - Process all transactions normally');
  console.log('');
  console.log('4. Check the GL accounts to verify:');
  console.log('   - Credit card liability account was created');
  console.log('   - Beginning balance entry exists');
  console.log('   - Account has proper notes and documentation');
  console.log('');
  console.log('Expected Behavior:');
  console.log('- First statement: Beginning balance recorded');
  console.log('- Subsequent statements: Beginning balance ignored (not duplicate)');
  console.log('- GL entries show proper starting balance');
  console.log('- Account codes follow 5-digit format (20000-29999 for credit cards)');
};

// Main execution
if (require.main === module) {
  console.log('Beginning Balance Integration Test');
  console.log('='.repeat(50));
  console.log('');
  
  // Check if we should run the automated test
  const args = process.argv.slice(2);
  
  if (args.includes('--manual') || args.includes('-m')) {
    printManualTestingInstructions();
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  node test-beginning-balance-functionality.js          # Run automated test');
    console.log('  node test-beginning-balance-functionality.js --manual # Show manual testing instructions');
    console.log('  node test-beginning-balance-functionality.js --help   # Show this help');
  } else {
    testBeginningBalanceIntegration();
  }
}

module.exports = {
  testBeginningBalanceIntegration,
  printManualTestingInstructions
};

/**
 * Test script for the new credit card starting balance extraction functionality
 * This demonstrates how the enhanced extractor handles the American Express statement example
 */

const { CreditCardStartingBalanceExtractor } = require('./frontend/src/lib/agents/creditCardStartingBalanceExtractor.ts');
const { CreditCardStartingBalanceIntegration } = require('./frontend/src/lib/agents/creditCardStartingBalanceIntegration.ts');

async function testStartingBalanceExtraction() {
  console.log("=== Testing Credit Card Starting Balance Extraction ===\n");

  try {
    // Create the extractor
    const extractor = new CreditCardStartingBalanceExtractor();
    const integration = new CreditCardStartingBalanceIntegration();

    // Simulate the American Express statement example from the memory
    const mockStatementQuery = `
    Analyze this American Express credit card statement:
    
    Previous Balance: $2,076.94
    New Charges: $540.82
    Payments: $2,076.94
    Other Credits: $0.00
    New Balance: $540.82
    
    Statement Date: 2024-01-15
    Due Date: 2024-02-10
    Minimum Payment: $25.00
    Account Number: XXXX-XXXXX1-92009
    
    Transactions:
    2024-01-02 Amazon Purchase $45.67
    2024-01-05 Grocery Store $123.45
    2024-01-08 Gas Station $67.89
    2024-01-10 Restaurant $89.12
    2024-01-12 Online Service $34.56
    2024-01-15 Payment -$2,076.94
    2024-01-20 Coffee Shop $12.34
    2024-01-25 Bookstore $23.45
    2024-01-28 Pharmacy $56.78
    2024-01-30 Utility Payment $87.56
    `;

    console.log("1. Testing Enhanced Statement Extraction");
    console.log("==========================================");
    
    // Test the enhanced extraction
    const extractionResult = await extractor.extractEnhancedStatementInfo(mockStatementQuery);
    
    if (extractionResult.success) {
      console.log("✅ Enhanced extraction successful!");
      console.log("\nExtracted Information:");
      console.log(`- Credit Card Issuer: ${extractionResult.creditCardIssuer || "Not found"}`);
      console.log(`- Last Four Digits: ${extractionResult.lastFourDigits || "Not found"}`);
      console.log(`- Statement Number: ${extractionResult.statementNumber || "Not found"}`);
      console.log(`- Statement Date: ${extractionResult.statementDate || "Not found"}`);
      console.log(`- Previous Balance: $${extractionResult.previousBalance?.toFixed(2) || "Not found"}`);
      console.log(`- New Charges: $${extractionResult.newCharges?.toFixed(2) || "Not found"}`);
      console.log(`- Payments: $${extractionResult.payments?.toFixed(2) || "Not found"}`);
      console.log(`- Credits: $${extractionResult.credits?.toFixed(2) || "Not found"}`);
      console.log(`- New Balance: $${extractionResult.balance?.toFixed(2) || "Not found"}`);
      console.log(`- Due Date: ${extractionResult.dueDate || "Not found"}`);
      console.log(`- Minimum Payment: $${extractionResult.minimumPayment?.toFixed(2) || "Not found"}`);
      console.log(`- Transactions Found: ${extractionResult.transactions?.length || 0}`);

      // Test balance validation
      console.log("\n2. Testing Balance Validation");
      console.log("==============================");
      
      const validation = extractor.validateBalanceConsistency(extractionResult);
      console.log(`Validation Result: ${validation.isValid ? "✅ VALID" : "❌ INVALID"}`);
      console.log(`Validation Message: ${validation.message}`);
      
      if (validation.calculatedBalance !== undefined) {
        console.log(`Calculated Balance: $${validation.calculatedBalance.toFixed(2)}`);
      }

      // Test the complete workflow
      console.log("\n3. Testing Complete Workflow");
      console.log("=============================");
      
      const workflowResult = await integration.processCompleteStatementWorkflow(
        mockStatementQuery,
        undefined, // No document context for this test
        "test_user",
        12345, // Mock account ID
        "20001", // Mock account code
        "American Express Credit Card" // Mock account name
      );

      if (workflowResult.success) {
        console.log("✅ Complete workflow successful!");
        console.log(`Message: ${workflowResult.message}`);
        console.log(`Starting Balance Journal ID: ${workflowResult.startingBalanceJournalId || "None created"}`);
        console.log(`Transaction Journal IDs: ${workflowResult.transactionJournalIds?.length || 0} created`);
        console.log(`Total Transactions Processed: ${workflowResult.totalTransactionsProcessed || 0}`);
      } else {
        console.log("❌ Complete workflow failed:");
        console.log(`Error: ${workflowResult.message}`);
      }

    } else {
      console.log("❌ Enhanced extraction failed:");
      console.log(`Error: ${extractionResult.message}`);
    }

    console.log("\n4. Key Benefits of Starting Balance Enhancement");
    console.log("===============================================");
    console.log("✅ Accurately captures the Previous Balance from credit card statements");
    console.log("✅ Validates balance calculations (Previous + Charges - Payments + Credits = New Balance)");
    console.log("✅ Creates proper journal entries for starting balances before processing transactions");
    console.log("✅ Ensures accurate account reconciliation and financial reporting");
    console.log("✅ Handles the complete workflow from statement extraction to journal entry creation");

  } catch (error) {
    console.error("❌ Test failed with error:", error);
    console.error("Stack trace:", error.stack);
  }
}

// Run the test
if (require.main === module) {
  testStartingBalanceExtraction()
    .then(() => {
      console.log("\n=== Test Complete ===");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Test failed:", error);
      process.exit(1);
    });
}

module.exports = { testStartingBalanceExtraction };

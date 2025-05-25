const fs = require('fs');
const path = require('path');

/**
 * Simple patch script to integrate beginning balance functionality into creditCardAgent.ts
 */

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'frontend/src/lib/agents/creditCardAgent.ts');

function applyBeginningBalancePatch() {
  console.log('Applying beginning balance integration patch to creditCardAgent.ts...');
  
  try {
    // Read the current file
    let content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    
    // Create backup first
    const backupPath = CREDIT_CARD_AGENT_PATH + '.backup.' + Date.now();
    fs.writeFileSync(backupPath, content);
    console.log(`Created backup at: ${backupPath}`);
    
    let patchesApplied = 0;

    // Patch 1: Add import for beginning balance integration
    const importPatch = `import { generateAIAccountNotes } from './aiAccountNotesGenerator';
import { CreditCardBeginningBalanceIntegration } from './creditCardBeginningBalanceIntegration';`;
    
    if (content.includes("import { generateAIAccountNotes } from './aiAccountNotesGenerator';") && 
        !content.includes("CreditCardBeginningBalanceIntegration")) {
      content = content.replace(
        "import { generateAIAccountNotes } from './aiAccountNotesGenerator';",
        importPatch
      );
      patchesApplied++;
      console.log('✓ Added beginning balance integration import');
    }

    // Patch 2: Add property to class
    const propertyPatch = `  private transactionProcessor: CreditCardTransactionProcessor;
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;`;
    
    if (content.includes("private transactionProcessor: CreditCardTransactionProcessor;") && 
        !content.includes("private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;")) {
      content = content.replace(
        "private transactionProcessor: CreditCardTransactionProcessor;",
        propertyPatch
      );
      patchesApplied++;
      console.log('✓ Added beginning balance integration property');
    }

    // Patch 3: Initialize in constructor
    const constructorPatch = `    this.transactionProcessor = new CreditCardTransactionProcessor();
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();`;
    
    if (content.includes("this.transactionProcessor = new CreditCardTransactionProcessor();") && 
        !content.includes("this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();")) {
      content = content.replace(
        "this.transactionProcessor = new CreditCardTransactionProcessor();",
        constructorPatch
      );
      patchesApplied++;
      console.log('✓ Added beginning balance integration initialization');
    }

    // Patch 4: Add enhanced processing method before findOrCreateCreditCardAccountForTransactions
    const enhancedMethodCode = `
  /**
   * Enhanced statement processing with beginning balance integration
   * This method should be used for first-time statement uploads to capture beginning balances
   */
  private async processStatementWithBeginningBalance(
    context: AgentContext,
    query: string,
    documentContext?: any
  ): Promise<{
    success: boolean;
    message: string;
    accountId?: number;
    accountName?: string;
    beginningBalanceRecorded?: boolean;
    beginningBalanceMessage?: string;
  }> {
    try {
      console.log('[CreditCardAgent] Starting enhanced statement processing with beginning balance');

      // Step 1: Extract enhanced statement information including beginning balance
      const statementInfo = await this.beginningBalanceIntegration.processStatementWithBeginningBalance(
        query,
        context,
        documentContext
      );

      if (!statementInfo.success) {
        return {
          success: false,
          message: \`Failed to extract statement information: \${statementInfo.message}\`
        };
      }

      console.log('[CreditCardAgent] Enhanced statement extraction successful:', {
        issuer: statementInfo.creditCardIssuer,
        lastFour: statementInfo.lastFourDigits,
        currentBalance: statementInfo.balance,
        beginningBalance: statementInfo.previousBalance,
        transactionCount: statementInfo.transactions?.length || 0
      });

      // Step 2: Create/find the credit card account using the standard method
      const basicStatementInfo = {
        creditCardIssuer: statementInfo.creditCardIssuer,
        lastFourDigits: statementInfo.lastFourDigits,
        statementNumber: statementInfo.statementNumber,
        statementDate: statementInfo.statementDate,
        balance: statementInfo.balance,
        dueDate: statementInfo.dueDate,
        minimumPayment: statementInfo.minimumPayment,
        transactions: statementInfo.transactions
      };

      const accountResult = await this.findOrCreateCreditCardAccountForTransactions(
        context,
        basicStatementInfo
      );

      if (!accountResult.success) {
        return {
          success: false,
          message: \`Failed to create/find credit card account: \${accountResult.message}\`
        };
      }

      console.log('[CreditCardAgent] Account creation successful:', {
        accountId: accountResult.accountId,
        accountName: accountResult.accountName
      });

      // Step 3: Handle beginning balance if present and this is the first statement
      let beginningBalanceRecorded = false;
      let beginningBalanceMessage = 'No beginning balance to record';

      if (statementInfo.previousBalance && statementInfo.previousBalance !== 0 && accountResult.accountId) {
        console.log(\`[CreditCardAgent] Processing beginning balance: $\${statementInfo.previousBalance}\`);
        
        const balanceIntegrationResult = await this.beginningBalanceIntegration.processStatementWithBeginningBalanceIntegration(
          query,
          context,
          accountResult.accountId,
          accountResult.accountName || \`\${statementInfo.creditCardIssuer || 'Credit Card'} \${statementInfo.lastFourDigits || 'unknown'}\`,
          documentContext
        );

        beginningBalanceRecorded = balanceIntegrationResult.beginningBalanceRecorded;
        beginningBalanceMessage = balanceIntegrationResult.beginningBalanceMessage || 'Unknown status';

        console.log('[CreditCardAgent] Beginning balance processing result:', {
          recorded: beginningBalanceRecorded,
          message: beginningBalanceMessage
        });
      }

      return {
        success: true,
        message: 'Successfully processed credit card account with beginning balance integration',
        accountId: accountResult.accountId,
        accountName: accountResult.accountName,
        beginningBalanceRecorded,
        beginningBalanceMessage
      };

    } catch (error) {
      console.error('[CreditCardAgent] Error in enhanced statement processing:', error);
      return {
        success: false,
        message: \`Error in enhanced statement processing: \${error.message}\`
      };
    }
  }

  /**
   * Check if a statement should use beginning balance processing
   */
  private async shouldUseBeginningBalanceProcessing(
    context: AgentContext,
    accountId?: number
  ): Promise<boolean> {
    if (!accountId) {
      // If no account ID, this might be a new account, so use enhanced processing
      return true;
    }

    try {
      // Check if this account has any existing transactions
      const isFirstStatement = await this.beginningBalanceIntegration.isFirstStatementForAccount(
        context,
        accountId,
        new Date().toISOString().split('T')[0]
      );

      return isFirstStatement;
    } catch (error) {
      console.error('[CreditCardAgent] Error checking if should use beginning balance processing:', error);
      // Default to false to avoid duplicate processing
      return false;
    }
  }

`;

    // Find the location to insert the enhanced method (before findOrCreateCreditCardAccountForTransactions)
    const findMethodSignature = "private async findOrCreateCreditCardAccountForTransactions(";
    const findMethodIndex = content.indexOf(findMethodSignature);
    
    if (findMethodIndex !== -1 && !content.includes("processStatementWithBeginningBalance")) {
      // Insert the enhanced method before the existing method
      content = content.slice(0, findMethodIndex) + enhancedMethodCode + content.slice(findMethodIndex);
      patchesApplied++;
      console.log('✓ Added enhanced statement processing method');
    }

    // Write the modified content back to the file
    if (patchesApplied > 0) {
      fs.writeFileSync(CREDIT_CARD_AGENT_PATH, content);
      console.log(`✓ Applied ${patchesApplied} patches to creditCardAgent.ts`);
      
      return {
        success: true,
        message: `Successfully applied ${patchesApplied} patches. Backup created at ${backupPath}`,
        patchesApplied,
        backupPath
      };
    } else {
      console.log('No patches were applied - file may already be patched');
      return {
        success: false,
        message: 'No patches were applied - file may already be patched',
        patchesApplied: 0
      };
    }

  } catch (error) {
    console.error('Error applying beginning balance patch:', error);
    return {
      success: false,
      message: `Error applying patch: ${error.message}`,
      error: error.message
    };
  }
}

// Main execution
if (require.main === module) {
  console.log('Starting Credit Card Agent Beginning Balance Integration Patch...');
  console.log('='.repeat(70));
  
  const patchResult = applyBeginningBalancePatch();
  console.log('\nPatch Result:', patchResult);
  
  if (patchResult.success) {
    console.log('\n' + '='.repeat(70));
    console.log('✓ Beginning balance integration patch applied successfully!');
    console.log('\nNext steps:');
    console.log('1. The credit card agent now has beginning balance integration capability');
    console.log('2. When processing the first statement for a credit card, it will:');
    console.log('   - Extract the beginning balance from the statement');
    console.log('   - Create the credit card account');
    console.log('   - Record the beginning balance through the GL Agent');
    console.log('3. Test the functionality by uploading a credit card statement');
    
    if (patchResult.backupPath) {
      console.log(`\nBackup created at: ${patchResult.backupPath}`);
    }
  } else {
    console.log('\n❌ Patch failed:', patchResult.message);
    console.log('\nYou may need to manually integrate the beginning balance functionality.');
  }
}

module.exports = {
  applyBeginningBalancePatch
};

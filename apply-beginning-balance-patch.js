const fs = require('fs');
const path = require('path');

/**
 * Patch script to integrate beginning balance functionality into creditCardAgent.ts
 * This script modifies the large file to add the necessary imports and integration
 */

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'frontend/src/lib/agents/creditCardAgent.ts');

function applyBeginningBalancePatch() {
  console.log('Applying beginning balance integration patch to creditCardAgent.ts...');
  
  try {
    // Read the current file
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    
    // Define the patches to apply
    const patches = [
      {
        description: 'Add beginning balance integration import',
        search: /import { generateAIAccountNotes } from '\.\/aiAccountNotesGenerator';/,
        replace: `import { generateAIAccountNotes } from './aiAccountNotesGenerator';
import { CreditCardBeginningBalanceIntegration } from './creditCardBeginningBalanceIntegration';`
      },
      {
        description: 'Add beginning balance integration property to class',
        search: /private transactionProcessor: CreditCardTransactionProcessor;/,
        replace: `private transactionProcessor: CreditCardTransactionProcessor;
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;`
      },
      {
        description: 'Initialize beginning balance integration in constructor',
        search: /this\.transactionProcessor = new CreditCardTransactionProcessor\(\);/,
        replace: `this.transactionProcessor = new CreditCardTransactionProcessor();
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();`
      },
      {
        description: 'Add enhanced statement processing method',
        search: /\/\*\*\s*\* Find or create a credit card account for transactions/,
        replace: `/**
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
   * Find or create a credit card account for transactions`
      },
      {
        description: 'Add method to check if beginning balance processing should be used',
        search: /private async extractStatementInfo\(/,
        replace: `/**
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

  private async extractStatementInfo(`
      }
    ];

    let modifiedContent = content;
    let patchesApplied = 0;

    // Apply each patch
    for (const patch of patches) {
      console.log(`Applying patch: ${patch.description}`);
      
      if (patch.search.test(modifiedContent)) {
        modifiedContent = modifiedContent.replace(patch.search, patch.replace);
        patchesApplied++;
        console.log(`\u2705 Successfully applied: ${patch.description}`);
      } else {
        console.log(`\u26A0 Skipped (not found): ${patch.description}`);
      }
    }

    // Write the modified content back to the file
    if (patchesApplied > 0) {
      // Create a backup first
      const backupPath = CREDIT_CARD_AGENT_PATH + '.backup.' + Date.now();
      fs.writeFileSync(backupPath, content);
      console.log(`Created backup at: ${backupPath}`);

      // Write the patched content
      fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
      console.log(`\u2705 Applied ${patchesApplied} patches to creditCardAgent.ts`);
      
      return {
        success: true,
        message: `Successfully applied ${patchesApplied} patches. Backup created at ${backupPath}`,
        patchesApplied,
        backupPath
      };
    } else {
      console.log('No patches were applied - file may already be patched or structure has changed');
      return {
        success: false,
        message: 'No patches were applied - file may already be patched or structure has changed',
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

// Add method to modify existing statement processing calls to use enhanced version
function addEnhancedProcessingCalls() {
  console.log('Adding enhanced processing calls...');
  
  try {
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    
    // Find places where findOrCreateCreditCardAccountForTransactions is called
    // and add logic to use enhanced processing when appropriate
    const enhancedCallPatch = {
      description: 'Add enhanced processing logic to main processing flow',
      search: /(\/\/ Step 1: Extract statement information[\s\S]*?)(await this\.findOrCreateCreditCardAccountForTransactions\(\s*context,\s*statementInfo\s*\);)/,
      replace: `/**
   * Check if we should use enhanced processing for beginning balance
   */
  const shouldUseEnhanced = await this.shouldUseBeginningBalanceProcessing(context);
  
  let accountResult;
  if (shouldUseEnhanced) {
    console.log('[CreditCardAgent] Using enhanced processing for potential beginning balance');
    accountResult = await this.processStatementWithBeginningBalance(context, query, documentContext);
    
    if (accountResult.beginningBalanceRecorded) {
      console.log(`[CreditCardAgent] Beginning balance recorded: ${accountResult.beginningBalanceMessage}`);
    }
  } else {
    console.log('[CreditCardAgent] Using standard processing - not first statement');
    accountResult = $2
  }`
    };

    if (enhancedCallPatch.search.test(content)) {
      const modifiedContent = content.replace(enhancedCallPatch.search, enhancedCallPatch.replace);
      
      // Create another backup
      const backupPath = CREDIT_CARD_AGENT_PATH + '.backup-enhanced.' + Date.now();
      fs.writeFileSync(backupPath, content);
      
      fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
      console.log('\u2705 Added enhanced processing calls');
      
      return {
        success: true,
        message: `Enhanced processing calls added. Backup created at ${backupPath}`,
        backupPath
      };
    } else {
      console.log('Could not find the pattern to add enhanced processing calls');
      return {
        success: false,
        message: 'Could not find the pattern to add enhanced processing calls'
      };
    }
    
  } catch (error) {
    console.error('Error adding enhanced processing calls:', error);
    return {
      success: false,
      message: `Error adding enhanced calls: ${error.message}`
    };
  }
}

// Main execution
if (require.main === module) {
  console.log('Starting Credit Card Agent Beginning Balance Integration Patch...');
  console.log('='.repeat(70));
  
  // Step 1: Apply the main patches
  const patchResult = applyBeginningBalancePatch();
  console.log('\nPatch Result:', patchResult);
  
  if (patchResult.success) {
    console.log('\n' + '='.repeat(70));
    console.log('\u2705 Beginning balance integration patch applied successfully!');
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
    console.log('\n\u274C Patch failed:', patchResult.message);
    console.log('\nYou may need to manually integrate the beginning balance functionality.');
  }
}

module.exports = {
  applyBeginningBalancePatch,
  addEnhancedProcessingCalls
};

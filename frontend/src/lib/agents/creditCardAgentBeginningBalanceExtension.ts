import { AgentContext } from "@/types/agents";
import { CreditCardBeginningBalanceIntegration } from "./creditCardBeginningBalanceIntegration";
import { EnhancedStatementInfo } from "./creditCardStartingBalanceExtractor";

/**
 * Extension module for CreditCardAgent to handle beginning balance integration
 * This provides the enhanced functionality without modifying the large main file
 */
export class CreditCardAgentBeginningBalanceExtension {
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;

  constructor() {
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();
  }

  /**
   * Enhanced account creation that includes beginning balance processing
   */
  async createOrFindAccountWithBeginningBalance(
    context: AgentContext,
    query: string,
    documentContext?: any,
    existingStatementInfo?: EnhancedStatementInfo
  ): Promise<{
    success: boolean;
    message: string;
    accountId?: number;
    accountName?: string;
    statementInfo?: EnhancedStatementInfo;
    beginningBalanceRecorded?: boolean;
    beginningBalanceMessage?: string;
    isFirstStatement?: boolean;
  }> {
    console.log('[CreditCardAgentBeginningBalanceExtension] Starting enhanced account creation with beginning balance');
    
    try {
      let statementInfo;
      
      // Use existing statement info if provided, otherwise extract fresh
      if (existingStatementInfo) {
        console.log('[CreditCardAgentBeginningBalanceExtension] Using existing statement info to avoid re-extraction');
        statementInfo = existingStatementInfo;
      } else {
        console.log('[CreditCardAgentBeginningBalanceExtension] No existing statement info provided, extracting fresh');
        // Step 1: Extract enhanced statement information including beginning balance
        statementInfo = await this.beginningBalanceIntegration.processStatementWithBeginningBalance(
          query,
          context,
          documentContext
        );
      }

      if (!statementInfo.success) {
        return {
          success: false,
          message: `Failed to extract statement information: ${statementInfo.message}`,
          statementInfo
        };
      }

      console.log('[CreditCardAgentBeginningBalanceExtension] Enhanced statement extraction successful:', {
        issuer: statementInfo.creditCardIssuer,
        lastFour: statementInfo.lastFourDigits,
        currentBalance: statementInfo.balance,
        beginningBalance: statementInfo.previousBalance,
        transactionCount: statementInfo.transactions?.length || 0
      });

      // Step 2: Create/find the credit card account using the standard method
      // We'll need to call the original CreditCardAgent method here
      // For now, we'll simulate the account creation logic
      
      console.log(`[CreditCardAgentBeginningBalanceExtension] Processing statement info:`, {
        creditCardIssuer: statementInfo.creditCardIssuer,
        lastFourDigits: statementInfo.lastFourDigits,
        statementNumber: statementInfo.statementNumber,
        statementDate: statementInfo.statementDate,
        previousBalance: statementInfo.previousBalance
      });
      
      const accountName = `${statementInfo.creditCardIssuer || 'Credit Card'} ${statementInfo.lastFourDigits || 'unknown'}`;
      
      console.log(`[CreditCardAgentBeginningBalanceExtension] Generated account name: "${accountName}"`);
      
      // Import and use the original CreditCardAgent
      const { CreditCardAgent } = await import('./creditCardAgent');
      const creditCardAgent = new CreditCardAgent();
      
      // Call the original method with the basic statement info
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

      // Use reflection to call the private method
      const accountResult = await (creditCardAgent as any).findOrCreateCreditCardAccountForTransactions(
        context,
        basicStatementInfo
      );

      if (!accountResult.success) {
        return {
          success: false,
          message: `Failed to create/find credit card account: ${accountResult.message}`,
          statementInfo
        };
      }

      console.log('[CreditCardAgentBeginningBalanceExtension] Account creation successful:', {
        accountId: accountResult.accountId,
        accountName: accountResult.accountName
      });

      // Step 3: Handle beginning balance if present and this is the first statement
      let beginningBalanceRecorded = false;
      let beginningBalanceMessage = 'No beginning balance to record';
      let isFirstStatement = false;

      if (statementInfo.previousBalance && statementInfo.previousBalance !== 0 && accountResult.accountId) {
        console.log(`[CreditCardAgentBeginningBalanceExtension] Processing beginning balance: $${statementInfo.previousBalance}`);
        
        const balanceIntegrationResult = await this.beginningBalanceIntegration.processStatementWithBeginningBalanceIntegration(
          query,
          context,
          accountResult.accountId,
          accountResult.accountName || accountName,
          documentContext
        );

        beginningBalanceRecorded = balanceIntegrationResult.beginningBalanceRecorded;
        beginningBalanceMessage = balanceIntegrationResult.beginningBalanceMessage || 'Unknown status';
        isFirstStatement = balanceIntegrationResult.isFirstStatement || false;

        console.log('[CreditCardAgentBeginningBalanceExtension] Beginning balance processing result:', {
          recorded: beginningBalanceRecorded,
          message: beginningBalanceMessage,
          isFirstStatement: isFirstStatement
        });
      }

      return {
        success: true,
        message: `Successfully processed credit card account with beginning balance integration`,
        accountId: accountResult.accountId,
        accountName: accountResult.accountName,
        statementInfo,
        beginningBalanceRecorded,
        beginningBalanceMessage,
        isFirstStatement
      };

    } catch (error) {
      console.error('[CreditCardAgentBeginningBalanceExtension] Error in enhanced account creation:', error);
      return {
        success: false,
        message: `Error in enhanced account creation: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * Check if a statement should use beginning balance processing
   * This can be used to determine whether to use the enhanced method
   */
  async shouldUseBeginningBalanceProcessing(
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
      console.error('[CreditCardAgentBeginningBalanceExtension] Error checking if should use beginning balance processing:', error);
      // Default to false to avoid duplicate processing
      return false;
    }
  }
}

/**
 * Factory function to create the extension
 */
export function createCreditCardAgentBeginningBalanceExtension(): CreditCardAgentBeginningBalanceExtension {
  return new CreditCardAgentBeginningBalanceExtension();
}

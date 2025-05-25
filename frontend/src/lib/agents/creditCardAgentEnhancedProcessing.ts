import { AgentContext } from "@/types/agents";
import { CreditCardAgent } from "./creditCardAgent";
import { CreditCardBeginningBalanceIntegration } from "./creditCardBeginningBalanceIntegration";
import { CreditCardAccountCreatorWithBalance } from "./creditCardAccountCreatorWithBalance";
import { CreditCardStartingBalanceExtractor } from "./creditCardStartingBalanceExtractor";
import { sql } from "@vercel/postgres";

/**
 * Enhanced processing methods for CreditCardAgent that integrate beginning balance functionality
 */
export class CreditCardAgentEnhancedProcessing {
  private creditCardAgent: CreditCardAgent;
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;
  private accountCreator: CreditCardAccountCreatorWithBalance;
  private enhancedExtractor: CreditCardStartingBalanceExtractor;

  constructor(creditCardAgent: CreditCardAgent) {
    this.creditCardAgent = creditCardAgent;
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();
    this.accountCreator = new CreditCardAccountCreatorWithBalance();
    this.enhancedExtractor = new CreditCardStartingBalanceExtractor();
  }

  /**
   * Enhanced account creation that handles beginning balances and statement tracking
   */
  async processStatementWithBeginningBalance(
    context: AgentContext,
    statementInfo: any
  ): Promise<{
    success: boolean;
    message: string;
    accountId?: number;
    accountName?: string;
    beginningBalanceRecorded?: boolean;
    beginningBalanceMessage?: string;
  }> {
    try {
      console.log('[CreditCardAgent] Enhanced processing: Finding or creating credit card account with beginning balance');

      // Step 1: Check if this statement has already been processed
      const isDuplicate = await this.checkForDuplicateStatement(context, statementInfo);
      
      if (isDuplicate.isDuplicate) {
        console.log('[CreditCardAgent] Statement is duplicate, skipping processing');
        return {
          success: false,
          message: `This statement has already been processed: ${isDuplicate.message}`
        };
      }

      // Step 2: Try to find existing account first
      const existingAccount = await this.creditCardAgent.findOrCreateCreditCardAccountForTransactions(
        context,
        statementInfo
      );

      // If account was found (not created), check if we need beginning balance
      if (existingAccount.success && existingAccount.accountId) {
        const hasBeginningBalance = await this.beginningBalanceIntegration.hasBeginningBalanceBeenRecorded(
          context,
          existingAccount.accountId
        );

        // Record statement tracker
        await this.recordStatementTracker(context, statementInfo, existingAccount.accountId, false);

        // If account exists but no beginning balance, record it
        if (!hasBeginningBalance) {
          // For first statements, use current balance as beginning balance if previousBalance not available
          const beginningBalanceAmount = statementInfo.previousBalance || statementInfo.balance;
          
          if (beginningBalanceAmount && beginningBalanceAmount > 0) {
            console.log(`[CreditCardAgent] Existing account found but no beginning balance recorded, adding beginning balance of ${beginningBalanceAmount}`);
            console.log(`[CreditCardAgent] Using ${statementInfo.previousBalance ? 'previousBalance' : 'current balance'} as beginning balance`);
            
            try {
              const balanceResult = await this.beginningBalanceIntegration.recordBeginningBalance(
                context,
                existingAccount.accountName || 'Credit Card Account',
                'credit_card',
                beginningBalanceAmount,
                statementInfo.statementDate || new Date().toISOString().split('T')[0],
                existingAccount.accountId
              );

              return {
                success: true,
                message: 'Successfully processed statement with beginning balance handling',
                accountId: existingAccount.accountId,
                accountName: existingAccount.accountName,
                beginningBalanceRecorded: balanceResult.success,
                beginningBalanceMessage: balanceResult.message
              };
            } catch (error) {
              console.error('[CreditCardAgent] Error recording beginning balance for existing account:', error);
              return {
                success: true,
                message: 'Account found but beginning balance recording failed',
                accountId: existingAccount.accountId,
                accountName: existingAccount.accountName,
                beginningBalanceRecorded: false,
                beginningBalanceMessage: `Error recording beginning balance: ${error instanceof Error ? error.message : 'Unknown error'}`
              };
            }
          } else {
            console.log('[CreditCardAgent] No valid balance amount found for beginning balance');
            return {
              success: true,
              message: 'Account found but no valid balance for beginning balance',
              accountId: existingAccount.accountId,
              accountName: existingAccount.accountName,
              beginningBalanceRecorded: false,
              beginningBalanceMessage: 'No valid balance amount found'
            };
          }
        }

        return {
          success: true,
          message: 'Successfully processed statement with existing account',
          accountId: existingAccount.accountId,
          accountName: existingAccount.accountName,
          beginningBalanceRecorded: hasBeginningBalance,
          beginningBalanceMessage: hasBeginningBalance ? 'Beginning balance already recorded' : 'No beginning balance needed'
        };
      }

      // Step 3: If no account found, we need to create one with beginning balance
      console.log('[CreditCardAgent] No existing account found, creating new account with beginning balance');
      
      // This means the findOrCreateCreditCardAccountForTransactions method didn't create an account
      // We need to create it ourselves using our new account creator
      
      // Extract account information
      const issuer = statementInfo.creditCardIssuer || "Credit Card";
      const lastFourDigits = statementInfo.lastFourDigits || "unknown";
      const accountName = `${issuer} ${lastFourDigits}`;
      
      // Generate account code (simplified version)
      const accountCode = (20000 + Math.floor(Math.random() * 9999)).toString();
      const accountNotes = `Credit card account for ${accountName}. Created with beginning balance integration.`;

      // Create account with beginning balance
      const createResult = await this.accountCreator.createAccountWithBeginningBalance(
        context,
        accountName,
        accountCode,
        accountNotes,
        statementInfo
      );

      if (createResult.success && createResult.accountId) {
        // Record statement tracker for the new account
        await this.recordStatementTracker(context, statementInfo, createResult.accountId, true);
      }

      return createResult;

    } catch (error) {
      console.error('[CreditCardAgent] Error in enhanced account creation:', error);
      return {
        success: false,
        message: `Error in enhanced processing: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Check if a statement has already been processed
   */
  private async checkForDuplicateStatement(
    context: AgentContext,
    statementInfo: any
  ): Promise<{ isDuplicate: boolean; message: string }> {
    try {
      if (!context.userId) {
        return { isDuplicate: false, message: "No user ID provided" };
      }

      const statementNumber = statementInfo.statementNumber || 'unknown';
      const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
      const statementDate = statementInfo.statementDate || 'unknown';

      console.log(`[CreditCardAgent] Checking for duplicate statement: ${statementNumber}, last four: ${lastFourDigits}, date: ${statementDate}`);

      // Validate inputs before SQL query to prevent database errors
      if (!statementNumber || statementNumber === 'unknown') {
        console.log(`[CreditCardAgent] Cannot check for duplicates: invalid statement number: ${statementNumber}`);
        return {
          isDuplicate: false,
          message: "Cannot check for duplicates with invalid statement number"
        };
      }

      if (!statementDate || statementDate === 'unknown') {
        console.log(`[CreditCardAgent] Cannot check for duplicates: invalid statement date: ${statementDate}`);
        return {
          isDuplicate: false,
          message: "Cannot check for duplicates with invalid statement date"
        };
      }

      // Check statement_trackers table for existing records
      // Only consider it a duplicate if BOTH statement number AND date match
      // This prevents false positives from different statements for the same card
      const { rows } = await sql`
        SELECT id, statement_number, last_four, statement_date 
        FROM statement_trackers 
        WHERE user_id = ${context.userId}
        AND statement_number = ${statementNumber}
        AND statement_date = ${statementDate}
        LIMIT 1
      `;

      if (rows.length > 0) {
        const existingRecord = rows[0];
        console.log(`[CreditCardAgent] Found duplicate statement in tracker: ID ${existingRecord.id}`);
        return {
          isDuplicate: true,
          message: `Statement already processed: ${existingRecord.statement_number} (${existingRecord.statement_date})`
        };
      }

      console.log(`[CreditCardAgent] No duplicate found, statement is new`);
      return { isDuplicate: false, message: "Statement is new" };

    } catch (error) {
      console.error('[CreditCardAgent] Error checking for duplicate statement:', error);
      return { isDuplicate: false, message: "Error checking duplicates" };
    }
  }

  /**
   * Record statement information in the tracker table
   */
  private async recordStatementTracker(
    context: AgentContext,
    statementInfo: any,
    accountId: number,
    isFirstStatement: boolean
  ): Promise<void> {
    try {
      const statementNumber = statementInfo.statementNumber || 'unknown';
      const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
      const statementDate = statementInfo.statementDate || new Date().toISOString().split('T')[0];

      console.log(`[CreditCardAgent] Recording statement tracker for account ${accountId}: ${statementNumber}`);

      await sql`
        INSERT INTO statement_trackers (
          user_id, account_id, statement_number, last_four, statement_date, is_starting_balance, processed_date
        ) VALUES (
          ${context.userId}, ${accountId}, ${statementNumber}, ${lastFourDigits}, 
          ${statementDate}, ${isFirstStatement}, NOW()
        )
      `;

      console.log(`[CreditCardAgent] Successfully recorded statement tracker`);
    } catch (error) {
      console.error('[CreditCardAgent] Error recording statement tracker:', error);
      // Don't throw - this is not critical to the main process
    }
  }
}

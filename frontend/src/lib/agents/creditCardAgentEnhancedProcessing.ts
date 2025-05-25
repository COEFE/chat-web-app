import { AgentContext } from "@/types/agents";
import { CreditCardAgent } from "./creditCardAgent";
import { CreditCardBeginningBalanceIntegration } from "./creditCardBeginningBalanceIntegration";
import { sql } from "@vercel/postgres";

/**
 * Enhanced processing methods for CreditCardAgent that integrate beginning balance functionality
 */
export class CreditCardAgentEnhancedProcessing {
  private creditCardAgent: CreditCardAgent;
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;

  constructor(creditCardAgent: CreditCardAgent) {
    this.creditCardAgent = creditCardAgent;
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();
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

      // Step 1: Create or find the credit card account using the statement info
      const accountResult = await this.creditCardAgent.findOrCreateCreditCardAccountForTransactions(
        context,
        statementInfo
      );

      if (!accountResult.success || !accountResult.accountId) {
        return {
          success: false,
          message: `Failed to create/find credit card account: ${accountResult.message}`,
          accountId: accountResult.accountId,
          accountName: accountResult.accountName
        };
      }

      // Step 2: Check if this statement has already been processed
      const isDuplicate = await this.checkForDuplicateStatement(context, statementInfo);
      
      // Step 3: Check if beginning balance has been recorded for this account
      const hasBeginningBalance = await this.beginningBalanceIntegration.hasBeginningBalanceBeenRecorded(
        context,
        accountResult.accountId
      );

      // Allow processing if:
      // 1. Statement is not a duplicate, OR
      // 2. Statement is a duplicate but no beginning balance has been recorded
      const shouldProcess = !isDuplicate.isDuplicate || !hasBeginningBalance;

      if (!shouldProcess) {
        return {
          success: false,
          message: `This statement has already been processed and beginning balance is recorded: ${isDuplicate.message}`
        };
      }

      if (isDuplicate.isDuplicate && !hasBeginningBalance) {
        console.log('[CreditCardAgent] Statement is duplicate but no beginning balance recorded - allowing beginning balance processing');
      }

      // Step 4: Record statement in tracker table (only if not duplicate)
      if (!isDuplicate.isDuplicate && accountResult.accountId) {
        await this.recordStatementTracker(context, statementInfo, accountResult.accountId, false);
      }

      // Step 5: Process beginning balance if needed and available
      let beginningBalanceRecorded = false;
      let beginningBalanceMessage = 'No beginning balance processing needed';

      if (!hasBeginningBalance && statementInfo.previousBalance && statementInfo.previousBalance > 0) {
        console.log('[CreditCardAgent] Processing beginning balance for account');
        
        try {
          const balanceResult = await this.beginningBalanceIntegration.recordBeginningBalance(
            context,
            accountResult.accountName || 'Credit Card Account',
            'credit_card',
            statementInfo.previousBalance,
            statementInfo.statementDate || new Date().toISOString().split('T')[0],
            accountResult.accountId
          );

          beginningBalanceRecorded = balanceResult.success;
          beginningBalanceMessage = balanceResult.message;
        } catch (error) {
          console.error('[CreditCardAgent] Error recording beginning balance:', error);
          beginningBalanceRecorded = false;
          beginningBalanceMessage = `Error recording beginning balance: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      } else if (hasBeginningBalance) {
        beginningBalanceMessage = 'Beginning balance already recorded for this account';
      } else if (!statementInfo.previousBalance || statementInfo.previousBalance <= 0) {
        beginningBalanceMessage = 'No beginning balance found in statement or balance is zero';
      }

      return {
        success: true,
        message: 'Successfully processed statement with beginning balance handling',
        accountId: accountResult.accountId,
        accountName: accountResult.accountName,
        beginningBalanceRecorded,
        beginningBalanceMessage
      };

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

      console.log(`[CreditCardAgent] Checking for duplicate statement: ${statementNumber}, last four: ${lastFourDigits}`);

      // Check statement_trackers table for existing records
      const { rows } = await sql`
        SELECT id, statement_number, last_four, statement_date 
        FROM statement_trackers 
        WHERE user_id = ${context.userId}
        AND (
          (statement_number = ${statementNumber} AND statement_number != 'unknown')
          OR (last_four = ${lastFourDigits} AND last_four != 'unknown')
        )
        LIMIT 1
      `;

      if (rows.length > 0) {
        const existing = rows[0];
        return {
          isDuplicate: true,
          message: `Statement already processed: ${existing.statement_number} (${existing.last_four}) on ${existing.statement_date}`
        };
      }

      return { isDuplicate: false, message: "Statement is new" };

    } catch (error) {
      console.error('[CreditCardAgent] Error checking for duplicate statement:', error);
      // Don't block processing if duplicate check fails
      return { isDuplicate: false, message: "Could not check for duplicates" };
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
      if (!context.userId) {
        console.warn('[CreditCardAgent] Cannot record statement tracker: missing user ID');
        return;
      }

      const statementNumber = statementInfo.statementNumber || 'unknown';
      const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
      const statementDate = statementInfo.statementDate || new Date().toISOString().split('T')[0];

      console.log(`[CreditCardAgent] Recording statement tracker: ${statementNumber} for account ${accountId}`);

      // Create statement_trackers table if it doesn't exist
      await sql`
        CREATE TABLE IF NOT EXISTS statement_trackers (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_id INTEGER NOT NULL,
          statement_number TEXT NOT NULL,
          last_four TEXT NOT NULL,
          statement_date DATE NOT NULL,
          is_starting_balance BOOLEAN NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, account_id, statement_number)
        )
      `;

      // Insert the statement tracker record
      try {
        await sql`
          INSERT INTO statement_trackers (
            user_id, account_id, statement_number, last_four, 
            statement_date, is_starting_balance
          ) VALUES (
            ${context.userId}, ${accountId}, ${statementNumber}, ${lastFourDigits},
            ${statementDate}, ${isFirstStatement}
          )
        `;
        
        console.log(`[CreditCardAgent] Successfully recorded statement tracker for statement ${statementNumber}`);
      } catch (insertError: any) {
        // Check if it's a duplicate key error
        if (insertError.code === '23505') {
          console.log(`[CreditCardAgent] Statement tracker already exists for ${statementNumber}, skipping insert`);
        } else {
          console.error('[CreditCardAgent] Error inserting statement tracker:', insertError);
          // Don't throw - this shouldn't block the main processing
        }
      }

    } catch (error) {
      console.error('[CreditCardAgent] Error recording statement tracker:', error);
      // Don't throw error - this shouldn't block the main processing
    }
  }
}

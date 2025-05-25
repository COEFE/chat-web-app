import { AgentContext } from "@/types/agents";
import { CreditCardAgent } from "./creditCardAgent";
import { sql } from "@vercel/postgres";

/**
 * Enhanced processing methods for CreditCardAgent that integrate beginning balance functionality
 */
export class CreditCardAgentEnhancedProcessing {
  private creditCardAgent: CreditCardAgent;

  constructor(creditCardAgent: CreditCardAgent) {
    this.creditCardAgent = creditCardAgent;
  }

  /**
   * Enhanced account creation that handles beginning balances and statement tracking
   */
  async findOrCreateCreditCardAccountWithBeginningBalance(
    context: AgentContext,
    statementInfo: any,
    query: string
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
        return {
          success: false,
          message: `This statement has already been processed: ${isDuplicate.message}`
        };
      }

      // Step 2: Use beginning balance extension for enhanced processing
      const beginningBalanceResult = await this.creditCardAgent.processStatementWithBeginningBalance(
        context,
        query,
        { extractedData: { statementInfo } }
      );

      if (!beginningBalanceResult.success) {
        return beginningBalanceResult;
      }

      // Step 3: Record statement in tracker table
      if (beginningBalanceResult.accountId) {
        await this.recordStatementTracker(context, statementInfo, beginningBalanceResult.accountId);
      }

      return beginningBalanceResult;

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
        SELECT id, statement_number, last_four_digits, statement_date 
        FROM statement_trackers 
        WHERE user_id = ${context.userId}
        AND (
          (statement_number = ${statementNumber} AND statement_number != 'unknown')
          OR (last_four_digits = ${lastFourDigits} AND last_four_digits != 'unknown')
        )
        LIMIT 1
      `;

      if (rows.length > 0) {
        const existing = rows[0];
        return {
          isDuplicate: true,
          message: `Statement already processed: ${existing.statement_number} (${existing.last_four_digits}) on ${existing.statement_date}`
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
    accountId: number
  ): Promise<void> {
    try {
      if (!context.userId) {
        console.warn('[CreditCardAgent] Cannot record statement tracker: missing user ID');
        return;
      }

      const statementNumber = statementInfo.statementNumber || 'unknown';
      const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
      const statementDate = statementInfo.statementDate || new Date().toISOString().split('T')[0];
      const balance = statementInfo.balance || 0;

      console.log(`[CreditCardAgent] Recording statement tracker: ${statementNumber} for account ${accountId}`);

      // Create statement_trackers table if it doesn't exist
      await sql`
        CREATE TABLE IF NOT EXISTS statement_trackers (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          account_id INTEGER NOT NULL,
          statement_number TEXT NOT NULL,
          last_four_digits TEXT NOT NULL,
          statement_date DATE NOT NULL,
          balance DECIMAL(10,2),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, account_id, statement_number)
        )
      `;

      // Insert the statement tracker record
      await sql`
        INSERT INTO statement_trackers (
          user_id, account_id, statement_number, last_four_digits, 
          statement_date, balance
        ) VALUES (
          ${context.userId}, ${accountId}, ${statementNumber}, ${lastFourDigits},
          ${statementDate}, ${balance}
        )
        ON CONFLICT (user_id, account_id, statement_number) 
        DO UPDATE SET 
          last_four_digits = EXCLUDED.last_four_digits,
          statement_date = EXCLUDED.statement_date,
          balance = EXCLUDED.balance
      `;

      console.log(`[CreditCardAgent] Successfully recorded statement tracker for statement ${statementNumber}`);

    } catch (error) {
      console.error('[CreditCardAgent] Error recording statement tracker:', error);
      // Don't throw error - this shouldn't block the main processing
    }
  }
}

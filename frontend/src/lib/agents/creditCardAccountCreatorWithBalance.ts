import { AgentContext } from "@/types/agents";
import { sql } from "@vercel/postgres";
import { CreditCardBeginningBalanceIntegration } from "./creditCardBeginningBalanceIntegration";

/**
 * Handles credit card account creation with beginning balance integration
 */
export class CreditCardAccountCreatorWithBalance {
  private beginningBalanceIntegration: CreditCardBeginningBalanceIntegration;

  constructor() {
    this.beginningBalanceIntegration = new CreditCardBeginningBalanceIntegration();
  }

  /**
   * Create a new credit card account and record beginning balance if provided
   */
  async createAccountWithBeginningBalance(
    context: AgentContext,
    accountName: string,
    accountCode: string,
    accountNotes: string,
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
      console.log(`[CreditCardAccountCreator] Creating account: ${accountName} with beginning balance integration`);

      // Step 1: Create the account
      const insertResult = await sql`
        INSERT INTO accounts (name, code, account_type, notes, user_id, is_active) 
        VALUES (${accountName}, ${accountCode}, 'credit_card', ${accountNotes}, ${
        context.userId || null
      }, true) 
        RETURNING id
      `;

      if (insertResult.rows.length === 0) {
        return {
          success: false,
          message: "Failed to create credit card account in database"
        };
      }

      const newAccountId = insertResult.rows[0].id;
      console.log(`[CreditCardAccountCreator] Successfully created account: ${accountName} (ID: ${newAccountId})`);

      // Step 2: Record beginning balance if available
      let beginningBalanceRecorded = false;
      let beginningBalanceMessage = 'No beginning balance to record';

      // For first statements, use current balance as beginning balance if previousBalance not available
      const beginningBalanceAmount = statementInfo.previousBalance || statementInfo.balance;

      if (beginningBalanceAmount && beginningBalanceAmount > 0) {
        console.log(`[CreditCardAccountCreator] Recording beginning balance of ${beginningBalanceAmount} for new account`);
        console.log(`[CreditCardAccountCreator] Using ${statementInfo.previousBalance ? 'previousBalance' : 'current balance'} as beginning balance`);
        
        try {
          const balanceResult = await this.beginningBalanceIntegration.recordBeginningBalance(
            context,
            accountName,
            'credit_card',
            beginningBalanceAmount,
            statementInfo.statementDate || new Date().toISOString().split('T')[0],
            newAccountId
          );

          beginningBalanceRecorded = balanceResult.success;
          beginningBalanceMessage = balanceResult.message;

          if (balanceResult.success) {
            console.log(`[CreditCardAccountCreator] Successfully recorded beginning balance for account ${newAccountId}`);
          } else {
            console.error(`[CreditCardAccountCreator] Failed to record beginning balance: ${balanceResult.message}`);
          }
        } catch (error) {
          console.error('[CreditCardAccountCreator] Error recording beginning balance:', error);
          beginningBalanceRecorded = false;
          beginningBalanceMessage = `Error recording beginning balance: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
      } else {
        beginningBalanceMessage = 'No valid balance amount found for beginning balance';
      }

      return {
        success: true,
        message: `Created new credit card account: ${accountName}`,
        accountId: newAccountId,
        accountName: accountName,
        beginningBalanceRecorded,
        beginningBalanceMessage
      };

    } catch (error) {
      console.error('[CreditCardAccountCreator] Error creating account with beginning balance:', error);
      return {
        success: false,
        message: `Error creating account: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

import { AgentContext } from "@/types/agents";
import { CreditCardStartingBalanceExtractor, EnhancedStatementInfo } from "./creditCardStartingBalanceExtractor";
import { sql } from "@vercel/postgres";

/**
 * Integration module for handling credit card beginning balances
 * Coordinates between statement extraction and GL Agent for proper balance recording
 */
export class CreditCardBeginningBalanceIntegration {
  private startingBalanceExtractor: CreditCardStartingBalanceExtractor;

  constructor() {
    this.startingBalanceExtractor = new CreditCardStartingBalanceExtractor();
  }

  /**
   * Enhanced statement processing that captures beginning balance
   */
  async processStatementWithBeginningBalance(
    query: string,
    context: AgentContext,
    documentContext?: any
  ): Promise<EnhancedStatementInfo> {
    console.log('[CreditCardBeginningBalanceIntegration] Processing statement with beginning balance extraction');
    
    try {
      // Use the enhanced extractor to get statement info including beginning balance
      const enhancedInfo = await this.startingBalanceExtractor.extractEnhancedStatementInfo(
        query,
        documentContext
      );

      console.log('[CreditCardBeginningBalanceIntegration] Enhanced extraction result:', {
        success: enhancedInfo.success,
        hasBeginningBalance: !!enhancedInfo.previousBalance,
        beginningBalance: enhancedInfo.previousBalance,
        currentBalance: enhancedInfo.balance,
        statementDate: enhancedInfo.statementDate,
        transactionCount: enhancedInfo.transactions?.length || 0
      });

      return enhancedInfo;
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error in enhanced statement processing:', error);
      
      // Return error state
      return {
        success: false,
        message: `Error processing statement with beginning balance: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * Check if this is the first statement for a credit card account
   */
  async isFirstStatementForAccount(
    context: AgentContext,
    accountId: number,
    statementDate: string
  ): Promise<boolean> {
    try {
      console.log(`[CreditCardBeginningBalanceIntegration] Checking if this is first statement for account ${accountId}`);
      
      // Check if there are any existing journal entries for this credit card account
      const { rows } = await sql`
        SELECT COUNT(*) as entry_count
        FROM journal_lines jl
        JOIN accounts a ON jl.account_id = a.id
        WHERE a.id = ${accountId}
        AND a.user_id = ${context.userId}
        AND jl.description NOT LIKE '%starting balance%'
        AND jl.description NOT LIKE '%beginning balance%'
      `;

      const entryCount = parseInt(rows[0]?.entry_count || '0');
      const isFirstStatement = entryCount === 0;
      
      console.log(`[CreditCardBeginningBalanceIntegration] Account ${accountId} has ${entryCount} existing entries. Is first statement: ${isFirstStatement}`);
      
      return isFirstStatement;
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error checking first statement status:', error);
      // If we can't determine, assume it's not the first to avoid duplicate entries
      return false;
    }
  }

  /**
   * Record beginning balance through GL Agent
   */
  async recordBeginningBalance(
    context: AgentContext,
    accountName: string,
    accountType: string,
    beginningBalance: number,
    statementDate: string,
    accountId?: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`[CreditCardBeginningBalanceIntegration] Recording beginning balance for ${accountName}: $${beginningBalance}`);
      
      // Import GL Agent dynamically to avoid circular dependencies
      const { GLAgent } = await import('./glAgent');
      const glAgent = new GLAgent();
      
      // Create GL Agent message for beginning balance
      const glMessage = {
        id: `beginning-balance-${Date.now()}`,
        userId: context.userId,
        sender: 'CreditCardAgent',
        type: 'GL_ACCOUNT_CREATION' as const,
        payload: {
          suggestedName: accountName,
          accountType: accountType,
          description: `Beginning balance entry for ${accountName}`,
          expenseType: 'credit_card',
          startingBalance: beginningBalance.toString(),
          balanceDate: statementDate,
          isBeginningBalance: true
        }
      };

      console.log('[CreditCardBeginningBalanceIntegration] Sending beginning balance request to GL Agent:', glMessage);
      
      // Send to GL Agent
      const glResponse = await glAgent.processRequest(context);
      
      if (glResponse && typeof glResponse === 'object' && 'payload' in glResponse) {
        const responsePayload = glResponse.payload as any;
        
        if (responsePayload?.success) {
          console.log('[CreditCardBeginningBalanceIntegration] GL Agent successfully recorded beginning balance');
          
          return {
            success: true,
            message: `Beginning balance of $${beginningBalance.toFixed(2)} recorded for ${accountName} as of ${statementDate}`
          };
        } else {
          console.error('[CreditCardBeginningBalanceIntegration] GL Agent failed to record beginning balance:', responsePayload?.message);
          return {
            success: false,
            message: `Failed to record beginning balance: ${responsePayload?.message || 'Unknown error'}`
          };
        }
      } else {
        console.error('[CreditCardBeginningBalanceIntegration] Invalid response from GL Agent:', glResponse);
        return {
          success: false,
          message: 'Invalid response from GL Agent when recording beginning balance'
        };
      }
      
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error recording beginning balance:', error);
      return {
        success: false,
        message: `Error recording beginning balance: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }

  /**
   * Complete integration: process statement and record beginning balance if needed
   */
  async processStatementWithBeginningBalanceIntegration(
    query: string,
    context: AgentContext,
    accountId: number,
    accountName: string,
    documentContext?: any
  ): Promise<{
    statementInfo: EnhancedStatementInfo;
    beginningBalanceRecorded: boolean;
    beginningBalanceMessage?: string;
  }> {
    try {
      console.log(`[CreditCardBeginningBalanceIntegration] Starting complete integration for account ${accountName} (${accountId})`);
      
      // Step 1: Extract enhanced statement information
      const statementInfo = await this.processStatementWithBeginningBalance(
        query,
        context,
        documentContext
      );

      if (!statementInfo.success) {
        return {
          statementInfo,
          beginningBalanceRecorded: false,
          beginningBalanceMessage: 'Failed to extract statement information'
        };
      }

      // Step 2: Check if we have a beginning balance and if this is the first statement
      if (!statementInfo.previousBalance || statementInfo.previousBalance === 0) {
        console.log('[CreditCardBeginningBalanceIntegration] No beginning balance found in statement');
        return {
          statementInfo,
          beginningBalanceRecorded: false,
          beginningBalanceMessage: 'No beginning balance found in statement'
        };
      }

      // Step 3: Check if this is the first statement for this account
      const isFirstStatement = await this.isFirstStatementForAccount(
        context,
        accountId,
        statementInfo.statementDate || new Date().toISOString().split('T')[0]
      );

      if (!isFirstStatement) {
        console.log('[CreditCardBeginningBalanceIntegration] Not the first statement, skipping beginning balance recording');
        return {
          statementInfo,
          beginningBalanceRecorded: false,
          beginningBalanceMessage: 'Beginning balance not recorded - not the first statement for this account'
        };
      }

      // Step 4: Record the beginning balance
      console.log(`[CreditCardBeginningBalanceIntegration] Recording beginning balance: $${statementInfo.previousBalance}`);
      
      const balanceResult = await this.recordBeginningBalance(
        context,
        accountName,
        'liability', // Credit cards are liability accounts
        statementInfo.previousBalance,
        statementInfo.statementDate || new Date().toISOString().split('T')[0],
        accountId
      );

      return {
        statementInfo,
        beginningBalanceRecorded: balanceResult.success,
        beginningBalanceMessage: balanceResult.message
      };

    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error in complete integration:', error);
      
      return {
        statementInfo: {
          success: false,
          message: `Error in beginning balance integration: ${error instanceof Error ? error.message : "Unknown error"}`
        },
        beginningBalanceRecorded: false,
        beginningBalanceMessage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
      };
    }
  }
}

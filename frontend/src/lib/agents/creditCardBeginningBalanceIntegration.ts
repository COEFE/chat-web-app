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
      
      // FIRST: Check statement_trackers table - if any statements have been processed for this account, it's not the first
      const { rows: trackerRows } = await sql`
        SELECT COUNT(*) as tracker_count
        FROM statement_trackers
        WHERE account_id = ${accountId}
        AND user_id = ${context.userId}
      `;

      const trackerCount = parseInt(trackerRows[0]?.tracker_count || '0');
      
      if (trackerCount > 0) {
        console.log(`[CreditCardBeginningBalanceIntegration] Account ${accountId} has ${trackerCount} processed statements in tracker. Not first statement.`);
        return false;
      }
      
      // SECOND: Check if there are any existing journal entries for this credit card account
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
      
      console.log(`[CreditCardBeginningBalanceIntegration] Account ${accountId} has ${entryCount} existing journal entries. Is first statement: ${isFirstStatement}`);
      
      return isFirstStatement;
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error checking first statement status:', error);
      // If we can't determine, assume it's not the first to avoid duplicate entries
      return false;
    }
  }

  /**
   * Check if a beginning balance has already been recorded for this account
   */
  async hasBeginningBalanceBeenRecorded(
    context: AgentContext,
    accountId: number
  ): Promise<boolean> {
    try {
      console.log(`[CreditCardBeginningBalanceIntegration] Checking if beginning balance exists for account ${accountId}`);
      
      const { rows } = await sql`
        SELECT COUNT(*) as balance_count
        FROM journal_lines jl
        JOIN accounts a ON jl.account_id = a.id
        WHERE a.id = ${accountId}
        AND a.user_id = ${context.userId}
        AND (jl.description LIKE '%starting balance%' OR jl.description LIKE '%beginning balance%')
      `;

      const balanceCount = parseInt(rows[0]?.balance_count || '0');
      const hasBeginningBalance = balanceCount > 0;
      
      console.log(`[CreditCardBeginningBalanceIntegration] Account ${accountId} has ${balanceCount} beginning balance entries. Has beginning balance: ${hasBeginningBalance}`);
      
      return hasBeginningBalance;
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error checking beginning balance status:', error);
      // If we can't determine, assume it exists to avoid duplicate entries
      return true;
    }
  }

  /**
   * Record beginning balance through direct journal entry creation
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
      
      if (!accountId) {
        return {
          success: false,
          message: 'Account ID is required to record beginning balance'
        };
      }

      // Create journal entry directly for beginning balance
      const memo = `Beginning balance for ${accountName} as of ${statementDate}`;
      
      // Create journal header
      const journalInsertQuery = `
        INSERT INTO journals (
          transaction_date, memo, journal_type, is_posted, created_by, source, user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
      `;

      const journalResult = await sql.query(journalInsertQuery, [
        statementDate,
        memo,
        "BB", // journal_type for Beginning Balance
        true, // is_posted = true
        context.userId, // created_by
        "cc_agent", // source
        context.userId, // user_id for proper data isolation
      ]);

      const journalId = journalResult.rows[0].id;
      console.log(`[CreditCardBeginningBalanceIntegration] Created journal header with ID: ${journalId}`);

      // Find or create Opening Balance Equity account
      let equityAccountId: number;
      
      const equityAccountResult = await sql`
        SELECT id FROM accounts 
        WHERE name ILIKE '%opening balance equity%' 
        AND user_id = ${context.userId}
        AND is_active = true
        LIMIT 1
      `;

      if (equityAccountResult.rows.length > 0) {
        equityAccountId = equityAccountResult.rows[0].id;
        console.log(`[CreditCardBeginningBalanceIntegration] Found existing Opening Balance Equity account: ${equityAccountId}`);
      } else {
        // Create Opening Balance Equity account
        const createEquityResult = await sql`
          INSERT INTO accounts (name, code, account_type, notes, user_id, is_active) 
          VALUES ('Opening Balance Equity', '30000', 'equity', 'Equity account for beginning balances', ${context.userId}, true) 
          RETURNING id
        `;
        equityAccountId = createEquityResult.rows[0].id;
        console.log(`[CreditCardBeginningBalanceIntegration] Created Opening Balance Equity account: ${equityAccountId}`);
      }

      // Create journal lines for beginning balance
      // Credit Card Liability: Credit (increase liability)
      // Opening Balance Equity: Debit (decrease equity)
      
      const journalLinesInsertQuery = `
        INSERT INTO journal_lines (
          journal_id, account_id, description, debit, credit, user_id
        )
        VALUES 
          ($1, $2, $3, $4, $5, $6),
          ($7, $8, $9, $10, $11, $12)
      `;

      await sql.query(journalLinesInsertQuery, [
        // Credit Card Account - Credit (increase liability)
        journalId,
        accountId,
        `Beginning balance - ${accountName}`,
        0, // debit
        beginningBalance, // credit
        context.userId,
        // Opening Balance Equity - Debit (decrease equity)
        journalId,
        equityAccountId,
        `Beginning balance offset - ${accountName}`,
        beginningBalance, // debit
        0, // credit
        context.userId
      ]);

      console.log(`[CreditCardBeginningBalanceIntegration] Successfully created beginning balance journal entry`);
      
      return {
        success: true,
        message: `Beginning balance of $${beginningBalance.toFixed(2)} recorded for ${accountName} as of ${statementDate}`
      };
      
    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error recording beginning balance:', error);
      return {
        success: false,
        message: `Error recording beginning balance: ${error instanceof Error ? error.message : 'Unknown error'}`
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
    isFirstStatement?: boolean;
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
          beginningBalanceMessage: 'Failed to extract statement information',
          isFirstStatement: false
        };
      }

      // Step 2: Check if we have a beginning balance and if this is the first statement
      if (!statementInfo.previousBalance || statementInfo.previousBalance === 0) {
        console.log('[CreditCardBeginningBalanceIntegration] No beginning balance found in statement');
        return {
          statementInfo,
          beginningBalanceRecorded: false,
          beginningBalanceMessage: 'No beginning balance found in statement',
          isFirstStatement: false
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
          beginningBalanceMessage: 'Beginning balance not recorded - not the first statement for this account',
          isFirstStatement
        };
      }

      // Step 4: Check if a beginning balance has already been recorded for this account
      const hasBeginningBalanceBeenRecorded = await this.hasBeginningBalanceBeenRecorded(
        context,
        accountId
      );

      if (hasBeginningBalanceBeenRecorded) {
        console.log('[CreditCardBeginningBalanceIntegration] Beginning balance already recorded, skipping');
        return {
          statementInfo,
          beginningBalanceRecorded: false,
          beginningBalanceMessage: 'Beginning balance already recorded',
          isFirstStatement
        };
      }

      // Step 5: Record the beginning balance
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
        beginningBalanceMessage: balanceResult.message,
        isFirstStatement
      };

    } catch (error) {
      console.error('[CreditCardBeginningBalanceIntegration] Error in complete integration:', error);
      
      return {
        statementInfo: {
          success: false,
          message: `Error in beginning balance integration: ${error instanceof Error ? error.message : "Unknown error"}`
        },
        beginningBalanceRecorded: false,
        beginningBalanceMessage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        isFirstStatement: false
      };
    }
  }
}

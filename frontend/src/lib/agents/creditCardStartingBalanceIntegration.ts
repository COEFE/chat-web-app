import { CreditCardStartingBalanceExtractor, EnhancedStatementInfo } from './creditCardStartingBalanceExtractor';
import { CreditCardTransaction } from "../../types/creditCard";
import { sql } from "@vercel/postgres";

/**
 * Integration utilities for starting balance functionality
 */
export class CreditCardStartingBalanceIntegration {
  private extractor: CreditCardStartingBalanceExtractor;

  constructor() {
    this.extractor = new CreditCardStartingBalanceExtractor();
  }

  /**
   * Process a credit card statement with enhanced starting balance handling
   */
  async processStatementWithStartingBalance(
    query: string,
    documentContext?: any,
    userId?: string
  ): Promise<{
    success: boolean;
    message: string;
    statementInfo?: EnhancedStatementInfo;
    startingBalanceJournalEntry?: any;
    transactionJournalEntries?: any[];
  }> {
    try {
      console.log("[CreditCardStartingBalanceIntegration] Processing statement with starting balance");

      // Extract enhanced statement information
      const statementInfo = await this.extractor.extractEnhancedStatementInfo(
        query,
        documentContext
      );

      if (!statementInfo.success) {
        return {
          success: false,
          message: statementInfo.message,
        };
      }

      // Validate balance consistency
      const validation = this.extractor.validateBalanceConsistency(statementInfo);
      console.log(`[CreditCardStartingBalanceIntegration] Balance validation: ${validation.message}`);

      if (!validation.isValid) {
        console.warn(`[CreditCardStartingBalanceIntegration] Warning: ${validation.message}`);
      }

      // Log the extracted balance information
      console.log("[CreditCardStartingBalanceIntegration] Extracted balance information:");
      console.log(`- Previous Balance: $${statementInfo.previousBalance?.toFixed(2) || "Not found"}`);
      console.log(`- New Charges: $${statementInfo.newCharges?.toFixed(2) || "Not found"}`);
      console.log(`- Payments: $${statementInfo.payments?.toFixed(2) || "Not found"}`);
      console.log(`- Credits: $${statementInfo.credits?.toFixed(2) || "Not found"}`);
      console.log(`- New Balance: $${statementInfo.balance?.toFixed(2) || "Not found"}`);

      return {
        success: true,
        message: "Statement processed successfully with starting balance information",
        statementInfo,
      };
    } catch (error) {
      console.error("[CreditCardStartingBalanceIntegration] Error processing statement:", error);
      return {
        success: false,
        message: `Error processing statement: ${error}`,
      };
    }
  }

  /**
   * Create a starting balance journal entry for a credit card account
   */
  async createStartingBalanceJournalEntry(
    accountId: number,
    accountCode: string,
    accountName: string,
    previousBalance: number,
    statementDate: string,
    userId?: string
  ): Promise<{
    success: boolean;
    message: string;
    journalEntryId?: number;
  }> {
    try {
      console.log(`[CreditCardStartingBalanceIntegration] Creating starting balance journal entry for account ${accountCode}`);
      console.log(`- Account: ${accountName} (${accountCode})`);
      console.log(`- Starting Balance: $${previousBalance.toFixed(2)}`);
      console.log(`- Statement Date: ${statementDate}`);

      if (previousBalance === 0) {
        console.log("[CreditCardStartingBalanceIntegration] Starting balance is $0.00, skipping journal entry creation");
        return {
          success: true,
          message: "Starting balance is $0.00, no journal entry needed",
        };
      }

      // Create the journal entry for the starting balance
      const journalEntry = await sql`
        INSERT INTO journal_entries (
          date,
          reference,
          description,
          debit_account_id,
          credit_account_id,
          amount,
          is_posted,
          journal_type,
          created_by
        ) VALUES (
          ${statementDate},
          ${`STARTING-${accountCode}-${statementDate}`},
          ${`Starting balance for ${accountName} as of ${statementDate}`},
          ${accountId}, -- Credit card liability account (debit increases the liability)
          NULL, -- No specific credit account for starting balance
          ${Math.abs(previousBalance)},
          true,
          'CCB', -- Credit Card Beginning Balance
          ${userId || 'system'}
        )
        RETURNING id
      `;

      const journalEntryId = journalEntry.rows[0]?.id;

      console.log(`[CreditCardStartingBalanceIntegration] Created starting balance journal entry ID: ${journalEntryId}`);

      return {
        success: true,
        message: `Starting balance journal entry created successfully (ID: ${journalEntryId})`,
        journalEntryId,
      };
    } catch (error) {
      console.error("[CreditCardStartingBalanceIntegration] Error creating starting balance journal entry:", error);
      return {
        success: false,
        message: `Error creating starting balance journal entry: ${error}`,
      };
    }
  }

  /**
   * Check if a starting balance journal entry already exists for an account and date
   */
  async hasStartingBalanceEntry(
    accountId: number,
    statementDate: string
  ): Promise<boolean> {
    try {
      const result = await sql`
        SELECT id FROM journal_entries
        WHERE debit_account_id = ${accountId}
        AND date = ${statementDate}
        AND journal_type = 'CCB'
        AND reference LIKE 'STARTING-%'
        LIMIT 1
      `;

      return result.rows.length > 0;
    } catch (error) {
      console.error("[CreditCardStartingBalanceIntegration] Error checking for existing starting balance entry:", error);
      return false;
    }
  }

  /**
   * Process transactions after establishing the starting balance
   */
  async processTransactionsAfterStartingBalance(
    accountId: number,
    accountCode: string,
    accountName: string,
    transactions: CreditCardTransaction[],
    statementDate: string,
    userId?: string
  ): Promise<{
    success: boolean;
    message: string;
    processedTransactions: number;
    journalEntryIds: number[];
  }> {
    try {
      console.log(`[CreditCardStartingBalanceIntegration] Processing ${transactions.length} transactions after starting balance`);

      const journalEntryIds: number[] = [];
      let processedCount = 0;

      for (const transaction of transactions) {
        try {
          // Determine the appropriate journal type based on transaction
          let journalType = 'CCP'; // Default to Credit Card Purchase
          if (transaction.amount < 0) {
            journalType = 'CCY'; // Credit Card Payment
          }

          // Create journal entry for the transaction
          const journalEntry = await sql`
            INSERT INTO journal_entries (
              date,
              reference,
              description,
              debit_account_id,
              credit_account_id,
              amount,
              is_posted,
              journal_type,
              created_by
            ) VALUES (
              ${transaction.date},
              ${`CC-${accountCode}-${transaction.date}-${processedCount + 1}`},
              ${transaction.description},
              ${transaction.amount > 0 ? accountId : null}, -- Debit credit card for purchases
              ${transaction.amount < 0 ? accountId : null}, -- Credit credit card for payments
              ${Math.abs(transaction.amount)},
              true,
              ${journalType},
              ${userId || 'system'}
            )
            RETURNING id
          `;

          const journalEntryId = journalEntry.rows[0]?.id;
          if (journalEntryId) {
            journalEntryIds.push(journalEntryId);
            processedCount++;
          }

          console.log(`[CreditCardStartingBalanceIntegration] Processed transaction: ${transaction.description} - $${transaction.amount} (Journal ID: ${journalEntryId})`);
        } catch (transactionError) {
          console.error(`[CreditCardStartingBalanceIntegration] Error processing transaction: ${transaction.description}`, transactionError);
        }
      }

      return {
        success: true,
        message: `Processed ${processedCount} transactions successfully`,
        processedTransactions: processedCount,
        journalEntryIds,
      };
    } catch (error) {
      console.error("[CreditCardStartingBalanceIntegration] Error processing transactions:", error);
      return {
        success: false,
        message: `Error processing transactions: ${error}`,
        processedTransactions: 0,
        journalEntryIds: [],
      };
    }
  }

  /**
   * Complete workflow: Process statement with starting balance and create all necessary journal entries
   */
  async processCompleteStatementWorkflow(
    query: string,
    documentContext?: any,
    userId?: string,
    accountId?: number,
    accountCode?: string,
    accountName?: string
  ): Promise<{
    success: boolean;
    message: string;
    statementInfo?: EnhancedStatementInfo;
    startingBalanceJournalId?: number;
    transactionJournalIds?: number[];
    totalTransactionsProcessed?: number;
  }> {
    try {
      console.log("[CreditCardStartingBalanceIntegration] Starting complete statement workflow");

      // Step 1: Extract statement information with starting balance
      const statementResult = await this.processStatementWithStartingBalance(
        query,
        documentContext,
        userId
      );

      if (!statementResult.success || !statementResult.statementInfo) {
        return {
          success: false,
          message: statementResult.message,
        };
      }

      const statementInfo = statementResult.statementInfo;
      let startingBalanceJournalId: number | undefined;
      let transactionJournalIds: number[] = [];

      // Step 2: Create starting balance journal entry if we have a previous balance and account info
      if (
        statementInfo.previousBalance !== undefined &&
        statementInfo.previousBalance !== 0 &&
        accountId &&
        accountCode &&
        accountName &&
        statementInfo.statementDate
      ) {
        // Check if starting balance entry already exists
        const hasExisting = await this.hasStartingBalanceEntry(
          accountId,
          statementInfo.statementDate
        );

        if (!hasExisting) {
          const startingBalanceResult = await this.createStartingBalanceJournalEntry(
            accountId,
            accountCode,
            accountName,
            statementInfo.previousBalance,
            statementInfo.statementDate,
            userId
          );

          if (startingBalanceResult.success) {
            startingBalanceJournalId = startingBalanceResult.journalEntryId;
          } else {
            console.warn(`[CreditCardStartingBalanceIntegration] Warning: ${startingBalanceResult.message}`);
          }
        } else {
          console.log("[CreditCardStartingBalanceIntegration] Starting balance entry already exists, skipping");
        }
      }

      // Step 3: Process individual transactions
      if (
        statementInfo.transactions &&
        statementInfo.transactions.length > 0 &&
        accountId &&
        accountCode &&
        accountName &&
        statementInfo.statementDate
      ) {
        const transactionResult = await this.processTransactionsAfterStartingBalance(
          accountId,
          accountCode,
          accountName,
          statementInfo.transactions,
          statementInfo.statementDate,
          userId
        );

        if (transactionResult.success) {
          transactionJournalIds = transactionResult.journalEntryIds;
        }
      }

      return {
        success: true,
        message: `Complete statement workflow processed successfully. Starting balance: $${statementInfo.previousBalance?.toFixed(2) || "0.00"}, Transactions: ${statementInfo.transactions?.length || 0}`,
        statementInfo,
        startingBalanceJournalId,
        transactionJournalIds,
        totalTransactionsProcessed: transactionJournalIds.length,
      };
    } catch (error) {
      console.error("[CreditCardStartingBalanceIntegration] Error in complete workflow:", error);
      return {
        success: false,
        message: `Error in complete workflow: ${error}`,
      };
    }
  }
}

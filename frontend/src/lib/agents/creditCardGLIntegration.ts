import { CreditCardStartingBalanceIntegration } from './creditCardStartingBalanceIntegration';
import { EnhancedStatementInfo } from './creditCardStartingBalanceExtractor';
import { AgentContext } from "@/types/agents";
import { sql } from "@vercel/postgres";
import { createGLAccount } from "@/lib/glUtils";
import { generateIntelligentGLCode } from './aiGLCodeGenerator';

/**
 * Enhanced integration between Credit Card Agent and GL Agent that properly handles starting balances
 */
export class CreditCardGLIntegration {
  private startingBalanceIntegration: CreditCardStartingBalanceIntegration;

  constructor() {
    this.startingBalanceIntegration = new CreditCardStartingBalanceIntegration();
  }

  /**
   * Create a credit card GL account with starting balance from statement
   */
  async createCreditCardAccountWithStartingBalance(
    context: AgentContext,
    statementInfo: EnhancedStatementInfo,
    accountName: string,
    accountCode?: string
  ): Promise<{
    success: boolean;
    message: string;
    accountId?: number;
    accountCode?: string;
    accountName?: string;
    startingBalanceJournalId?: number;
  }> {
    try {
      console.log("[CreditCardGLIntegration] Creating credit card account with starting balance");
      console.log(`- Account Name: ${accountName}`);
      console.log(`- Starting Balance: $${statementInfo.previousBalance?.toFixed(2) || "0.00"}`);
      console.log(`- Statement Date: ${statementInfo.statementDate || "Not provided"}`);

      // Generate account code if not provided
      if (!accountCode) {
        accountCode = await this.generateCreditCardAccountCode();
      }

      // Determine account type (credit cards are liabilities)
      const accountType = 'liability';

      // Create the GL account with starting balance
      const accountResult = await createGLAccount(
        accountCode,
        accountName,
        `Credit card account for ${statementInfo.creditCardIssuer || "Unknown Issuer"} ending in ${statementInfo.lastFourDigits || "XXXX"}`,
        context.userId,
        statementInfo.previousBalance || 0, // Pass the starting balance from the statement
        statementInfo.statementDate, // Use statement date as balance date
        accountType
      );

      if (!accountResult.success) {
        console.error("[CreditCardGLIntegration] Failed to create GL account:", accountResult.message);
        return {
          success: false,
          message: accountResult.message,
        };
      }

      console.log(`[CreditCardGLIntegration] Successfully created GL account: ${accountResult.account?.name} (${accountResult.account?.code})`);
      
      if (accountResult.journalId) {
        console.log(`[CreditCardGLIntegration] Starting balance journal entry created with ID: ${accountResult.journalId}`);
      }

      return {
        success: true,
        message: `Credit card account created successfully with starting balance of $${statementInfo.previousBalance?.toFixed(2) || "0.00"}`,
        accountId: accountResult.account?.id,
        accountCode: accountResult.account?.code,
        accountName: accountResult.account?.name,
        startingBalanceJournalId: accountResult.journalId,
      };
    } catch (error) {
      console.error("[CreditCardGLIntegration] Error creating credit card account with starting balance:", error);
      return {
        success: false,
        message: `Error creating credit card account: ${error}`,
      };
    }
  }

  /**
   * Process complete credit card statement with GL account creation and starting balance
   */
  async processStatementWithGLAccountCreation(
    context: AgentContext,
    query: string,
    documentContext?: any
  ): Promise<{
    success: boolean;
    message: string;
    statementInfo?: EnhancedStatementInfo;
    accountId?: number;
    accountCode?: string;
    accountName?: string;
    startingBalanceJournalId?: number;
    transactionJournalIds?: number[];
  }> {
    try {
      console.log("[CreditCardGLIntegration] Processing statement with GL account creation");

      // Step 1: Extract enhanced statement information
      const statementResult = await this.startingBalanceIntegration.processStatementWithStartingBalance(
        query,
        documentContext,
        context.userId
      );

      if (!statementResult.success || !statementResult.statementInfo) {
        return {
          success: false,
          message: statementResult.message,
        };
      }

      const statementInfo = statementResult.statementInfo;

      // Step 2: Generate account name based on statement info
      const accountName = this.generateAccountName(statementInfo);
      
      // Step 3: Check if account already exists
      const existingAccount = await this.findExistingCreditCardAccount(
        statementInfo.creditCardIssuer,
        statementInfo.lastFourDigits
      );

      let accountId: number;
      let accountCode: string;
      let finalAccountName: string;
      let startingBalanceJournalId: number | undefined;

      if (existingAccount) {
        console.log(`[CreditCardGLIntegration] Found existing account: ${existingAccount.name} (${existingAccount.code})`);
        accountId = existingAccount.id;
        accountCode = existingAccount.code;
        finalAccountName = existingAccount.name;

        // Check if we need to create a starting balance entry for this statement period
        if (statementInfo.previousBalance && statementInfo.previousBalance !== 0 && statementInfo.statementDate) {
          const hasExisting = await this.startingBalanceIntegration.hasStartingBalanceEntry(
            accountId,
            statementInfo.statementDate
          );

          if (!hasExisting) {
            const startingBalanceResult = await this.startingBalanceIntegration.createStartingBalanceJournalEntry(
              accountId,
              accountCode,
              finalAccountName,
              statementInfo.previousBalance,
              statementInfo.statementDate,
              context.userId
            );

            if (startingBalanceResult.success) {
              startingBalanceJournalId = startingBalanceResult.journalEntryId;
            }
          }
        }
      } else {
        // Step 4: Create new GL account with starting balance
        const accountCreationResult = await this.createCreditCardAccountWithStartingBalance(
          context,
          statementInfo,
          accountName
        );

        if (!accountCreationResult.success) {
          return {
            success: false,
            message: accountCreationResult.message,
          };
        }

        accountId = accountCreationResult.accountId!;
        accountCode = accountCreationResult.accountCode!;
        finalAccountName = accountCreationResult.accountName!;
        startingBalanceJournalId = accountCreationResult.startingBalanceJournalId;
      }

      // Step 5: Process individual transactions
      let transactionJournalIds: number[] = [];
      if (statementInfo.transactions && statementInfo.transactions.length > 0) {
        const transactionResult = await this.startingBalanceIntegration.processTransactionsAfterStartingBalance(
          accountId,
          accountCode,
          finalAccountName,
          statementInfo.transactions,
          statementInfo.statementDate || new Date().toISOString().split('T')[0],
          context.userId
        );

        if (transactionResult.success) {
          transactionJournalIds = transactionResult.journalEntryIds;
        }
      }

      return {
        success: true,
        message: `Credit card statement processed successfully. Account: ${finalAccountName} (${accountCode}), Starting Balance: $${statementInfo.previousBalance?.toFixed(2) || "0.00"}, Transactions: ${transactionJournalIds.length}`,
        statementInfo,
        accountId,
        accountCode,
        accountName: finalAccountName,
        startingBalanceJournalId,
        transactionJournalIds,
      };
    } catch (error) {
      console.error("[CreditCardGLIntegration] Error processing statement with GL account creation:", error);
      return {
        success: false,
        message: `Error processing statement: ${error}`,
      };
    }
  }

  /**
   * Generate a credit card account name based on statement information
   */
  private generateAccountName(statementInfo: EnhancedStatementInfo): string {
    const issuer = statementInfo.creditCardIssuer || "Credit Card";
    const lastFour = statementInfo.lastFourDigits || "XXXX";
    return `${issuer} Credit Card (...${lastFour})`;
  }

  /**
   * Generate a unique account code for credit card accounts
   */
  private async generateCreditCardAccountCode(): Promise<string> {
    // Credit card accounts are liabilities (20000-29999 range)
    // Use 20000-29999 for credit card accounts
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts) {
      // Generate account code using AI-powered logic
      console.log('[CreditCardGLIntegration] Using AI-powered code generation for credit card account');
      const codeResult = await generateIntelligentGLCode({
        accountName: 'Credit Card Account',
        accountType: 'liability',
        description: `Credit card account for business expenses`,
        expenseType: 'credit_card',
        userId: undefined
      });

      const code = codeResult.success ? codeResult.code : `2${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
      
      if (codeResult.success) {
        console.log(`[CreditCardGLIntegration] AI generated code ${code} with ${codeResult.confidence} confidence`);
      } else {
        console.warn('[CreditCardGLIntegration] AI code generation failed, using fallback random code');
      }
      
      // Check if this code already exists
      const { rows: existing } = await sql`
        SELECT id FROM accounts WHERE code = ${code} LIMIT 1
      `;

      if (existing.length === 0) {
        return code;
      }

      attempts++;
    }

    // Fallback to timestamp-based code if all random attempts fail
    const timestamp = Date.now().toString().slice(-3);
    return `2${timestamp}`;
  }

  /**
   * Find existing credit card account by issuer and last four digits
   */
  private async findExistingCreditCardAccount(
    issuer?: string,
    lastFour?: string
  ): Promise<{ id: number; code: string; name: string } | null> {
    try {
      if (!issuer || !lastFour) {
        return null;
      }

      // Look for accounts with similar names
      const searchPattern = `%${issuer}%${lastFour}%`;
      
      const { rows: accounts } = await sql`
        SELECT id, code, name 
        FROM accounts 
        WHERE account_type = 'liability' 
        AND name ILIKE ${searchPattern}
        AND code LIKE '2%'
        LIMIT 1
      `;

      if (accounts.length > 0) {
        return accounts[0] as { id: number; code: string; name: string; };
      }

      return null;
    } catch (error) {
      console.error("[CreditCardGLIntegration] Error finding existing credit card account:", error);
      return null;
    }
  }

  /**
   * Update existing credit card agent to use the enhanced GL integration
   */
  static enhanceCreditCardAgentWithStartingBalance() {
    return {
      // Method to be called by the credit card agent when processing statements
      processStatementWithStartingBalance: async (
        context: AgentContext,
        query: string,
        documentContext?: any
      ) => {
        const integration = new CreditCardGLIntegration();
        return await integration.processStatementWithGLAccountCreation(
          context,
          query,
          documentContext
        );
      }
    };
  }
}

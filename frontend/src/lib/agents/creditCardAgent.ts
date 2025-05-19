import { sql } from '@vercel/postgres';
import { 
  sendAgentMessage, 
  respondToAgentMessage, 
  AgentMessageType, 
  MessagePriority, 
  MessageStatus,
  getMessageById,
  waitForAgentResponse
} from "@/lib/agentCommunication";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { 
  isStatementProcessed, 
  recordProcessedStatement, 
  hasStartingBalanceStatement, 
  findStatementByAccountIdentifiers 
} from '@/lib/accounting/statementTracker';
import { checkStatementStatus, processStatementViaApi } from '@/lib/accounting/statementUtils';
import { AgentContext, AgentResponse, Agent } from "@/types/agents";
import { CreditCardTransaction } from "../../types/creditCard";

/**
 * CreditCardAgent specializes in handling credit card statement related queries
 * It processes credit card statements, checks for existing accounts, and creates new ones if needed
 */
export class CreditCardAgent implements Agent {
  id = "credit_card_agent";
  name = "Credit Card Agent";
  description = "Handles credit card statements and account management";
  
  // Track statement processing information
  private pendingStatementProcessing: Record<string, {
    accountId: number;
    accountCode: string;
    accountName: string;
    statementNumber: string;
    statementDate: string;
    lastFour: string;
    balance: number;
    isStartingBalance: boolean;
  }> = {};
  
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }

  /**
   * Process a request directed to this agent
   * @param context The agent context
   * @returns Promise with agent response
   */
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    try {
      const query = context.query.trim();
      console.log(`[CreditCardAgent] Processing query: ${query}`);
      
      // Check if we have a PDF document context (from agent-chat route)
      if (context.documentContext && 
          context.documentContext.type === 'pdf' && 
          context.documentContext.content) {
        console.log(`[CreditCardAgent] Processing PDF document: ${context.documentContext.name}`);
        
        // Extract the PDF content and use it as the query
        const enhancedQuery = `Credit card statement from PDF: ${context.documentContext.name}\n\n${query}`;
        
        // Process the statement with the enhanced query
        return this.processStatement(context, enhancedQuery);
      }
      
      // Check if this is a credit card statement
      if (this.isCreditCardStatement(query)) {
        return this.processStatement(context, query);
      }
      
      // Default response if no specific intent is matched
      return {
        success: false,
        message: "I'm the Credit Card Agent and can help you process credit card statements. Please provide a credit card statement for me to analyze.",
        data: { sources: [] }
      };
    } catch (error) {
      console.error('[CreditCardAgent] Error processing message:', error);
      return {
        success: false,
        message: `I encountered an error while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { sources: [] }
      };
    }
  }

  /**
   * Check if this agent can handle the given query
   * @param query The user query
   * @returns Promise with boolean indicating if this agent can handle the query
   */
  async canHandle(query: string): Promise<boolean> {
    return this.isCreditCardStatement(query);
  }

  /**
   * Check if the query is about a credit card statement
   * @param query The user query
   * @returns Boolean indicating if this is a credit card statement
   */
  private isCreditCardStatement(query: string): boolean {
    const creditCardKeywords = [
      'credit card statement', 'credit card bill', 'card statement',
      'visa', 'mastercard', 'amex', 'american express', 'discover',
      'statement balance', 'payment due', 'minimum payment',
      'transaction', 'purchase', 'charge'
    ];
    
    const lowerQuery = query.toLowerCase();
    return creditCardKeywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()));
  }

  /**
   * Process a credit card statement
   * @param context The agent context
   * @param query The user query containing statement information
   * @returns Promise with processing result
   */
  private async processStatement(
    context: AgentContext,
    query: string
  ): Promise<AgentResponse> {
    try {
      console.log('[CreditCardAgent] Processing statement query:', query);
      
      // Extract statement information
      const statementInfo = await this.extractStatementInfo(query, context.userId);
      
      if (!statementInfo.success) {
        return {
          success: false,
          message: statementInfo.message,
          data: { sources: [] }
        };
      }
      
      // Prepare statement information
      const statementNumber = statementInfo.statementNumber || 'unknown';
      const statementDate = statementInfo.statementDate || new Date().toISOString().split('T')[0];
      
      const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
      console.log(`[CreditCardAgent] Extracted statement info: Number ${statementNumber}, Date ${statementDate}, Last Four ${lastFourDigits}`);
      
      // First check if this statement has already been processed and identify the account
      // Pass both the statement number and the last four digits for better account identification
      const statementStatus = await checkStatementStatus(statementNumber, context.userId, lastFourDigits);
      
      // If the statement has already been processed, inform the user
      if (statementStatus.isProcessed && statementStatus.accountId && statementStatus.accountName) {
        return {
          success: true,
          message: `I've already processed statement ${statementNumber} for account ${statementStatus.accountName}. To avoid duplicate entries, I won't process it again.`,
          data: { sources: [] }
        };
      }
      
      // If we found an existing account but the statement hasn't been processed yet
      if (statementStatus.accountId && statementStatus.accountName) {
        // Process the statement via API
        const result = await processStatementViaApi({
          accountId: statementStatus.accountId,
          statementNumber,
          statementDate,
          balance: statementInfo.balance,
          isStartingBalance: false
        });
        
        if (result.success) {
          // If we have transactions, process them
          if (statementInfo.transactions && statementInfo.transactions.length > 0) {
            const transactionResult = await this.processCreditCardTransactions(
              context,
              statementStatus.accountId,
              statementStatus.accountName,
              statementInfo.transactions
            );
            
            return {
              success: true,
              message: `I've processed statement ${statementNumber} for account ${statementStatus.accountName}. ${transactionResult.message}`,
              data: { sources: [] }
            };
          }
          
          return {
            success: true,
            message: `I've recorded that statement ${statementNumber} for account ${statementStatus.accountName} has been processed. The statement date is ${statementDate}.`,
            data: { sources: [] }
          };
        } else {
          return {
            success: false,
            message: result.message,
            data: { sources: [] }
          };
        }
      }
      
      // If we couldn't identify the account from previous statements, try to find it by code or name
      // For credit cards, we'll look for an account with the issuer name and last four digits
      let account;
      
      // Initialize accountId variable to be used throughout the method
      let accountId = 0;
      
      // Check if we have the credit card issuer and last four digits
      if (statementInfo.creditCardIssuer && statementInfo.lastFourDigits) {
        // Make sure the last four digits are properly extracted
        const lastFourDigits = statementInfo.lastFourDigits || 'unknown';
        console.log(`[CreditCardAgent] Using last four digits for account lookup: ${lastFourDigits}`);
        
        const accountName = `${statementInfo.creditCardIssuer} - ${lastFourDigits}`;
        
        // Try to find the account by name
        const { rows } = await sql`
          SELECT id, code, name, account_type FROM accounts 
          WHERE LOWER(name) LIKE ${`%${accountName.toLowerCase()}%`} AND user_id = ${context.userId}
        `;
        
        account = rows[0];
        
        // If account doesn't exist, we need to create it via the GL agent
        if (!account) {
          // Create the account using the GL agent
          const newAccount = await this.createAccountViaGLAgent(
            context,
            accountName,
            statementInfo.creditCardIssuer,
            statementInfo.lastFourDigits
          );
          
          if (newAccount.success && newAccount.accountId) {
            accountId = newAccount.accountId;
            
            // Process the statement via API
            const result = await processStatementViaApi({
              accountId,
              statementNumber,
              statementDate,
              balance: statementInfo.balance,
              isStartingBalance: !hasStartingBalanceStatement(accountId, context.userId || "unknown")
            });
            
            if (result.success) {
              // If we have transactions, process them
              if (statementInfo.transactions && statementInfo.transactions.length > 0) {
                const transactionResult = await this.processCreditCardTransactions(
                  context,
                  accountId,
                  accountName,
                  statementInfo.transactions
                );
                
                return {
                  success: true,
                  message: `I've created a new account "${accountName}", processed statement ${statementNumber}, and recorded the transactions. ${transactionResult.message}`,
                  data: { sources: [] }
                };
              }
              
              return {
                success: true,
                message: `I've created a new account "${accountName}" and processed statement ${statementNumber}. The statement date is ${statementDate}.`,
                data: { sources: [] }
              };
            } else {
              return {
                success: false,
                message: `I created the account "${accountName}" but couldn't process the statement: ${result.message}`,
                data: { sources: [] }
              };
            }
          } else {
            return {
              success: false,
              message: `I couldn't create an account for this credit card: ${newAccount.message}`,
              data: { sources: [] }
            };
          }
        } else {
          accountId = account.id;
          
          // Process the statement via API
          const result = await processStatementViaApi({
            accountId,
            statementNumber,
            statementDate,
            balance: statementInfo.balance,
            isStartingBalance: !hasStartingBalanceStatement(accountId, context.userId || "unknown")
          });
          
          if (result.success) {
            // If we have transactions, process them
            if (statementInfo.transactions && statementInfo.transactions.length > 0) {
              const transactionResult = await this.processCreditCardTransactions(
                context,
                accountId,
                account.name,
                statementInfo.transactions
              );
              
              return {
                success: true,
                message: `I've processed statement ${statementNumber} for account "${account.name}" and recorded the transactions. ${transactionResult.message}`,
                data: { sources: [] }
              };
            }
            
            return {
              success: true,
              message: `I've processed statement ${statementNumber} for account "${account.name}". The statement date is ${statementDate}.`,
              data: { sources: [] }
            };
          } else {
            return {
              success: false,
              message: result.message,
              data: { sources: [] }
            };
          }
        }
      } else {
        return {
          success: false,
          message: "I couldn't identify the credit card issuer and last four digits from the statement. Please provide this information to process the statement.",
          data: { sources: [] }
        };
      }
    } catch (error) {
      console.error('[CreditCardAgent] Error processing statement:', error);
      return {
        success: false,
        message: `I encountered an error while processing the statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: { sources: [] }
      };
    }
  }

  /**
   * Create a new account via the GL agent
   * @param context The agent context
   * @param accountName The account name (e.g., "American Express - 1234")
   * @param creditCardIssuer The credit card issuer
   * @param lastFourDigits The last four digits of the credit card
   * @returns Promise with the result of the account creation
   */
  private async createAccountViaGLAgent(
    context: AgentContext,
    accountName: string,
    creditCardIssuer: string,
    lastFourDigits: string
  ): Promise<{
    success: boolean;
    message: string;
    accountId?: number;
  }> {
    try {
      console.log(`[CreditCardAgent] Creating account for ${accountName}`);
      
      // First, check if the account already exists by exact name
      const { rows: existingAccounts } = await sql`
        SELECT id, code, name FROM accounts 
        WHERE LOWER(name) = ${accountName.toLowerCase()} 
        AND user_id = ${context.userId || null}
      `;
      
      // If the account already exists, return it
      if (existingAccounts.length > 0) {
        const existingAccount = existingAccounts[0];
        console.log(`[CreditCardAgent] Account already exists: ${existingAccount.name} (${existingAccount.code}) with ID ${existingAccount.id}`);
        return {
          success: true,
          message: `Account already exists: ${existingAccount.name} (${existingAccount.code})`,
          accountId: existingAccount.id
        };
      }
      
      // Determine the account type (liability for credit cards)
      const accountType = "liability";
      
      // Find an appropriate account code
      // Typically credit card liabilities are in the 2100-2199 range
      const { rows: existingCreditCardAccounts } = await sql`
        SELECT code FROM accounts 
        WHERE account_type = ${accountType} 
        AND LOWER(name) LIKE ${'%credit card%'} 
        AND user_id = ${context.userId || null}
        ORDER BY code DESC
        LIMIT 1
      `;
      
      // Start with 2100 if no existing credit card accounts, or increment from the highest existing code
      let accountCode = "2100";
      if (existingCreditCardAccounts.length > 0) {
        const highestCode = parseInt(existingCreditCardAccounts[0].code);
        accountCode = (highestCode + 1).toString();
      }
      
      // Prepare the payload with the exact fields that GLAgent expects
      const payload = { 
        // These are the fields that GLAgent.handleGLAccountCreationRequest expects
        suggestedName: accountName,
        accountType: accountType,
        // Include additional metadata that might be useful
        expenseDescription: `Credit card account for ${creditCardIssuer}`, 
        expenseType: "credit_card",
        description: `Credit card account for ${creditCardIssuer} ending in ${lastFourDigits}`,
        // We're not setting a starting balance here as it will be set when processing the statement
        startingBalance: undefined,
        balanceDate: undefined
      };
      
      // Log the exact payload we're sending to help with debugging
      console.log(`[CreditCardAgent] Sending GL account creation request with payload:`, JSON.stringify(payload));
      
      // Send the message to the GL agent
      const message = await sendAgentMessage(
        this.id,
        "gl_agent",
        "CREATE_GL_ACCOUNT",
        payload,
        context.userId || "unknown",
        MessagePriority.HIGH,
        context.conversationId
      );
      
      // Log the message ID for tracking
      console.log(`[CreditCardAgent] GL account creation request sent with message ID: ${message.id}`);
      
      if (!message || !message.id) {
        throw new Error('Failed to send message to GL agent');
      }
      
      // The GL agent will respond asynchronously, so we don't need to wait here
      // The message has been sent and the GL agent will process it
      
      // Get the response from the agent communication system
      const response = await waitForAgentResponse(message.id, 5000); // Wait up to 5 seconds for response
      console.log(`[CreditCardAgent] Received response from GL agent:`, response);
      
      // Check if the account was created successfully and response exists
      if (response && response.payload && response.payload.accountId) {
        // Extract the account ID directly from the payload
        const accountId = response.payload.accountId;
        console.log(`[CreditCardAgent] Extracted account ID from response: ${accountId}`);
        
        // Log the successful account creation
        await logAuditEvent({
          user_id: context.userId || "unknown",
          action_type: "ACCOUNT_CREATION",
          entity_type: "ACCOUNT",
          entity_id: accountId.toString(),
          timestamp: new Date().toISOString(),
          status: "SUCCESS",
          changes_made: [{
            field: "name",
            old_value: null,
            new_value: accountName
          }]
        });
        
        return {
          success: true,
          message: `Successfully created account ${accountName} with ID ${accountId}.`,
          accountId
        };
      }
      
      // If we get here, the response didn't contain an account ID
      // Let's check if the error message indicates the account already exists
      if (response && response.payload && response.payload.response && response.payload.response.error) {
        const errorMessage = response.payload.response.error;
        
        // Check if the error message indicates the account already exists
        if (errorMessage.includes('already exists')) {
          // Try to find the existing account by name
          const { rows: existingAccounts } = await sql`
            SELECT id, code, name FROM accounts 
            WHERE LOWER(name) = ${accountName.toLowerCase()} 
            OR LOWER(name) LIKE ${`%${lastFourDigits}%`}
            AND user_id = ${context.userId || null}
          `;
          
          if (existingAccounts.length > 0) {
            const existingAccount = existingAccounts[0];
            console.log(`[CreditCardAgent] Found existing account: ${existingAccount.name} (${existingAccount.code}) with ID ${existingAccount.id}`);
            
            return {
              success: true,
              message: `Account already exists: ${existingAccount.name} (${existingAccount.code})`,
              accountId: existingAccount.id
            };
          }
          
          // If we can extract the account name from the error message
          const match = errorMessage.match(/\(([^)]+)\)/); // Extract text between parentheses
          if (match && match[1]) {
            const existingAccountName = match[1];
            
            // Try to find the account mentioned in the error message
            const { rows: accountsByErrorName } = await sql`
              SELECT id, code, name FROM accounts 
              WHERE LOWER(name) = ${existingAccountName.toLowerCase()} 
              AND user_id = ${context.userId || null}
            `;
            
            if (accountsByErrorName.length > 0) {
              const existingAccount = accountsByErrorName[0];
              console.log(`[CreditCardAgent] Found existing account from error message: ${existingAccount.name} (${existingAccount.code}) with ID ${existingAccount.id}`);
              
              return {
                success: true,
                message: `Account already exists: ${existingAccount.name} (${existingAccount.code})`,
                accountId: existingAccount.id
              };
            }
          }
          
          // If we couldn't find the existing account, return a more helpful message
          return {
            success: false,
            message: `An account for this credit card already exists but couldn't be located. Error: ${errorMessage}`,
          };
        }
      }
      
      // Default error case
      return {
        success: false,
        message: 'Failed to create account: No account ID returned from GL Agent',
      };
    } catch (error: unknown) {
      console.error('[CreditCardAgent] Error creating account:', error);
      return {
        success: false,
        message: `Error creating account: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Process credit card transactions
   * @param context The agent context
   * @param accountId The account ID
   * @param accountName The account name
   * @param transactions The transactions to process
   * @returns Promise with processing result
   */
  private async processCreditCardTransactions(
    context: AgentContext,
    accountId: number,
    accountName: string,
    transactions: CreditCardTransaction[]
  ): Promise<{
    success: boolean;
    message: string;
    processedCount: number;
  }> {
    try {
      console.log(
        `[CreditCardAgent] Processing ${transactions.length} credit card transactions for account ${accountName}`
      );

      let processedCount = 0;
      const errors: string[] = [];

      // Process each transaction
      for (const transaction of transactions) {
        try {
          // Create a journal entry for the transaction
          const journalResult = await this.createTransactionJournalEntry(
            context,
            accountId,
            accountName,
            transaction
          );

          if (journalResult.success) {
            processedCount++;
          } else {
            errors.push(
              `Failed to process transaction ${transaction.description}: ${journalResult.message}`
            );
          }
        } catch (err) {
          console.error(
            `[CreditCardAgent] Error processing transaction ${transaction.description}:`,
            err
          );
          errors.push(
            `Error processing transaction ${transaction.description}: ${err instanceof Error ? err.message : 'Unknown error'}`
          );
        }
      }

      // Return the result
      if (processedCount === transactions.length) {
        return {
          success: true,
          message: `Successfully processed all ${processedCount} transactions.`,
          processedCount,
        };
      } else {
        return {
          success: true,
          message: `Processed ${processedCount} out of ${transactions.length} transactions. Errors: ${errors.join(
            "; "
          )}`,
          processedCount,
        };
      }
    } catch (error) {
      console.error("[CreditCardAgent] Error processing transactions:", error);
      return {
        success: false,
        message: `Error processing transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        processedCount: 0,
      };
    }
  }

  /**
   * Create a journal entry for a credit card transaction
   * @param context The agent context
   * @param accountId The account ID
   * @param accountName The account name
   * @param transaction The transaction to process
   * @returns Promise with the result of the journal entry creation
   */
  private async createTransactionJournalEntry(
    context: AgentContext,
    accountId: number,
    accountName: string,
    transaction: CreditCardTransaction
  ): Promise<{
    success: boolean;
    message: string;
    journalEntryId?: number;
  }> {
    try {
      console.log(
        `[CreditCardAgent] Creating journal entry for transaction: ${transaction.description}`
      );

      // Find or create an expense account for the transaction
      const expenseAccountId = await this.findExpenseAccount(context);

      if (!expenseAccountId) {
        return {
          success: false,
          message: "Could not find or create an expense account for the transaction.",
        };
      }

      // Determine the debit and credit accounts based on transaction type
      // For credit card transactions, a positive amount is typically a charge (expense)
      // and a negative amount is a payment or credit
      const amount = Math.abs(transaction.amount);
      let debitAccountId, creditAccountId;

      if (transaction.amount > 0) {
        // This is a charge (expense)
        debitAccountId = expenseAccountId; // Debit expense
        creditAccountId = accountId; // Credit credit card liability
      } else {
        // This is a payment or credit
        // For a payment, we need to find or create a bank account
        const bankAccountId = await this.findPaymentAccount(context);

        if (!bankAccountId) {
          return {
            success: false,
            message: "Could not find or create a bank account for the payment.",
          };
        }

        debitAccountId = accountId; // Debit credit card liability
        creditAccountId = bankAccountId; // Credit bank account
      }

      // Create the journal entry
      const { rows } = await sql`
        INSERT INTO journal_entries (
          date, description, user_id, status, source, reference_number
        ) VALUES (
          ${transaction.date}, 
          ${transaction.description}, 
          ${context.userId}, 
          'posted', 
          'credit_card_statement', 
          ${transaction.transactionId || transaction.id || ''}
        ) RETURNING id
      `;

      if (!rows || rows.length === 0) {
        return {
          success: false,
          message: "Failed to create journal entry.",
        };
      }

      const journalEntryId = rows[0].id;

      // Create the journal entry lines
      await sql`
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, description, line_number
        ) VALUES (
          ${journalEntryId}, 
          ${debitAccountId}, 
          ${amount}, 
          0, 
          ${transaction.description}, 
          1
        ), (
          ${journalEntryId}, 
          ${creditAccountId}, 
          0, 
          ${amount}, 
          ${transaction.description}, 
          2
        )
      `;

      // Log the successful journal entry creation
      await logAuditEvent({
        user_id: context.userId || "unknown",
        action_type: "JOURNAL_ENTRY_CREATION",
        entity_type: "JOURNAL_ENTRY",
        entity_id: journalEntryId.toString(),
        timestamp: new Date().toISOString(),
        status: "SUCCESS",
        changes_made: [{
          field: "description",
          old_value: null,
          new_value: transaction.description
        }]
      });

      return {
        success: true,
        message: `Successfully created journal entry for transaction: ${transaction.description}`,
        journalEntryId,
      };
    } catch (error) {
      console.error(
        `[CreditCardAgent] Error creating journal entry for transaction ${transaction.description}:`,
        error
      );
      return {
        success: false,
        message: `Error creating journal entry: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Find or create an expense account for credit card transactions
   * @param context The agent context
   * @returns Promise with the expense account ID
   */
  private async findExpenseAccount(context: AgentContext): Promise<number> {
    try {
      // Look for a general expenses account
      const { rows } = await sql`
        SELECT id FROM accounts 
        WHERE account_type = 'expense' 
        AND LOWER(name) LIKE ${'%general expense%'} 
        AND user_id = ${context.userId || null}
        LIMIT 1
      `;

      if (rows.length > 0) {
        return rows[0].id;
      }

      // If no expense account is found, create a default one
      try {
        // Send the message to the GL agent
        const message = await sendAgentMessage(
          this.id,
          "gl_agent",
          "CREATE_EXPENSE_ACCOUNT",
          { 
            name: "General Expenses", 
            code: "6000", 
            type: "expense",
            description: "Default expense account for credit card transactions"
          },
          context.userId || "unknown",
          MessagePriority.HIGH,
          context.conversationId
        );
        
        if (!message || !message.id) {
          throw new Error('Failed to send message to GL agent');
        }
        
        // Wait for the GL agent to respond
        const response = await respondToAgentMessage(
          message.id,
          MessageStatus.COMPLETED,
          { success: true },
          `Created expense account General Expenses`
        );
        
        // Check if the account was created successfully and response exists
        if (response && response.responseMessage) {
          // Extract the account ID from the response
          const accountIdMatch = response.responseMessage.match(/account with ID (\d+)/);
          if (accountIdMatch && accountIdMatch[1]) {
            return parseInt(accountIdMatch[1]);
          }
        }
        
        return 0; // Default to 0 if no account ID was found
      } catch (error) {
        console.error('[CreditCardAgent] Error creating expense account:', error);
        return 0; // Default to 0 on error
      }
      
      // If all else fails, throw an error
      throw new Error("Could not find or create an expense account");
    } catch (error) {
      console.error('[CreditCardAgent] Error finding expense account:', error);
      return 0;
    }
  }

  /**
   * Find or create a bank account for credit card payments
   * @param context The agent context
   * @returns Promise with the bank account ID
   */
  private async findPaymentAccount(context: AgentContext): Promise<number> {
    try {
      // Look for a bank account
      const { rows } = await sql`
        SELECT id FROM accounts 
        WHERE account_type = 'asset' 
        AND LOWER(name) LIKE ${'%bank%'} 
        AND user_id = ${context.userId || null}
        LIMIT 1
      `;

      if (rows.length > 0) {
        return rows[0].id;
      }

      // If no bank account is found, create a default one
      try {
        // Send the message to the GL agent
        const message = await sendAgentMessage(
          this.id,
          "gl_agent",
          "CREATE_BANK_ACCOUNT",
          { 
            name: "Bank Account", 
            code: "1000", 
            type: "asset",
            description: "Default bank account for credit card payments"
          },
          context.userId || "unknown",
          MessagePriority.HIGH,
          context.conversationId
        );
        
        if (!message || !message.id) {
          throw new Error('Failed to send message to GL agent');
        }
        
        // Wait for the GL agent to respond
        const response = await respondToAgentMessage(
          message.id,
          MessageStatus.COMPLETED,
          { success: true },
          `Created bank account Bank Account`
        );
        
        // Check if the account was created successfully and response exists
        if (response && response.responseMessage) {
          // Extract the account ID from the response
          const accountIdMatch = response.responseMessage.match(/account with ID (\d+)/);
          if (accountIdMatch && accountIdMatch[1]) {
            return parseInt(accountIdMatch[1]);
          }
        }
        
        return 0; // Default to 0 if no account ID was found
      } catch (error) {
        console.error('[CreditCardAgent] Error creating payment account:', error);
        return 0; // Default to 0 on error
      }
      
      // If all else fails, throw an error
      throw new Error("Could not find or create a bank account");
    } catch (error) {
      console.error('[CreditCardAgent] Error finding bank account:', error);
      return 0;
    }
  }

  /**
   * Extract credit card statement information using AI
   * @param query The user query containing statement information
   * @returns Promise with extracted information
   */
  /**
   * Validate a statement number using AI
   * @param statementNumber The statement number to validate
   * @param creditCardIssuer The credit card issuer
   * @param lastFourDigits The last four digits of the card
   * @returns Promise with boolean indicating if the statement number is valid
   */
  private async validateStatementNumberWithAI(
    statementNumber: string,
    creditCardIssuer: string,
    lastFourDigits: string
  ): Promise<boolean> {
    try {
      console.log(`[CreditCardAgent] Validating statement number with AI: ${statementNumber}`);
      
      // Prepare a specialized prompt for statement number validation
      const systemPrompt = `You are a financial assistant specializing in credit card statement validation.
      
Your task is to determine if a given statement number format is valid for a specific credit card issuer.

For each credit card issuer, here are the expected statement number formats:
- American Express: Usually contains masked digits with X's, like "XXXX-XXXXX1234-90098"
- Visa: Usually 15-16 digits, may be formatted as XXXX-XXXX-XXXX-1234 or similar
- Mastercard: Usually 15-16 digits, may be formatted as XXXX-XXXX-XXXX-1234 or similar
- Discover: Usually 15-16 digits, may be formatted as XXXX-XXXX-XXXX-1234 or similar
- Other issuers: May have various formats, but should include some combination of digits, possibly with separators like hyphens

A statement number is likely valid if:
1. It matches the expected format for the given issuer
2. It contains an appropriate mix of digits and/or masked characters (X's)
3. If visible digits are present, they should include or match the last four digits of the card

A statement number is likely invalid if:
1. It's a simple sequence of digits without any formatting (potential hallucination)
2. It doesn't match the expected format for the issuer
3. It contains unexpected characters or is unreasonably long/short

Respond with ONLY "true" if the statement number appears valid, or "false" if it appears invalid or hallucinated.`;

      const userPrompt = `Credit Card Issuer: ${creditCardIssuer}\nStatement Number: ${statementNumber}\nLast Four Digits: ${lastFourDigits}\n\nIs this statement number valid for this issuer?`;
      
      const response = await this.anthropic.messages.create({
        model: 'claude-3-7-sonnet-20240229',
        max_tokens: 10,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.1 // Lower temperature for more consistent results
      });
      
      // Extract the response
      let content = '';
      if (response.content && response.content.length > 0) {
        const contentBlock = response.content[0];
        if (contentBlock.type === 'text') {
          content = contentBlock.text.trim().toLowerCase();
        }
      }
      
      // Return true if the AI confirms the statement number is valid
      return content === 'true';
    } catch (error) {
      console.error('[CreditCardAgent] Error validating statement number with AI:', error);
      // Default to true in case of error to avoid blocking processing
      return true;
    }
  }

  private async extractStatementInfo(query: string, userId?: string): Promise<{
    success: boolean;
    message: string;
    creditCardIssuer?: string;
    lastFourDigits?: string;
    statementNumber?: string;
    statementDate?: string;
    balance?: number;
    dueDate?: string;
    minimumPayment?: number;
    transactions?: CreditCardTransaction[];
  }> {
    try {
      console.log('[CreditCardAgent] Extracting statement info using AI');
      
      // Use Anthropic to extract statement information
      const systemPrompt = `You are a financial assistant that extracts credit card statement information. Your task is to carefully analyze the provided credit card statement and extract all relevant details.

Extract the following information from the statement:
1. Credit card issuer (e.g., Visa, Mastercard, American Express, Chase, Capital One)
2. Last four digits of the card - ONLY use digits that are explicitly shown in the document. Look for patterns like "XXXX-XXXX-XXXX-1234" or "Card ending in 1234" or "Account: XXXX XXXX XXXX 1234". The lastFourDigits field MUST contain EXACTLY four numeric characters that appear in the document.
3. Statement number or ID - extract the ACTUAL statement number from the document. Look for fields labeled as "Statement #", "Reference Number", or similar. For American Express, this may appear as "XXXX-XXXXX1-90098" with masked digits. Include the full format with any X's intact.
4. Statement date (in YYYY-MM-DD format)
5. Statement balance (total amount due)
6. Payment due date (in YYYY-MM-DD format)
7. Minimum payment amount
8. List of transactions with the following details for each:
   - Date (in YYYY-MM-DD format)
   - Description/merchant name
   - Amount (positive for charges, negative for payments/credits)
   - Category (if available)

Format your response as a JSON object with the following structure:
{
  "creditCardIssuer": "string",
  "lastFourDigits": "string",
  "statementNumber": "string",
  "statementDate": "string (YYYY-MM-DD)",
  "balance": number,
  "dueDate": "string (YYYY-MM-DD)",
  "minimumPayment": number,
  "transactions": [
    {
      "date": "string (YYYY-MM-DD)",
      "description": "string",
      "amount": number (positive for charges, negative for payments/credits),
      "category": "string" (optional)
    }
  ]
}

Important guidelines:
- For dates, ensure they are in YYYY-MM-DD format
- For amounts, use positive numbers for charges and negative numbers for payments/credits
- If you cannot extract certain information, use null for that field. DO NOT INVENT OR HALLUCINATE VALUES.
- CRITICAL FOR LAST FOUR DIGITS: The lastFourDigits field MUST contain EXACTLY four numeric characters (0-9) that appear in the document. If you cannot find exactly four digits in the document, set lastFourDigits to null.
- CRITICAL FOR STATEMENT NUMBER: Extract the statement number EXACTLY as it appears in the document. Do not modify, format, or create a statement number. If the document has a statement number with X's (like American Express statements), include those X's in your response. DO NOT USE THE EXAMPLE FORMATS FROM THIS PROMPT.
- If the statement contains transaction data, make sure to extract as many transactions as possible
- If you cannot extract any meaningful information, respond with: {"success": false, "message": "Could not extract statement information."}
- Be precise and thorough - this information will be used for accounting purposes
- CRITICAL: Return ONLY the JSON object without any additional text, explanation, or analysis. Your entire response should be valid JSON that can be parsed directly.
- IMPORTANT: Only extract information that is explicitly present in the document. Do not fabricate or guess any values that are not clearly visible.`;

      const messages: MessageParam[] = [
        {
          role: 'user',
          content: query
        }
      ];

      // Extract PDF file name from query if present
      const pdfMatch = query.match(/PDF file: ([\w\s.-]+\.pdf)/i);
      const pdfFileName = pdfMatch ? pdfMatch[1].trim() : null;
      
      // If we have a PDF file name, check if we've already processed this PDF
      if (pdfFileName) {
        try {
          // Check if we have already processed this PDF
          const { rows: existingExtractions } = await sql`
            SELECT extraction_data FROM statement_extractions
            WHERE pdf_filename = ${pdfFileName}
            AND user_id = ${userId || 'unknown'}
            ORDER BY created_at DESC
            LIMIT 1
          `;
          
          // If we have already processed this PDF, use the cached extraction
          if (existingExtractions.length > 0 && existingExtractions[0].extraction_data) {
            console.log(`[CreditCardAgent] Using cached extraction for PDF: ${pdfFileName}`);
            // The extraction_data should already be a parsed JSON object when retrieved from PostgreSQL
            const cachedData = existingExtractions[0].extraction_data;
            return cachedData;
          }
        } catch (error) {
          // If there's an error checking the cache, log it and continue with extraction
          console.error(`[CreditCardAgent] Error checking extraction cache:`, error);
          // Table might not exist yet, we'll create it later if needed
        }
      }
      
      // Use Claude 3.7 for best extraction accuracy and efficiency
      const response = await this.anthropic.messages.create({
        model: 'claude-3-7-sonnet-20240229', // Using Claude 3.7 for optimal accuracy and speed
        max_tokens: 4000,
        system: systemPrompt,
        messages,
        temperature: 0.1 // Lower temperature for more consistent results
      });

      // Parse the response
      let content = '';
      
      // Handle different content block types
      if (response.content && response.content.length > 0) {
        const contentBlock = response.content[0];
        // Check if it's a text content block
        if (contentBlock.type === 'text') {
          content = contentBlock.text;
        }
      }
      
      if (!content) {
        return {
          success: false,
          message: "Could not extract statement information from the AI response."
        };
      }
      
      try {
        // Extract valid JSON from the content in case Claude prefaced it with text
        let jsonContent = content;
        
        // Find JSON object in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/); 
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
        
        console.log(`[CreditCardAgent] Attempting to parse extracted JSON: ${jsonContent.substring(0, 100)}...`);
        const extractedInfo = JSON.parse(jsonContent);
        
        console.log(`[CreditCardAgent] Extracted info: ${JSON.stringify(extractedInfo, null, 2)}`);
        
        // Cache the extraction results if we have a PDF file name and userId
        if (pdfFileName && userId) {
          try {
            // First, check if the table exists
            const { rows: tableExists } = await sql`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'statement_extractions'
              );
            `;
            
            // Create the table if it doesn't exist
            if (!tableExists[0].exists) {
              await sql`
                CREATE TABLE statement_extractions (
                  id SERIAL PRIMARY KEY,
                  user_id TEXT NOT NULL,
                  pdf_filename TEXT NOT NULL,
                  extraction_data JSONB NOT NULL,
                  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
              `;
              console.log(`[CreditCardAgent] Created statement_extractions table`);
            }
            
            // Store the extraction results - ensure we're storing a proper JSON string
            await sql`
              INSERT INTO statement_extractions (user_id, pdf_filename, extraction_data)
              VALUES (${userId}, ${pdfFileName}, ${JSON.stringify(extractedInfo)}::jsonb)
            `;
            console.log(`[CreditCardAgent] Cached extraction results for PDF: ${pdfFileName}`);
          } catch (error) {
            // If there's an error caching the results, log it but continue
            console.error(`[CreditCardAgent] Error caching extraction results:`, error);
          }
        }
        
        // Validate both statement number and last four digits
        // First check if the statement number looks like an example from our prompt or is suspicious
        if (extractedInfo.statementNumber) {
          // Log the detected statement number for debugging
          console.log(`[CreditCardAgent] Validating statement number: ${extractedInfo.statementNumber}`);
          
          // Check for suspicious statement number patterns
          const isExampleFormat = extractedInfo.statementNumber === "XXXX-XXXXX1-90098";
          const isAllZeros = /^0+$/.test(extractedInfo.statementNumber.replace(/[^0-9]/g, ''));
          const isSuspicious = isExampleFormat || isAllZeros;
          
          if (isSuspicious) {
            console.log(`[CreditCardAgent] Detected suspicious statement number format: ${extractedInfo.statementNumber}, treating as invalid`);
            extractedInfo.statementNumber = null;
            
            // If we have a valid statement date and last four digits, generate a reasonable statement number
            if (extractedInfo.statementDate && extractedInfo.lastFourDigits) {
              const datePart = extractedInfo.statementDate.replace(/-/g, '');
              extractedInfo.statementNumber = `STMT-${extractedInfo.lastFourDigits}-${datePart}`;
              console.log(`[CreditCardAgent] Generated alternative statement number: ${extractedInfo.statementNumber}`);
            }
          } else {
            // Use AI to validate the statement number format
            const isValid = await this.validateStatementNumberWithAI(
              extractedInfo.statementNumber,
              extractedInfo.creditCardIssuer,
              extractedInfo.lastFourDigits
            );
            
            if (isValid) {
              console.log(`[CreditCardAgent] AI confirmed valid statement number format for ${extractedInfo.creditCardIssuer}: ${extractedInfo.statementNumber}`);
            } else {
              console.log(`[CreditCardAgent] AI detected potentially invalid statement number for ${extractedInfo.creditCardIssuer}: ${extractedInfo.statementNumber}`);
              // Generate a more reasonable statement number if the AI thinks it's invalid
              if (extractedInfo.statementDate && extractedInfo.lastFourDigits) {
                const datePart = extractedInfo.statementDate.replace(/-/g, '');
                extractedInfo.statementNumber = `STMT-${extractedInfo.lastFourDigits}-${datePart}`;
                console.log(`[CreditCardAgent] Generated alternative statement number: ${extractedInfo.statementNumber}`);
              }
            }
          }
        } else if (extractedInfo.statementDate && extractedInfo.lastFourDigits) {
          // If no statement number was extracted but we have date and last four, generate one
          const datePart = extractedInfo.statementDate.replace(/-/g, '');
          extractedInfo.statementNumber = `STMT-${extractedInfo.lastFourDigits}-${datePart}`;
          console.log(`[CreditCardAgent] Generated statement number from date and last four: ${extractedInfo.statementNumber}`);
        }
        
        // Validate that last four digits are actually extracted from the document
        if (extractedInfo.lastFourDigits) {
          // Check if the last four digits are exactly four numeric characters
          const isValidLastFour = /^\d{4}$/.test(extractedInfo.lastFourDigits);
          
          if (!isValidLastFour) {
            console.log(`[CreditCardAgent] Invalid last four digits format: ${extractedInfo.lastFourDigits}, setting to null`);
            extractedInfo.lastFourDigits = null;
            
            // Try to extract last four digits from the statement number if available
            if (extractedInfo.statementNumber) {
              const digits = extractedInfo.statementNumber.replace(/[^0-9]/g, '');
              if (digits.length >= 4) {
                const lastFour = digits.slice(-4);
                if (/^\d{4}$/.test(lastFour)) {
                  extractedInfo.lastFourDigits = lastFour;
                  console.log(`[CreditCardAgent] Extracted last four digits from statement number: ${lastFour}`);
                }
              }
            }
          } else {
            console.log(`[CreditCardAgent] Valid last four digits extracted: ${extractedInfo.lastFourDigits}`);
          }
        } else {
          console.log(`[CreditCardAgent] No last four digits extracted from document`);
        }
        // Check if we have the minimum required information
        if (
          extractedInfo.creditCardIssuer && 
          extractedInfo.lastFourDigits && 
          (extractedInfo.statementNumber || extractedInfo.statementDate)
        ) {
          // Ensure transactions are properly formatted
          if (extractedInfo.transactions && Array.isArray(extractedInfo.transactions)) {
            // Validate and format each transaction
            extractedInfo.transactions = extractedInfo.transactions.map((transaction: any) => {
              // Ensure amount is a number
              if (typeof transaction.amount === 'string') {
                transaction.amount = parseFloat(transaction.amount.replace(/[^0-9.-]+/g, ''));
              }
              
              // Ensure date is in YYYY-MM-DD format
              if (transaction.date && typeof transaction.date === 'string') {
                // If date is not in YYYY-MM-DD format, try to convert it
                if (!transaction.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  const dateObj = new Date(transaction.date);
                  if (!isNaN(dateObj.getTime())) {
                    transaction.date = dateObj.toISOString().split('T')[0];
                  }
                }
              }
              
              return transaction;
            }).filter((transaction: any) => {
              // Filter out invalid transactions
              return transaction.date && transaction.description && !isNaN(transaction.amount);
            });
          }
          
          return {
            success: true,
            message: "Successfully extracted statement information",
            ...extractedInfo
          };
        } else if (extractedInfo.success === false) {
          return extractedInfo;
        } else {
          return {
            success: false,
            message: "Could not extract all required information from the statement. Please provide a more complete statement."
          };
        }
      } catch (error) {
        console.error('[CreditCardAgent] Error parsing AI response:', error);
        return {
          success: false,
          message: "Error parsing the extracted information. Please try again with a clearer statement."
        };
      }
    } catch (error) {
      console.error('[CreditCardAgent] Error extracting statement info:', error);
      return {
        success: false,
        message: `Error extracting statement information: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Clear cached extractions for a specific PDF file or all PDFs for a user
   * This is useful for testing and debugging
   * @param userId The user ID
   * @param pdfFileName Optional PDF file name to clear only that file's cache
   * @returns Promise with the result of the operation
   */
  async clearExtractionCache(userId: string, pdfFileName?: string): Promise<{ success: boolean; message: string }> {
    try {
      // Check if the table exists
      const { rows: tableExists } = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'statement_extractions'
        );
      `;
      
      if (!tableExists[0].exists) {
        return {
          success: false,
          message: "Cache table doesn't exist yet, nothing to clear."
        };
      }

      // Build the query based on whether we're clearing a specific file or all files
      if (pdfFileName) {
        await sql`
          DELETE FROM statement_extractions
          WHERE user_id = ${userId}
          AND pdf_filename = ${pdfFileName}
        `;
        return {
          success: true,
          message: `Cleared extraction cache for PDF: ${pdfFileName}`
        };
      } else {
        await sql`
          DELETE FROM statement_extractions
          WHERE user_id = ${userId}
        `;
        return {
          success: true,
          message: `Cleared all extraction caches for user: ${userId}`
        };
      }
    } catch (error) {
      console.error(`[CreditCardAgent] Error clearing extraction cache:`, error);
      return {
        success: false,
        message: `Error clearing extraction cache: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

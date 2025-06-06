import { AgentContext, AgentResponse } from "@/types/agents";
import { extractTransactionWithAI, ExtractedTransaction } from "./creditCardTransactionExtractor";
import { 
  shouldCreateBillCredit,
  createCreditCardRefund, 
  createCreditCardChargeback, 
  createGeneralCreditCardBillCredit,
  createJournalEntryForBillCredit,
  getCreditCardCreditType
} from "./creditCardBillCreditIntegration";
import { logAuditEvent } from "@/lib/auditLogger";
import { sql } from "@vercel/postgres";
import { generateAIAccountNotes } from './aiAccountNotesGenerator';
import { generateIntelligentGLCode } from './aiGLCodeGenerator';

/**
 * Handle direct transaction recording requests using AI-powered extraction
 * This replaces regex-based pattern matching with Claude 3.5 analysis
 */
export async function handleDirectTransactionRecording(
  context: AgentContext,
  query: string
): Promise<AgentResponse> {
  console.log(`[CreditCardDirectTransactionHandler] Processing direct transaction: ${query}`);
  
  try {
    // Step 1: Extract transaction information using AI
    const extractedTransaction = await extractTransactionWithAI(query);
    
    if (!extractedTransaction.success) {
      return {
        success: false,
        message: `I couldn't extract transaction information from your request. ${extractedTransaction.error || 'Please provide more details about the transaction.'}`,
        data: { sources: [] }
      };
    }
    
    console.log(`[CreditCardDirectTransactionHandler] Extracted transaction:`, extractedTransaction);
    
    // Step 2: Validate required information
    if (!extractedTransaction.vendor || !extractedTransaction.amount) {
      return {
        success: false,
        message: "I need at least the vendor name and amount to record this transaction. Please provide more details.",
        data: { sources: [] }
      };
    }
    
    // Step 3: Find or create credit card account
    const accountInfo = await findOrCreateCreditCardAccount(
      extractedTransaction.accountNumber,
      extractedTransaction.creditCardIssuer,
      context.userId
    );
    
    if (!accountInfo.success) {
      return {
        success: false,
        message: accountInfo.message,
        data: { sources: [] }
      };
    }
    
    // Step 4: Find or create vendor
    const vendorInfo = await findOrCreateVendor(extractedTransaction.vendor, context.userId);
    
    if (!vendorInfo.success) {
      return {
        success: false,
        message: vendorInfo.message,
        data: { sources: [] }
      };
    }
    
    // Step 5: Check if this should create a bill credit (for refunds/chargebacks)
    if (extractedTransaction.type === 'refund' || extractedTransaction.type === 'chargeback') {
      const shouldCreateCredit = shouldCreateBillCredit({
        amount: -extractedTransaction.amount, // Negative for refunds
        description: extractedTransaction.description || `${extractedTransaction.vendor} ${extractedTransaction.type}`,
        type: extractedTransaction.type,
        vendor: extractedTransaction.vendor,
        category: 'refund'
      });
      
      if (shouldCreateCredit) {
        console.log(`[CreditCardDirectTransactionHandler] Creating bill credit for ${extractedTransaction.type}`);
        
        const creditResult = await createBillCreditForTransaction(
          extractedTransaction,
          vendorInfo.vendor,
          accountInfo.account,
          context
        );
        
        if (creditResult.success) {
          return {
            success: true,
            message: `Successfully recorded ${extractedTransaction.type} for ${extractedTransaction.vendor} ($${extractedTransaction.amount}) and created bill credit.`,
            data: { 
              sources: [],
              transaction: extractedTransaction,
              billCredit: creditResult.billCredit
            }
          };
        } else {
          return {
            success: false,
            message: `Failed to create bill credit: ${creditResult.error}`,
            data: { sources: [] }
          };
        }
      }
    }
    
    // Step 6: For regular charges or if bill credit creation is not needed
    return {
      success: true,
      message: `Successfully recorded ${extractedTransaction.type || 'transaction'} for ${extractedTransaction.vendor} ($${extractedTransaction.amount}).`,
      data: { 
        sources: [],
        transaction: extractedTransaction,
        account: accountInfo.account,
        vendor: vendorInfo.vendor
      }
    };
    
  } catch (error) {
    console.error(`[CreditCardDirectTransactionHandler] Error processing transaction:`, error);
    return {
      success: false,
      message: "An error occurred while processing the transaction. Please try again.",
      data: { sources: [] }
    };
  }
}

/**
 * Find or create credit card account based on AI-extracted information
 */
async function findOrCreateCreditCardAccount(
  accountNumber?: string,
  issuer?: string,
  userId?: string
): Promise<{ success: boolean; message: string; account?: any }> {
  try {
    // If we have an account number, try to find existing account
    if (accountNumber && userId) {
      const existingAccount = await sql`
        SELECT * FROM accounts 
        WHERE user_id = ${userId} 
        AND (code LIKE ${'%' + accountNumber} OR name ILIKE ${'%' + accountNumber + '%'})
        AND account_type = 'Credit Card'
        LIMIT 1
      `;
      
      if (existingAccount.rows.length > 0) {
        console.log(`[CreditCardDirectTransactionHandler] Found existing account:`, existingAccount.rows[0]);
        return {
          success: true,
          message: "Found existing credit card account",
          account: existingAccount.rows[0]
        };
      }
    }
    
    // If no specific account found, try to find by issuer
    if (issuer && userId) {
      const issuerAccount = await sql`
        SELECT * FROM accounts 
        WHERE user_id = ${userId} 
        AND name ILIKE ${'%' + issuer + '%'}
        AND account_type = 'Credit Card'
        LIMIT 1
      `;
      
      if (issuerAccount.rows.length > 0) {
        console.log(`[CreditCardDirectTransactionHandler] Found account by issuer:`, issuerAccount.rows[0]);
        return {
          success: true,
          message: "Found credit card account by issuer",
          account: issuerAccount.rows[0]
        };
      }
    }
    
    // Return a generic response - in a real implementation, you might want to create the account
    // First try to find any credit card account as a fallback
    const defaultAccount = await sql`
      SELECT * FROM accounts 
      WHERE user_id = ${userId} 
      AND account_type = 'Credit Card'
      LIMIT 1
    `;
    
    if (defaultAccount.rows.length > 0) {
      console.log(`[CreditCardDirectTransactionHandler] Using default credit card account:`, defaultAccount.rows[0]);
      return {
        success: true,
        message: "Using default credit card account",
        account: defaultAccount.rows[0]
      };
    }
    
    const accountName = `${issuer || "Credit Card"} Account ${accountNumber || ""}`.trim();
    // If no credit card accounts exist at all, create a generic one
    // Generate account code using AI-powered logic
    console.log('[CreditCardDirectTransactionHandler] Using AI-powered code generation for credit card account');
    const codeResult = await generateIntelligentGLCode({
      accountName: accountName,
      accountType: 'liability',
      description: `Credit card account for ${accountName}`,
      expenseType: 'credit_card',
      userId: userId
    });

    const accountCode = codeResult.success ? codeResult.code : (20000 + Math.floor(Math.random() * 9999)).toString();
    
    if (codeResult.success) {
      console.log(`[CreditCardDirectTransactionHandler] AI generated code ${accountCode} with ${codeResult.confidence} confidence`);
      console.log(`[CreditCardDirectTransactionHandler] AI reasoning: ${codeResult.reasoning}`);
    } else {
      console.warn('[CreditCardDirectTransactionHandler] AI code generation failed, using fallback random code');
    }
    
    // Generate AI-powered notes for the credit card account
    let accountNotes = '';
    try {
      const aiNotesResult = await generateAIAccountNotes({
        name: accountName,
        accountType: 'liability',
        accountCode: accountCode.toString(),
        expenseType: 'credit_card',
        businessContext: 'Credit card account for business expenses'
      });
      accountNotes = aiNotesResult.notes;
      console.log(`[CreditCardDirectTransactionHandler] AI notes generated: ${accountNotes.substring(0, 100)}...`);
    } catch (error) {
      console.error('[CreditCardDirectTransactionHandler] Error generating AI notes, using fallback:', error);
      accountNotes = `This liability account tracks credit card balances for ${accountName}. Used to record purchases, payments, and interest charges.`;
    }

    // Insert the new credit card account with AI-generated notes
    const newAccount = await sql`
      INSERT INTO accounts (
        code, 
        name, 
        account_type,
        notes,
        is_active,
        is_deleted,
        user_id
      ) VALUES (
        ${accountCode},
        ${accountName},
        ${'Credit Card'},
        ${accountNotes},
        ${true},
        ${false},
        ${userId}
      )
      RETURNING *
    `;
    
    console.log(`[CreditCardDirectTransactionHandler] Created new credit card account:`, newAccount.rows[0]);
    return {
      success: true,
      message: "Created new credit card account",
      account: newAccount.rows[0]
    };
    
  } catch (error) {
    console.error(`[CreditCardDirectTransactionHandler] Error finding account:`, error);
    return {
      success: false,
      message: "Error finding credit card account"
    };
  }
}

/**
 * Find or create vendor based on AI-extracted information
 */
async function findOrCreateVendor(
  vendorName: string,
  userId?: string
): Promise<{ success: boolean; message: string; vendor?: any }> {
  try {
    if (userId) {
      // Try to find existing vendor
      const existingVendor = await sql`
        SELECT * FROM vendors 
        WHERE user_id = ${userId} 
        AND name ILIKE ${vendorName}
        LIMIT 1
      `;
      
      if (existingVendor.rows.length > 0) {
        console.log(`[CreditCardDirectTransactionHandler] Found existing vendor:`, existingVendor.rows[0]);
        return {
          success: true,
          message: "Found existing vendor",
          vendor: existingVendor.rows[0]
        };
      }
    }
    
    // No existing vendor found, create a new one
    const newVendor = await sql`
      INSERT INTO vendors (
        name,
        user_id,
        is_active,
        is_deleted
      ) VALUES (
        ${vendorName},
        ${userId},
        ${true},
        ${false}
      )
      RETURNING *
    `;
    
    console.log(`[CreditCardDirectTransactionHandler] Created new vendor:`, newVendor.rows[0]);
    return {
      success: true,
      message: "Created new vendor",
      vendor: newVendor.rows[0]
    };
    
  } catch (error) {
    console.error(`[CreditCardDirectTransactionHandler] Error finding vendor:`, error);
    return {
      success: false,
      message: "Error finding vendor"
    };
  }
}

/**
 * Find or create an expense account for bill credits
 */
async function findOrCreateExpenseAccount(
  userId: string,
  expenseType: string = 'General Expense'
): Promise<{ success: boolean; message: string; account?: any }> {
  try {
    // Try to find an expense account by type
    const expenseAccount = await sql`
      SELECT * FROM accounts 
      WHERE user_id = ${userId} 
      AND account_type = 'Expense'
      AND name ILIKE ${'%' + expenseType + '%'}
      LIMIT 1
    `;
    
    if (expenseAccount.rows.length > 0) {
      console.log(`[CreditCardDirectTransactionHandler] Found expense account:`, expenseAccount.rows[0]);
      return {
        success: true,
        message: "Found expense account",
        account: expenseAccount.rows[0]
      };
    }
    
    // Try to find any expense account
    const anyExpenseAccount = await sql`
      SELECT * FROM accounts 
      WHERE user_id = ${userId} 
      AND account_type = 'Expense'
      LIMIT 1
    `;
    
    if (anyExpenseAccount.rows.length > 0) {
      console.log(`[CreditCardDirectTransactionHandler] Using default expense account:`, anyExpenseAccount.rows[0]);
      return {
        success: true,
        message: "Using default expense account",
        account: anyExpenseAccount.rows[0]
      };
    }
    
    // If no expense accounts exist, create a generic one
    const newAccount = await sql`
      INSERT INTO accounts (
        code, 
        name, 
        account_type,
        is_active,
        is_deleted,
        user_id
      ) VALUES (
        ${'EXP-' + Math.floor(1000 + Math.random() * 9000)},
        ${expenseType},
        ${'Expense'},
        ${true},
        ${false},
        ${userId}
      )
      RETURNING *
    `;
    
    console.log(`[CreditCardDirectTransactionHandler] Created new expense account:`, newAccount.rows[0]);
    return {
      success: true,
      message: "Created new expense account",
      account: newAccount.rows[0]
    };
    
  } catch (error) {
    console.error(`[CreditCardDirectTransactionHandler] Error finding expense account:`, error);
    return {
      success: false,
      message: "Error finding expense account"
    };
  }
}

/**
 * Create bill credit for refund/chargeback transactions
 */
async function createBillCreditForTransaction(
  transaction: ExtractedTransaction,
  vendor: any,
  account: any,
  context: AgentContext
): Promise<{ success: boolean; error?: string; billCredit?: any }> {
  try {
    const creditType = getCreditCardCreditType({
      description: transaction.description || '',
      type: transaction.type || 'refund',
      amount: transaction.amount || 0
    });
    
    // Import the AI account selector
    const { selectAccountsWithAI } = await import('./aiAccountSelector');
    
    // Use AI to select the appropriate accounts
    const accountSelectionResult = await selectAccountsWithAI({
      transactionDescription: transaction.description || '',
      transactionAmount: transaction.amount || 0,
      transactionDate: transaction.date || new Date().toISOString().split('T')[0],
      transactionType: creditType,
      vendorName: vendor.name || vendor.vendor_name || transaction.vendor || '',
      userId: context.userId || 'system',
      creditCardLastFour: transaction.accountLastFour || account.code?.slice(-4) || '****',
      transactionCategory: transaction.type || creditType || ''
    });
    
    // If AI selection failed, fall back to the original method
    let expenseAccountId: number;
    let apAccountId: number = account.id; // Default to the provided account
    
    if (accountSelectionResult.success) {
      console.log(`[CreditCardDirectTransactionHandler] AI selected accounts:`, {
        expenseAccount: accountSelectionResult.expenseAccountName,
        apAccount: accountSelectionResult.apAccountName,
        confidence: accountSelectionResult.confidence
      });
      
      expenseAccountId = accountSelectionResult.expenseAccountId!;
      apAccountId = accountSelectionResult.apAccountId!;
    } else {
      console.log(`[CreditCardDirectTransactionHandler] AI account selection failed, falling back to default method`);
      // Fall back to the original method
      const expenseAccountResult = await findOrCreateExpenseAccount(context.userId, 
        transaction.type === 'chargeback' ? 'Credit Card Chargebacks' : 'Credit Card Refunds');
      
      if (!expenseAccountResult.success || !expenseAccountResult.account) {
        return {
          success: false,
          error: "Failed to find or create expense account"
        };
      }
      
      expenseAccountId = expenseAccountResult.account.id;
    }
    
    // Ensure we have a valid user ID
    const userId = context.userId || 'system';
    console.log(`[CreditCardDirectTransactionHandler] Using user ID: ${userId}`);
    
    let result;
    
    switch (creditType) {
      case 'refund':
        result = await createCreditCardRefund({
          vendorId: vendor.id,
          vendorName: vendor.name || vendor.vendor_name,
          refundAmount: Math.abs(transaction.amount || 0),
          refundDate: transaction.date || new Date().toISOString().split('T')[0],
          description: transaction.description || `${transaction.vendor} refund`,
          expenseAccountId: expenseAccountId,
          apAccountId: apAccountId, // Use AI-selected AP account
          userId: userId,
          creditCardLastFour: transaction.accountLastFour || account.code?.slice(-4) || '****',
          originalTransactionId: `${transaction.vendor}-${Date.now()}`
        });
        break;
        
      case 'chargeback':
        result = await createCreditCardChargeback({
          vendorId: vendor.id,
          vendorName: vendor.name || vendor.vendor_name,
          chargebackAmount: Math.abs(transaction.amount || 0),
          chargebackDate: transaction.date || new Date().toISOString().split('T')[0],
          description: transaction.description || `${transaction.vendor} chargeback`,
          expenseAccountId: expenseAccountId,
          apAccountId: apAccountId, // Use AI-selected AP account
          userId: userId,
          creditCardLastFour: transaction.accountLastFour || account.code?.slice(-4) || '****',
          originalTransactionId: `${transaction.vendor}-original`
        });
        break;
        
      default:
        result = await createGeneralCreditCardBillCredit({
          vendorId: vendor.id,
          vendorName: vendor.name || vendor.vendor_name,
          creditAmount: Math.abs(transaction.amount || 0),
          creditDate: transaction.date || new Date().toISOString().split('T')[0],
          description: transaction.description || `${transaction.vendor} credit`,
          expenseAccountId: expenseAccountId,
          apAccountId: apAccountId, // Use AI-selected AP account
          userId: userId,
          creditNumber: `CC-CREDIT-${Date.now()}`,
          creditCardLastFour: transaction.accountLastFour || account.code?.slice(-4) || '****',
          memo: `Credit card credit: ${transaction.description}`
        });
    }
    
    if (result.success) {
      // Log audit event
      await logAuditEvent({
        user_id: context.userId,
        action_type: 'bill_credit_created',
        entity_type: 'BILL_CREDIT',
        entity_id: result.billCredit?.id,
        context: {
          vendor_id: vendor.id,
          amount: transaction.amount || 0,
          type: transaction.type || 'refund',
          source: 'credit_card_direct_transaction',
          user_id: context.userId // Include user ID in context for debugging
        },
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      });
      
      // Create journal entry for the bill credit
      if (result.billCredit) {
        console.log('[CreditCardDirectTransactionHandler] Creating journal entry for bill credit:', result.billCredit.id);
        
        try {
          const journalResult = await createJournalEntryForBillCredit({
            billCredit: result.billCredit,
            expenseAccountId: expenseAccountId,
            apAccountId: apAccountId,
            userId: context.userId,
            conversationId: context.conversationId
          });
          
          if (journalResult.success) {
            console.log('[CreditCardDirectTransactionHandler] Successfully created journal entry:', journalResult.journalId);
            
            // Log successful journal creation
            await logAuditEvent({
              user_id: context.userId,
              action_type: 'journal_entry_created',
              entity_type: 'JOURNAL',
              entity_id: journalResult.journalId?.toString(),
              context: {
                bill_credit_id: result.billCredit.id,
                journal_id: journalResult.journalId,
                source: 'credit_card_bill_credit',
                user_id: context.userId
              },
              status: 'SUCCESS',
              timestamp: new Date().toISOString()
            });
          } else {
            console.error('[CreditCardDirectTransactionHandler] Failed to create journal entry:', journalResult.error);
            
            // Log failed journal creation (but don't fail the overall operation)
            await logAuditEvent({
              user_id: context.userId,
              action_type: 'journal_entry_creation_failed',
              entity_type: 'JOURNAL',
              entity_id: 'unknown',
              context: {
                bill_credit_id: result.billCredit.id,
                error: journalResult.error,
                source: 'credit_card_bill_credit',
                user_id: context.userId
              },
              status: 'FAILURE',
              timestamp: new Date().toISOString()
            });
          }
        } catch (journalError) {
          console.error('[CreditCardDirectTransactionHandler] Error creating journal entry:', journalError);
          
          // Log journal creation error (but don't fail the overall operation)
          await logAuditEvent({
            user_id: context.userId,
            action_type: 'journal_entry_creation_error',
            entity_type: 'JOURNAL',
            entity_id: 'unknown',
            context: {
              bill_credit_id: result.billCredit.id,
              error: journalError instanceof Error ? journalError.message : 'Unknown error',
              source: 'credit_card_bill_credit',
              user_id: context.userId
            },
            status: 'FAILURE',
            timestamp: new Date().toISOString()
          });
        }
      }
      
      return {
        success: true,
        billCredit: result.billCredit
      };
    } else {
      return {
        success: false,
        error: result.error
      };
    }
    
  } catch (error) {
    console.error(`[CreditCardDirectTransactionHandler] Error creating bill credit:`, error);
    return {
      success: false,
      error: `Error creating bill credit: ${error}`
    };
  }
}

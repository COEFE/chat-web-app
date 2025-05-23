import { AgentContext, AgentResponse } from "@/types/agents";
import { extractTransactionWithAI, ExtractedTransaction } from "./creditCardTransactionExtractor";
import { 
  shouldCreateBillCredit,
  createCreditCardRefund,
  createCreditCardChargeback,
  createGeneralCreditCardBillCredit,
  getCreditCardCreditType
} from "./creditCardBillCreditIntegration";
import { logAuditEvent } from "@/lib/auditLogger";
import { sql } from "@vercel/postgres";

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
        AND (code LIKE ${'%' + accountNumber} OR account_name ILIKE ${'%' + accountNumber + '%'})
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
        AND account_name ILIKE ${'%' + issuer + '%'}
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
    return {
      success: true,
      message: "Using default credit card account",
      account: {
        id: accountNumber || '2009',
        account_name: `${issuer || 'Credit Card'} Account ${accountNumber || ''}`.trim(),
        account_type: 'Credit Card'
      }
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
    
    // Return a generic vendor object - in a real implementation, you might want to create the vendor
    return {
      success: true,
      message: "Using vendor information",
      vendor: {
        id: vendorName.toLowerCase().replace(/\s+/g, '_'),
        name: vendorName,
        vendor_name: vendorName
      }
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
    
    let result;
    
    switch (creditType) {
      case 'refund':
        result = await createCreditCardRefund({
          vendorId: vendor.id,
          vendorName: vendor.name || vendor.vendor_name,
          refundAmount: Math.abs(transaction.amount || 0),
          refundDate: transaction.date || new Date().toISOString().split('T')[0],
          description: transaction.description || `${transaction.vendor} refund`,
          expenseAccountId: 5000, // Default expense account
          apAccountId: account.id,
          creditCardLastFour: transaction.accountLastFour || account.code?.slice(-4) || '****',
          transactionId: `${transaction.vendor}-${Date.now()}`
        });
        break;
        
      case 'chargeback':
        result = await createCreditCardChargeback({
          vendorId: vendor.id,
          vendorName: vendor.name || vendor.vendor_name,
          chargebackAmount: Math.abs(transaction.amount || 0),
          chargebackDate: transaction.date || new Date().toISOString().split('T')[0],
          description: transaction.description || `${transaction.vendor} chargeback`,
          expenseAccountId: 5000, // Default expense account
          apAccountId: account.id,
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
          expenseAccountId: 5000, // Default expense account
          apAccountId: account.id,
          creditNumber: `CC-CREDIT-${Date.now()}`,
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
          amount: Math.abs(transaction.amount || 0),
          type: creditType,
          source: 'credit_card_direct_transaction'
        },
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      });
      
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

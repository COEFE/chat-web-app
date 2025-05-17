import { AgentContext, AgentResponse } from "@/types/agents";
import { isBillPaymentQuery, isBillPaymentQueryWithAI, extractPaymentInfoFromQuery, extractPaymentInfoWithAI } from "@/lib/apUtils";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { 
  processBillPayment, 
  processBulkBillPayments, 
  findPaymentAccount, 
  getUnpaidBills 
} from "./billPaymentHelper";
import { findRelevantVendors, findRelevantBills } from "@/lib/apUtils";
import { APAgent } from "./apAgent";
import { getAccounts } from "@/lib/accounting/accountQueries";
import { sql } from '@vercel/postgres';

/**
 * Check if a query is applicable for bill payment processing using AI
 */
export async function isApplicable(query: string): Promise<boolean> {
  console.log(`[handleBillPayment] Checking if query is applicable for bill payment: "${query}"`);
  
  try {
    // Use AI-powered detection for better accuracy
    const aiAnalysis = await isBillPaymentQueryWithAI(query);
    
    if (aiAnalysis.isPaymentQuery && aiAnalysis.confidence > 0.7) {
      console.log(`[handleBillPayment] AI confirmed this is a payment query with ${aiAnalysis.confidence.toFixed(2)} confidence. Reasoning: ${aiAnalysis.reasoning}`);
      return true;
    } else if (aiAnalysis.isPaymentQuery) {
      console.log(`[handleBillPayment] AI thinks this might be a payment query but with low confidence (${aiAnalysis.confidence.toFixed(2)}). Falling back to pattern matching.`);
      // Fall back to pattern matching if AI is uncertain
      return isBillPaymentQuery(query);
    }
    
    // If AI says it's not a payment query but confidence is low, double-check with patterns
    if (aiAnalysis.confidence < 0.7) {
      const patternMatch = isBillPaymentQuery(query);
      if (patternMatch) {
        console.log('[handleBillPayment] Pattern matching identified payment intent where AI did not');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    // If AI detection fails, fall back to pattern matching
    console.error(`[handleBillPayment] Error in AI payment detection, falling back to pattern matching: ${error}`);
    return isBillPaymentQuery(query);
  }
}

/**
 * Interface for bill payment information extracted from query
 */
interface PaymentInfo {
  vendor_name?: string;
  bill_number?: string;
  amount?: number;
  payment_date?: string;
  payment_account?: string;
  payment_method?: string;
  reference_number?: string;
  all_bills?: boolean;
  // Additional fields for AI-based account selection
  selectedAccountId?: number;
  selectedAccountName?: string;
  accountSelectionReason?: string;
}

/**
 * Interface for pending bill payment
 */
interface PendingBillPayment {
  userId: string;
  paymentInfo: PaymentInfo;
  paymentAccountId?: number;
  billIds?: number[];
}

/**
 * Use Claude to analyze payment intent and extract payment details
 */
async function analyzePaymentIntentWithAI(
  query: string,
  userId: string
): Promise<{
  paymentInfo: any;
  shouldExecuteImmediately: boolean;
}> {
  console.log(`[handleBillPayment] Using Claude to analyze payment intent: "${query}"`);
  
  // Use the best available API key
  const apiKey = process.env.ANTHROPIC_API_KEY || 
                process.env.ANOTHER_ANTHROPIC_API_KEY || 
                process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    console.error('[handleBillPayment] No Anthropic API key available');
    throw new Error('Anthropic API key not configured');
  }
  
  const anthropic = new Anthropic({
    apiKey
  });
  
  // System prompt that instructs Claude how to analyze payment intent
  const systemPrompt = `You are an expert in analyzing payment intents for a financial system. 
  You need to determine two things: 
  1. Extract payment details from the user's request
  2. Determine if the user clearly wants to execute the payment immediately or if they're just inquiring/preparing
  
  For payment details, extract:
  - all_bills: true if the user wants to pay all unpaid/open/outstanding bills or invoices, false otherwise
  - vendor_name: if the user specifies a vendor, include their name
  - bill_number: if the user specifies a specific bill or invoice, include the number
  - payment_account: if the user specifies which account to pay from (e.g. "operating account", "checking account")
  - Execute only if clearly instructed: true if user is clearly instructing to make the payment rather than just asking about it
  
  IMPORTANT: In our system, "bills" and "invoices" are the same thing - they refer to accounts payable items that need to be paid. If the user mentions "invoices", treat it the same as if they mentioned "bills".
  
  IMPORTANT: Phrases like "record the payment for these invoices" or "record payment for invoices" are CLEAR INSTRUCTIONS to execute the payment immediately, not just inquiries.
  
  Return ONLY a JSON object with no additional text.
  `;
  
  // Configure the messages according to Anthropic's API requirements
  const messages: MessageParam[] = [
    { role: 'user', content: `${systemPrompt}\n\nUser request: ${query}` }
  ];
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1000,
      temperature: 0,
      messages
    });
    
    // Extract and parse the JSON response based on the updated Anthropic API structure
    // The content can be of different types, so we need to handle it safely
    let responseText = '';
    if (response.content[0].type === 'text') {
      responseText = response.content[0].text;
    }
    console.log(`[handleBillPayment] Claude analysis result: ${responseText}`);
    
    // Parse the JSON response, with fallback to standard extraction if parsing fails
    try {
      const result = JSON.parse(responseText);
      return {
        paymentInfo: {
          vendor_name: result.vendor_name,
          bill_number: result.bill_number,
          all_bills: result.all_bills === true,
          payment_account: result.payment_account,
          payment_date: new Date().toISOString().split('T')[0], // Today's date
          payment_method: 'ACH/Wire' // Default payment method
        },
        shouldExecuteImmediately: result['Execute only if clearly instructed'] === true
      };
    } catch (parseError) {
      console.error('[handleBillPayment] Error parsing Claude response, using AI-powered payment info extraction:', parseError);
      // Use the dedicated AI-powered payment info extraction instead of pattern matching
      const extractedInfo = await extractPaymentInfoWithAI(query, anthropic);
      return {
        paymentInfo: {
          vendor_name: extractedInfo.vendor_name,
          bill_number: extractedInfo.bill_number,
          amount: extractedInfo.amount,
          payment_date: extractedInfo.payment_date,
          payment_account: extractedInfo.payment_account,
          payment_method: extractedInfo.payment_method,
          reference_number: extractedInfo.reference_number,
          all_bills: extractedInfo.all_bills
        },
        shouldExecuteImmediately: query.toLowerCase().includes('record') || query.toLowerCase().includes('pay')
      };
    }
  } catch (error) {
    console.error('[handleBillPayment] Error calling Claude API intent analyzer, using dedicated payment info extraction:', error);
    try {
      // Even if the intent analysis failed, try the dedicated payment info extraction
      const extractedInfo = await extractPaymentInfoWithAI(query);
      return {
        paymentInfo: {
          vendor_name: extractedInfo.vendor_name,
          bill_number: extractedInfo.bill_number,
          amount: extractedInfo.amount,
          payment_date: extractedInfo.payment_date,
          payment_account: extractedInfo.payment_account,
          payment_method: extractedInfo.payment_method,
          reference_number: extractedInfo.reference_number,
          all_bills: extractedInfo.all_bills
        },
        shouldExecuteImmediately: query.toLowerCase().includes('record') || query.toLowerCase().includes('pay')
      };
    } catch (extractionError) {
      // Last resort fallback to pattern matching if both AI approaches fail
      console.error('[handleBillPayment] AI extraction also failed, falling back to pattern matching:', extractionError);
      return {
        paymentInfo: extractPaymentInfoFromQuery(query),
        shouldExecuteImmediately: query.toLowerCase().includes('record') || query.toLowerCase().includes('pay')
      };
    }
  }
}

/**
 * Handle bill payment requests
 */
export async function handleBillPayment(
  query: string,
  context: AgentContext,
  pendingBillPayment?: PendingBillPayment | null
): Promise<{ response: AgentResponse; updatedPendingPayment: PendingBillPayment | null }> {
  try {
    console.log(`[handleBillPayment] Processing bill payment request: "${query}"`);
    const { userId } = context;
    
    // Use AI to analyze the payment intent and extract details
    const aiAnalysis = await analyzePaymentIntentWithAI(query, userId || 'unknown');
    let paymentInfo = aiAnalysis.paymentInfo;
    let shouldExecuteImmediately = aiAnalysis.shouldExecuteImmediately;
    
    console.log(`[handleBillPayment] AI analysis results:`, {
      paymentInfo,
      shouldExecuteImmediately
    });
    
    // If there's a pending payment, merge it with the current request
    if (pendingBillPayment && pendingBillPayment.userId === (context.userId || '')) {
      paymentInfo = { ...pendingBillPayment.paymentInfo, ...paymentInfo };
    }
    
    // Check if this is a confirmation of a pending payment
    const normalizedQuery = query.toLowerCase();
    if (normalizedQuery.includes('yes') || 
        normalizedQuery.includes('confirm') || 
        normalizedQuery.includes('proceed') || 
        normalizedQuery.includes('go ahead')) {
      
      // Process the payment
      try {
        if (!pendingBillPayment || !pendingBillPayment.paymentAccountId) {
          return {
            response: {
              success: false,
              message: "I couldn't determine which account to use for the payment. Please specify the payment account."
            },
            updatedPendingPayment: null
          };
        }
        
        if (!pendingBillPayment || !pendingBillPayment.billIds || pendingBillPayment.billIds.length === 0) {
          return {
            response: {
              success: false,
              message: "I couldn't find any unpaid bills to pay. Please specify which bills you want to pay."
            },
            updatedPendingPayment: null
          };
        }
        
        // At this point we've verified pendingBillPayment exists and has required data
        const paymentInfo = pendingBillPayment!.paymentInfo;
        const paymentDate = paymentInfo.payment_date || new Date().toISOString().split('T')[0];
        const paymentMethod = paymentInfo.payment_method || 'ACH/Wire';
        const referenceNumber = paymentInfo.reference_number;
        
        // Process the bulk payment
        const result = await processBulkBillPayments(
          pendingBillPayment!.billIds,
          pendingBillPayment!.paymentAccountId,
          paymentDate,
          paymentMethod,
          referenceNumber,
          context.userId || ''
        );
        
        // Format the response
        if (result.success) {
          let successMessage = `✅ ${result.message}\n\n`;
          
          // Include the account name and AI reasoning if available
          if (pendingBillPayment!.paymentInfo.selectedAccountName && pendingBillPayment!.paymentInfo.accountSelectionReason) {
            successMessage += `I used the ${pendingBillPayment!.paymentInfo.selectedAccountName} account for this payment. ${pendingBillPayment!.paymentInfo.accountSelectionReason}\n\n`;
          }
          
          successMessage += "**Payment Summary:**\n";
          successMessage += `- Total Amount Paid: $${result.totalPaid.toFixed(2)}\n`;
          successMessage += `- Bills Paid: ${result.successCount}\n`;
          
          if (result.failureCount > 0) {
            successMessage += `- Failed Payments: ${result.failureCount}\n\n`;
            successMessage += "**Details:**\n";
            
            // List successful payments
            successMessage += "✅ **Successful Payments:**\n";
            result.payments
              .filter(p => p.status === 'success')
              .forEach(payment => {
                successMessage += `- ${payment.vendor_name}: ${payment.bill_number} - $${payment.amount_paid.toFixed(2)}\n`;
              });
            
            // List failed payments
            successMessage += "\n❌ **Failed Payments:**\n";
            result.payments
              .filter(p => p.status === 'failed')
              .forEach(payment => {
                successMessage += `- ${payment.vendor_name}: ${payment.bill_number} - ${payment.error}\n`;
              });
          } else {
            successMessage += "\n**Paid Bills:**\n";
            result.payments.forEach(payment => {
              successMessage += `- ${payment.vendor_name}: ${payment.bill_number} - $${payment.amount_paid.toFixed(2)}\n`;
            });
          }
          
          return {
            response: {
              success: true,
              message: successMessage
            },
            updatedPendingPayment: null
          };
        } else {
          return {
            response: {
              success: false,
              message: `❌ ${result.message}\n\nPlease try again or specify different bills to pay.`
            },
            updatedPendingPayment: null
          };
        }
      } catch (error) {
        console.error('[APAgent] Error processing bill payment:', error);
        return {
          response: {
            success: false,
            message: `I encountered an error while processing the payment: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again later.`
          },
          updatedPendingPayment: null
        };
      }
    } else if (normalizedQuery.includes('no') || 
              normalizedQuery.includes('cancel') || 
              normalizedQuery.includes('stop')) {
      // User is canceling the payment
      return {
        response: {
          success: true,
          message: "I've canceled the bill payment. Let me know if you'd like to do something else."
        },
        updatedPendingPayment: null
      };
    }
  } catch (error) {
    console.error('[handleBillPayment] Unexpected error during bill payment processing:', error);
    return {
      response: {
        success: false,
        message: `There was an error processing your bill payment request: ${error instanceof Error ? error.message : 'Unknown error'}`
      },
      updatedPendingPayment: null
    };
  }
  
  // Check again if this is a payment request since context may have changed
  const isPaymentRequest = await isApplicable(query);
  if (!isPaymentRequest) {
    return {
      response: {
        success: false,
        message: "I don't understand your payment request. Please provide details about which bills you'd like to pay."
      },
      updatedPendingPayment: null
    };
  }

  // Extract payment info using AI for better understanding of natural language
  console.log('[handleBillPayment] Using AI-powered extraction for payment information');
  let extractedInfo;
  try {
    // First try with AI-powered extraction for better accuracy
    extractedInfo = await extractPaymentInfoWithAI(query);
    console.log('[handleBillPayment] AI-powered extraction result:', extractedInfo);
  } catch (error) {
    // Fall back to pattern matching if AI fails
    console.error('[handleBillPayment] AI extraction failed, falling back to pattern matching:', error);
    extractedInfo = extractPaymentInfoFromQuery(query);
  }
  
  // Convert to the expected format
  const paymentInfo = {
    vendor_name: extractedInfo.vendor_name,
    bill_number: extractedInfo.bill_number,
    amount: extractedInfo.amount,
    payment_date: extractedInfo.payment_date || new Date().toISOString().split('T')[0],
    payment_account: extractedInfo.payment_account,
    payment_method: extractedInfo.payment_method,
    reference_number: extractedInfo.reference_number,
    all_bills: extractedInfo.all_bills
  };
  
  console.log('[APAgent] Extracted payment info:', paymentInfo);
  
  try {
    // Find relevant bills based on the query
    let billsToProcess: any[] = [];
    
    // Check if the user wants to pay a specific bill
    if (paymentInfo.bill_number) {
      // Convert bill_number to a search query string
      const billQuery = `bill ${paymentInfo.bill_number}`;
      const relevantBills = await findRelevantBills(billQuery);
      if (relevantBills.length > 0) {
        billsToProcess = relevantBills;
      }
    } 
    // Check if the user wants to pay all bills for a specific vendor
    else if (paymentInfo.vendor_name) {
      const vendors = await findRelevantVendors(paymentInfo.vendor_name);
      if (vendors.length > 0) {
        const vendorId = vendors[0].id;
        // Fetch a list of all unpaid bills for this user
        const unpaidBills = await getUnpaidBills(context.userId || '');
        const vendorBills = unpaidBills.filter(bill => bill.vendor_id === vendorId);
        if (vendorBills.length > 0) {
          billsToProcess = vendorBills;
        }
      }
    } 
    // Check if the user wants to pay all unpaid bills
    else if (paymentInfo.all_bills) {
      const allUnpaidBills = await getUnpaidBills(context.userId || '');
      if (allUnpaidBills.length > 0) {
        billsToProcess = allUnpaidBills;
      }
    }
    
    // If no bills were found, return an error
    if (billsToProcess.length === 0) {
      return {
        response: {
          success: false,
          message: "I couldn't find any unpaid bills matching your request. Please check if the bill number or vendor name is correct."
        },
        updatedPendingPayment: null
      };
    }
    
    // Get all accounts for this user directly from the database
    const accountsQuery = `
      SELECT id, name, account_type, code 
      FROM accounts 
      WHERE user_id = $1 AND is_deleted = false
      ORDER BY code ASC
    `;
    
    const accountsResult = await sql.query(accountsQuery, [context.userId || '']);
    const userAccounts = accountsResult.rows;
    
    if (userAccounts.length === 0) {
      return {
        response: {
          success: false,
          message: "I couldn't find any accounts to use for the payment. Please create at least one bank or cash account first."
        },
        updatedPendingPayment: null
      };
    }
    
    // Find the payment account
    let paymentAccountId: number | undefined = undefined;
    let selectedAccountName: string | undefined = undefined;
    let accountSelectionReason: string | undefined = undefined;
    
    // Try to use AI to select the most appropriate payment account
    try {
      const apAgent = new APAgent();
      
      // Get vendor name for context if available
      let vendorName = '';
      if (billsToProcess.length > 0) {
        vendorName = billsToProcess[0].vendor_name || '';
      }
      
      // Use AI to select payment account
      const paymentDescription = billsToProcess.length === 1 
        ? `Payment for vendor bill ${billsToProcess[0].bill_number || ''}` 
        : `Payment for ${billsToProcess.length} vendor bills`;
      
      const accountResult = await apAgent.selectPaymentAccountWithAI(
        context,
        userAccounts,
        paymentDescription,
        vendorName
      );
      
      paymentAccountId = accountResult.accountId;
      accountSelectionReason = accountResult.message;
      
      // Find the selected account to get its name
      const selectedAccount = userAccounts.find((a: any) => a.id === paymentAccountId);
      if (selectedAccount) {
        selectedAccountName = selectedAccount.name;
      }
    } catch (error) {
      console.error('[APAgent] Error selecting payment account with AI:', error);
      
      // Fallback to traditional account selection method
      const paymentAccounts = userAccounts.filter((account: any) => {
        const accountType = (account.account_type || '').toLowerCase();
        const accountName = (account.name || '').toLowerCase();
        
        return (
          accountType === 'bank' || 
          accountType === 'cash' || 
          accountName.includes('bank') || 
          accountName.includes('cash') || 
          accountName.includes('checking') || 
          accountName.includes('operating')
        );
      });
      
      if (paymentAccounts.length > 0) {
        paymentAccountId = paymentAccounts[0].id;
        selectedAccountName = paymentAccounts[0].name;
      } else {
        // Try to find the default operating account as last resort
        const defaultAccountId = await findPaymentAccount('operating');
        if (defaultAccountId) {
          paymentAccountId = defaultAccountId;
          
          // Find the account name
          const defaultAccount = userAccounts.find((a: any) => a.id === defaultAccountId);
          if (defaultAccount) {
            selectedAccountName = defaultAccount.name;
          }
        }
      }
    }
    
    // If we couldn't find a payment account, return an error
    if (!paymentAccountId) {
      return {
        response: {
          success: false,
          message: "I couldn't determine which account to use for the payment. Please specify the payment account (e.g., 'operating account' or 'checking account')."
        },
        updatedPendingPayment: null
      };
    }
    
    // Create a pending payment object
    const billIds = billsToProcess.map(bill => bill.id);
    
    const pendingPayment: PendingBillPayment = {
      userId: context.userId || '',
      paymentInfo: {
        ...paymentInfo,
        selectedAccountId: paymentAccountId,
        selectedAccountName,
        accountSelectionReason
      },
      paymentAccountId,
      billIds
    };
    
    // Create a confirmation message
    let confirmationMessage = `I found ${billsToProcess.length} ${billsToProcess.length === 1 ? 'bill' : 'bills'} to pay`;
    
    // Include AI account selection reason if available
    if (accountSelectionReason) {
      confirmationMessage += `\n\n${accountSelectionReason}`;
    }
    
    // Create the final confirmation message with account details
    const billsText = billsToProcess.length === 1 
      ? `bill ${billsToProcess[0].bill_number || billsToProcess[0].id}` 
      : `${billsToProcess.length} bills`;
    
    const accountName = selectedAccountName || `account ${paymentAccountId}`;
    
    confirmationMessage += `\n\nI'll pay ${billsText} using the ${accountName} account.`;
    
    // Add total amount with proper formatting based on number of bills
    const totalAmount = billsToProcess.reduce((acc, bill) => acc + parseFloat(bill.total_amount) - parseFloat(bill.amount_paid || '0'), 0);
    confirmationMessage += `\n\n**Total amount to be paid: $${totalAmount.toFixed(2)}**`;
    
    // List the bills to be paid
    confirmationMessage += "\n\n**Bills to pay:**";
    billsToProcess.forEach(bill => {
      const remainingAmount = parseFloat(bill.total_amount) - parseFloat(bill.amount_paid || '0');
      confirmationMessage += `\n- ${bill.vendor_name}: ${bill.bill_number} - $${remainingAmount.toFixed(2)}`;
    });
    
    // Use appropriate wording based on number of bills
    confirmationMessage += billsToProcess.length === 1
      ? "\n\nWould you like me to proceed with recording this payment?"
      : "\n\nWould you like me to proceed with recording these payments?";
    
    // Check if user's intent is to execute payment immediately
    // Keywords that indicate immediate execution intent
    const executeKeywords = ['record', 'pay', 'make', 'process', 'execute'];
    
    // Extract the original query from context if available
    const originalQuery = context.query || '';
    const lowercaseQuery = originalQuery.toLowerCase();
    
    // Keywords that indicate an IMMEDIATE payment action
    const immediateActionKeywords = ['record', 'pay', 'make', 'process'];
    
    // If the query specifically mentions "open bills" or any combination of "pay/record" + "all", 
    // we should execute immediately
    const containsOpenBills = lowercaseQuery.includes('open') && lowercaseQuery.includes('bill');
    const containsAllBills = lowercaseQuery.includes('all') && lowercaseQuery.includes('bill');
    const containsPaymentAction = immediateActionKeywords.some(keyword => lowercaseQuery.includes(keyword));
    
    // Determine if we should execute immediately based on these signals
    const shouldExecuteImmediately = 
      // Special case for "record the payment of all open vendor bills"
      (containsOpenBills && containsPaymentAction) ||
      // Special case for "pay all bills" and variations
      (containsAllBills && containsPaymentAction) ||
      // Default case: any payment actions without specific confirmation requests
      (containsPaymentAction && !lowercaseQuery.includes('should'));
    
    console.log(`[handleBillPayment] Original query: "${originalQuery}", Payment analysis:`, {
      containsOpenBills,
      containsAllBills,
      containsPaymentAction,
      shouldExecuteImmediately
    });
    
    // If user's intent is clear, execute payment immediately
    if (shouldExecuteImmediately) {
      console.log(`[handleBillPayment] Executing payment immediately based on user intent`);
      
      try {
        // Import the bulk payment function
        const { processBulkBillPayments } = await import('./billPaymentHelper');
        
        // Execute the payment
        const result = await processBulkBillPayments(
          billIds,
          paymentAccountId,
          new Date().toISOString().split('T')[0], // Use today's date
          'ACH/Wire', // Default payment method
          undefined, // No reference number
          context.userId || ''
        );
        
        // Return result message
        if (result.success) {
          // Safely format the total paid amount, ensuring it's a number first
          const formattedTotal = typeof result.totalPaid === 'number' 
            ? result.totalPaid.toFixed(2) 
            : parseFloat(String(result.totalPaid)).toFixed(2);
          
          return {
            response: {
              success: true,
              message: `✅ Successfully recorded ${result.successCount} ${result.successCount === 1 ? 'payment' : 'payments'} totaling $${formattedTotal} using the ${accountName} account.\n\nEach payment has a journal entry that debits Accounts Payable and credits your ${accountName}.`
            },
            updatedPendingPayment: null // Clear pending payment since we executed it
          };
        } else {
          return {
            response: {
              success: false,
              message: `I encountered an issue while recording the payments: ${result.message}`
            },
            updatedPendingPayment: pendingPayment // Keep the pending payment in case user wants to retry
          };
        }
      } catch (error) {
        console.error('[handleBillPayment] Error executing immediate payment:', error);
        return {
          response: {
            success: false,
            message: `I encountered an error while trying to record the payments: ${error instanceof Error ? error.message : 'Unknown error'}`
          },
          updatedPendingPayment: pendingPayment // Keep the pending payment in case user wants to retry
        };
      }
    }
    
    // Otherwise, return the confirmation message and pendingPayment as before
    return {
      response: {
        success: true,
        message: confirmationMessage
      },
      updatedPendingPayment: pendingPayment
    };
  } catch (error) {
    console.error('[APAgent] Error preparing bill payment:', error);
    return {
      response: {
        success: false,
        message: `I encountered an error while preparing the payment: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again with more specific information.`
      },
      updatedPendingPayment: null
    };
  }
}

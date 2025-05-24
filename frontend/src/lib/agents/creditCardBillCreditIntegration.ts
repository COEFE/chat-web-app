import { BillCreditService } from './billCreditService';
import { BillCredit } from '@/lib/accounting/billCreditTypes';
import { sendAgentMessage, MessagePriority, MessageStatus, waitForAgentResponse } from '@/lib/agentCommunication';
import { sql } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Integration utility for Credit Card Agent to access Bill Credit functionality
 * This provides a simple interface for the credit card agent to create bill credits
 * for refunds, chargebacks, and other credit card related credits.
 */

const billCreditService = new BillCreditService();

/**
 * Create a bill credit for a credit card refund
 */
export async function createCreditCardRefund(params: {
  vendorId: number;
  vendorName: string;
  refundAmount: number;
  refundDate: string;
  description: string;
  expenseAccountId: number;
  apAccountId: number;
  userId?: string;
  authToken?: string;
  creditCardLastFour?: string;
  originalTransactionId?: string; // Changed from transactionId to match billCreditService
}): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Creating credit card refund bill credit:', params);
  
  return billCreditService.createCreditCardRefundBillCredit(params);
}

/**
 * Create a bill credit for a credit card chargeback
 */
export async function createCreditCardChargeback(params: {
  vendorId: number;
  vendorName: string;
  chargebackAmount: number;
  chargebackDate: string;
  description: string;
  expenseAccountId: number;
  apAccountId: number;
  userId?: string;
  authToken?: string;
  creditCardLastFour?: string;
  originalTransactionId?: string;
}): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Creating credit card chargeback bill credit:', params);
  
  return billCreditService.createCreditCardChargebackBillCredit(params);
}

/**
 * Create a general bill credit (for other credit card related credits)
 */
export async function createGeneralCreditCardBillCredit(params: {
  vendorId: number;
  vendorName: string;
  creditAmount: number;
  creditDate: string;
  description: string;
  expenseAccountId: number;
  apAccountId: number;
  userId?: string;
  authToken?: string;
  creditNumber?: string;
  memo?: string;
  creditCardLastFour?: string; // Added to support credit card info in description
}): Promise<{ success: boolean; billCredit?: BillCredit; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Creating general credit card bill credit:', params);
  
  const billCreditData = {
    vendor_id: params.vendorId,
    credit_number: params.creditNumber,
    credit_date: params.creditDate,
    total_amount: Math.abs(params.creditAmount),
    status: 'Applied',
    memo: params.memo || `Credit card credit: ${params.description}${params.creditCardLastFour ? ` (CC: *${params.creditCardLastFour})` : ''}`,
    ap_account_id: params.apAccountId,
    user_id: params.userId || 'system', // Add user_id to ensure it's properly set
    lines: [
      {
        expense_account_id: params.expenseAccountId,
        description: params.description,
        quantity: 1,
        unit_price: Math.abs(params.creditAmount),
        amount: Math.abs(params.creditAmount),
        category: 'Credit Card Credit',
      },
    ],
  };

  return billCreditService.createBillCredit(billCreditData, params.authToken);
}

/**
 * Get bill credits for a vendor (useful for checking existing credits)
 */
export async function getBillCreditsForVendor(
  vendorId: number,
  authToken?: string
): Promise<{ success: boolean; billCredits?: BillCredit[]; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Getting bill credits for vendor:', vendorId);
  
  return billCreditService.getBillCreditsForVendor(vendorId, authToken);
}

/**
 * Utility function to determine if a transaction should create a bill credit
 * This can be used by the credit card agent to decide when to create bill credits
 * IMPORTANT: Only vendor refunds should create bill credits, NOT credit card payments
 */
export function shouldCreateBillCredit(transaction: {
  amount: number;
  description: string;
  type?: string;
  vendor?: string;
  category?: string;
}): boolean {
  const { amount, description, type, vendor, category } = transaction;
  
  // Skip if this is a credit card payment (payment TO the credit card company)
  const paymentKeywords = [
    'payment', 'autopay', 'online payment', 'electronic payment',
    'payment received', 'thank you', 'payment - thank you',
    'payment thank you', 'payment posted', 'payment credited'
  ];
  
  const isPayment = paymentKeywords.some(keyword => 
    description.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (isPayment) {
    console.log('[BillCreditIntegration] Skipping payment transaction:', description);
    return false;
  }
  
  // Check if this is a vendor refund (credit FROM a vendor)
  const vendorRefundKeywords = [
    'refund', 'credit', 'return', 'chargeback', 'reversal', 
    'adjustment credit', 'merchant credit', 'dispute credit',
    'return credit', 'merchandise credit', 'store credit'
  ];
  
  const hasVendorRefundKeyword = vendorRefundKeywords.some(keyword => 
    description.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // Must be a credit (negative amount) AND have refund keywords AND have a vendor
  const isCredit = amount < 0 || type === 'refund' || type === 'credit';
  const hasVendor = Boolean(vendor && vendor.trim().length > 0);
  
  // Additional check: if description contains credit card company names, it's likely a payment
  const creditCardCompanies = [
    'visa', 'mastercard', 'amex', 'american express', 'discover',
    'chase', 'capital one', 'citi', 'bank of america', 'wells fargo'
  ];
  
  const isCreditCardCompany = creditCardCompanies.some(company => 
    description.toLowerCase().includes(company.toLowerCase()) ||
    (vendor && vendor.toLowerCase().includes(company.toLowerCase()))
  );
  
  if (isCreditCardCompany && !hasVendorRefundKeyword) {
    console.log('[BillCreditIntegration] Skipping credit card company transaction:', description);
    return false;
  }
  
  const shouldCreate = isCredit && hasVendorRefundKeyword && hasVendor && !isPayment;
  
  console.log('[BillCreditIntegration] Transaction analysis:', {
    description,
    amount,
    isCredit,
    hasVendorRefundKeyword,
    hasVendor,
    isPayment,
    isCreditCardCompany,
    shouldCreate
  });
  
  return shouldCreate;
}

/**
 * Utility function to determine the type of credit card credit
 */
export function getCreditCardCreditType(transaction: {
  amount: number;
  description: string;
  type?: string;
}): 'refund' | 'chargeback' | 'credit' | 'unknown' {
  const { description, type } = transaction;
  const desc = description.toLowerCase();
  
  if (type === 'refund' || desc.includes('refund') || desc.includes('return')) {
    return 'refund';
  }
  
  if (desc.includes('chargeback') || desc.includes('dispute')) {
    return 'chargeback';
  }
  
  if (type === 'credit' || desc.includes('credit') || desc.includes('adjustment')) {
    return 'credit';
  }
  
  return 'unknown';
}

/**
 * Determine the appropriate journal type for a bill credit using AI
 */
async function determineJournalTypeWithAI(params: {
  billCredit: BillCredit;
  transactionType: string;
  userId: string;
}): Promise<string> {
  console.log('[CreditCardBillCreditIntegration] Determining journal type with AI');
  
  try {
    // Get available journal types from the database
    const journalTypesQuery = await sql`
      SELECT code, name, description FROM journal_types
    `;
    
    if (journalTypesQuery.rows.length === 0) {
      console.log('[CreditCardBillCreditIntegration] No journal types found, using default AP');
      return 'AP'; // Default to AP if no journal types found
    }
    
    const journalTypes = journalTypesQuery.rows;
    console.log('[CreditCardBillCreditIntegration] Available journal types:', journalTypes);
    
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || '',
    });
    
    // Create prompt for Claude
    const prompt = `You are an expert accounting system. Your task is to determine the most appropriate journal type code for a bill credit transaction.

Transaction details:
- Type: ${params.transactionType} (refund, chargeback, or credit)
- Vendor: ${params.billCredit.vendor_name || 'Unknown vendor'}
- Amount: ${params.billCredit.total_amount}
- Memo: ${params.billCredit.memo || 'No memo provided'}

Available journal type codes:
${journalTypes.map(jt => `- ${jt.code}: ${jt.name} - ${jt.description || 'No description'}`).join('\n')}

Please select the most appropriate journal type code from the available options. Consider that bill credits typically involve accounts payable and expense accounts. Respond with ONLY the journal type code (e.g., 'AP' or 'GJ') and nothing else.`;
    
    // Call Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 50,
      temperature: 0,
      system: 'You are an expert accounting system that helps determine the appropriate journal type code for accounting transactions.',
      messages: [
        { role: 'user', content: prompt }
      ]
    });
    
    // Extract journal type from response
    const journalType = response.content[0].type === 'text' ? response.content[0].text.trim() : 'AP';
    
    // Validate journal type against available types
    const validJournalType = journalTypes.find(jt => jt.code === journalType);
    
    if (validJournalType) {
      console.log(`[CreditCardBillCreditIntegration] AI selected journal type: ${journalType}`);
      return journalType;
    } else {
      console.log(`[CreditCardBillCreditIntegration] AI selected invalid journal type: ${journalType}, using default AP`);
      return 'AP'; // Default to AP if AI returns invalid type
    }
  } catch (error) {
    console.error('[CreditCardBillCreditIntegration] Error determining journal type with AI:', error);
    return 'AP'; // Default to AP on error
  }
}

/**
 * Create a journal entry for a bill credit by communicating with the GL Agent
 */
export async function createJournalEntryForBillCredit(params: {
  billCredit: BillCredit;
  expenseAccountId: number;
  apAccountId: number;
  userId: string;
  conversationId?: string;
}): Promise<{ success: boolean; journalId?: number; error?: string }> {
  console.log('[CreditCardBillCreditIntegration] Creating journal entry for bill credit:', params.billCredit.id);
  
  try {
    // Get account information for the journal entry
    const expenseAccountQuery = await sql`
      SELECT code, name FROM accounts WHERE id = ${params.expenseAccountId} AND user_id = ${params.userId}
    `;
    const apAccountQuery = await sql`
      SELECT code, name FROM accounts WHERE id = ${params.apAccountId} AND user_id = ${params.userId}
    `;
    
    if (expenseAccountQuery.rows.length === 0 || apAccountQuery.rows.length === 0) {
      throw new Error('Could not find required accounts for journal entry');
    }
    
    const expenseAccount = expenseAccountQuery.rows[0];
    const apAccount = apAccountQuery.rows[0];
    
    // Determine the appropriate journal type using AI
    const transactionType = params.billCredit.memo?.toLowerCase().includes('refund') ? 'refund' : 
                           params.billCredit.memo?.toLowerCase().includes('chargeback') ? 'chargeback' : 'credit';
    
    const journalType = await determineJournalTypeWithAI({
      billCredit: params.billCredit,
      transactionType,
      userId: params.userId
    });
    
    // Prepare journal entry data for the GL Agent using the correct AIJournalEntry format
    const journalEntryData = {
      memo: `Bill Credit: ${params.billCredit.memo || `Credit from ${params.billCredit.vendor_name}`}`,
      transaction_date: params.billCredit.credit_date,
      journal_type: journalType, // Use AI-determined journal type
      reference_number: params.billCredit.credit_number || `BC-${params.billCredit.id}`,
      lines: [
        {
          account_code_or_name: expenseAccount.code || expenseAccount.name,
          description: `Credit to expense account - ${params.billCredit.vendor_name || 'Vendor'}`,
          credit: Math.abs(params.billCredit.total_amount)
        },
        {
          account_code_or_name: apAccount.code || apAccount.name,
          description: `Debit to AP account - ${params.billCredit.vendor_name || 'Vendor'}`,
          debit: Math.abs(params.billCredit.total_amount)
        }
      ]
    };

    // Send message to GL Agent to create journal entry
    const message = await sendAgentMessage(
      'credit_card_agent',
      'gl_agent',
      'CREATE_JOURNAL_ENTRY',
      {
        journalEntry: journalEntryData,
        billCreditId: params.billCredit.id,
        source: 'bill_credit'
      },
      params.userId,
      MessagePriority.HIGH,
      params.conversationId
    );

    console.log('[CreditCardBillCreditIntegration] Sent message to GL Agent:', message.id);

    // Wait for response from GL Agent
    const response = await waitForAgentResponse(message.id, 10000); // 10 second timeout

    if (response && response.status === MessageStatus.COMPLETED) {
      console.log('[CreditCardBillCreditIntegration] GL Agent successfully created journal entry');
      return {
        success: true,
        journalId: response.payload?.journalId
      };
    } else if (response && response.status === MessageStatus.FAILED) {
      console.error('[CreditCardBillCreditIntegration] GL Agent failed to create journal entry:', response.responseMessage);
      return {
        success: false,
        error: response.responseMessage || 'GL Agent failed to create journal entry'
      };
    } else {
      console.error('[CreditCardBillCreditIntegration] Timeout or no response from GL Agent');
      return {
        success: false,
        error: 'Timeout waiting for GL Agent response'
      };
    }

  } catch (error: any) {
    console.error('[CreditCardBillCreditIntegration] Error communicating with GL Agent:', error);
    return {
      success: false,
      error: error.message || 'Error communicating with GL Agent'
    };
  }
}

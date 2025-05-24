import { Vendor } from "./accounting/vendorQueries";
import { Bill, BillWithVendor } from "./accounting/accountingTypes";
import { getVendors } from "./accounting/vendorQueries";
import {
  getBills,
  getBillStatuses,
  updateBill,
  getBill,
} from "./accounting/billQueries";
import {
  getBillsWithVendors,
  getLastPaidBill,
  getVendorsWithPaidBills,
  getRecentBillPayments,
  BillLineDetail,
  BillWithDetails,
} from "./accounting/apQueries";
import { logAuditEvent } from "./auditLogger";
import { sql } from "@vercel/postgres";
import { getAccounts } from "./accounting/accountQueries";
import Anthropic from "@anthropic-ai/sdk"; // Added for AI call

/**
 * Extract JSON from a string, even if it's surrounded by other text
 * Used to parse Claude AI responses that may contain text before/after the JSON
 */
function extractJsonFromString(text: string): any {
  // Look for JSON-like patterns in the string
  const jsonPattern = /\{[\s\S]*\}/g;
  const matches = text.match(jsonPattern);
  
  if (!matches || matches.length === 0) {
    throw new Error('No JSON object found in the string');
  }
  
  // Try to parse each match as JSON, return the first valid one
  for (const match of matches) {
    try {
      return JSON.parse(match);
    } catch (e) {
      // Continue to the next match if this one isn't valid JSON
      continue;
    }
  }
  
  throw new Error('Could not parse any valid JSON from the string');
}

/**
 * Interface for AI-powered bill payment analysis
 */
export interface BillPaymentAnalysis {
  isPaymentQuery: boolean;
  confidence: number;
  paymentType?: 'bill' | 'invoice' | 'vendor' | 'general';
  reasoning?: string;
}

/**
 * Determine if a message is requesting to record bill payments using Claude AI
 */
export async function isBillPaymentQueryWithAI(
  message: string,
  anthropicClient?: Anthropic
): Promise<BillPaymentAnalysis> {
  console.log(`[APUtils] Using AI to check for bill payment in: "${message}"`);
  
  // Create local Anthropic client if not provided
  const anthropic = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
  });
  
  // System prompt for payment detection
  const systemPrompt = `You are an AI specialized in detecting payment intents in accounting systems.
  
  Analyze the given message and determine if it's requesting to record a payment for bills or invoices.
  Consider various ways users might express payment intents, such as:
  - Recording payments
  - Paying bills or invoices
  - Making payments to vendors
  - Marking bills as paid
  - Settling or clearing bills or invoices

  NOTE: In this system, "bills" and "invoices" both refer to accounts payable items.
  
  IMPORTANT - EXCLUDE CREDIT CARD TRANSACTIONS:
  Do NOT classify as payment queries if the message is about:
  - Credit card refunds (e.g., "Amazon refund", "charge was refunded")
  - Credit card chargebacks
  - Credit card statement processing
  - Credit card transactions or charges
  These should be handled by the credit card agent, not the AP agent.
  
  ONLY classify as payment queries if it's about:
  - Paying existing bills to vendors
  - Recording payments made to vendors
  - Marking bills as paid
  - Bill payment processing
  
  Return a JSON object with:
  - isPaymentQuery: true if the message is about making/recording a payment, false otherwise
  - confidence: number between 0 and 1 indicating your confidence level
  - paymentType: 'bill', 'invoice', 'vendor', or 'general' indicating what kind of payment
  - reasoning: brief explanation of why you classified it this way

  Return ONLY the JSON object with no additional text.`;

  try {
    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      temperature: 0,
      messages: [
        { role: "user", content: `${systemPrompt}\n\nMessage to analyze: ${message}` }
      ]
    });

    // Parse response
    let responseText = '';
    if (response.content[0].type === 'text') {
      responseText = response.content[0].text;
    }
    
    try {
      const result = JSON.parse(responseText);
      console.log(`[APUtils] AI payment detection result:`, result);
      return result as BillPaymentAnalysis;
    } catch (parseError) {
      console.error(`[APUtils] Error parsing AI response: ${parseError}. Raw response: ${responseText}`);
      // Fallback with default value
      return {
        isPaymentQuery: false,
        confidence: 0,
        reasoning: `Error parsing AI response: ${parseError}`
      };
    }
  } catch (error) {
    console.error(`[APUtils] Error calling AI for payment detection: ${error}`);
    // Fallback with default value
    return {
      isPaymentQuery: false,
      confidence: 0,
      reasoning: `Error calling AI: ${error}`
    };
  }
}

/**
 * Determine if a message is requesting to record bill payments (legacy pattern-based version)
 * This function is kept for fallback if AI is unavailable
 */
export function isBillPaymentQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Checking for bill payment in: "${normalized}"`);

  // Payment recording patterns
  const paymentPatterns = [
    /record\s+.*\s*payment/i,
    /pay\s+.*\s*bill/i,
    /make\s+.*\s*payment/i,
    /record\s+.*\s*bill\s+payment/i,
    /pay\s+.*\s*invoice/i,
    /record\s+.*\s*invoice\s+payment/i,
    /payment\s+for\s+.*\s*invoice/i,
    /mark\s+.*\s*bill\s+.*\s*paid/i,
    /mark\s+.*\s*invoice\s+.*\s*paid/i,
    /mark\s+.*\s*paid/i,
    /pay\s+.*\s*vendor/i,
    /payment\s+for\s+.*\s*bill/i,
    /payment\s+to\s+.*\s*vendor/i,
    /settle\s+.*\s*bill/i,
    /settle\s+.*\s*invoice/i,
    /clear\s+.*\s*bill/i,
    /clear\s+.*\s*invoice/i,
  ];

  // Check if any pattern matches
  for (const pattern of paymentPatterns) {
    if (pattern.test(normalized)) {
      console.log(`[APUtils] Bill payment pattern matched: ${pattern}`);
      return true;
    }
  }

  // Additional logging for debug
  console.log(
    `[APUtils] No bill payment patterns matched for: "${normalized}"`
  );
  return false;
}

/**
 * Extract payment information from a bill payment query
 */
export function extractPaymentInfoFromQuery(message: string): {
  vendor_name?: string;
  bill_number?: string;
  amount?: number;
  payment_date?: string;
  payment_account?: string;
  payment_method?: string;
  reference_number?: string;
  all_bills?: boolean;
} {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Extracting payment info from: "${normalized}"`);

  const paymentInfo: {
    vendor_name?: string;
    bill_number?: string;
    amount?: number;
    payment_date?: string;
    payment_account?: string;
    payment_method?: string;
    reference_number?: string;
    all_bills?: boolean;
  } = {};

  // *** BILL/INVOICE DETECTION LOGIC - FOR ALL QUERIES WITH PAYMENT INTENT *** //
  // If user wants to record a payment but doesn't specify which bill or invoice,
  // assume they want to pay all open bills/invoices
  const isRecordingPayment = (
    normalized.includes('record') || 
    normalized.includes('pay') || 
    normalized.includes('process') ||
    normalized.includes('settle') ||
    normalized.includes('clear')
  );
  
  const isSpecificBill = /bill\s+(?:number|#)\s*([A-Za-z0-9-]+)/i.test(normalized) || 
                        /invoice\s+(?:number|#)\s*([A-Za-z0-9-]+)/i.test(normalized);
                        
  // Check if this is specifically about invoices
  const isAboutInvoices = normalized.includes('invoice') || normalized.includes('invoices');
  
  // Special case for "record the payment of all open vendor bills/invoices" and similar phrases
  if ((normalized.includes('open') && (normalized.includes('bill') || normalized.includes('invoice')))) {
    console.log(`[APUtils] Detected 'open bills/invoices' phrase in: "${normalized}"`);
    paymentInfo.all_bills = true;
  } 
  // Check for "all bills/invoices" phrasing
  else if (normalized.includes('all') && (normalized.includes('bill') || normalized.includes('invoice'))) {
    console.log(`[APUtils] Detected 'all bills/invoices' phrase in: "${normalized}"`);
    paymentInfo.all_bills = true;
  }
  // Check for general terms like "these invoices"
  else if (normalized.match(/these\s+invoices/i) || normalized.match(/the\s+invoices/i)) {
    console.log(`[APUtils] Detected reference to 'these invoices' in: "${normalized}"`);
    paymentInfo.all_bills = true;
  }
  // Default to all bills for general payment requests with no specific bill
  else if (isRecordingPayment && !isSpecificBill) {
    console.log(`[APUtils] Payment request without specific bill/invoice, defaulting to all bills: "${normalized}"`);
    paymentInfo.all_bills = true;
  }

  // Extract vendor name patterns
  const vendorPatterns = [
    /(?:pay|payment|bill)\s+(?:for|to|from)\s+([A-Za-z0-9\s&.]+?)(?:\s+for|\s+in|\s+amount|\s+due|$)/i,
    /from\s+([A-Za-z0-9\s&.]+?)(?:\s+for|\s+in|\s+amount|\s+due|$)/i,
  ];

  // First check for a vendor name match
  let possibleVendorName = null;
  for (const pattern of vendorPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      possibleVendorName = match[1].trim();
      break;
    }
  }
  
  // Don't use generic terms like "these bills" or "the bills" as vendor names
  const invalidVendorTerms = [
    'these bills', 'the bills', 'all bills',
    'these invoices', 'the invoices', 'all invoices',
    'bills', 'invoices'
  ];
  
  if (possibleVendorName && !invalidVendorTerms.includes(possibleVendorName.toLowerCase())) {
    paymentInfo.vendor_name = possibleVendorName;
  }

  // Extract bill number patterns
  const billNumberPatterns = [
    /bill\s+(?:number|#)\s*([A-Za-z0-9-]+)/i,
    /invoice\s+(?:number|#)\s*([A-Za-z0-9-]+)/i,
    /bill\s+([A-Za-z0-9-]+)\s+from/i,
    /invoice\s+([A-Za-z0-9-]+)\s+from/i,
  ];

  for (const pattern of billNumberPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      paymentInfo.bill_number = match[1].trim();
      break;
    }
  }

  // Extract payment amount
  const amountPatterns = [
    /\$\s*(\d+(?:[.,]\d+)?)/i,
    /(?:amount|pay|payment|total)\s+(?:of|is)?\s*\$?\s*(\d+(?:[.,]\d+)?)/i,
    /(\d+(?:[.,]\d+)?)\s+(?:dollars|USD)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      const amountStr = match[1].replace(/,/g, "");
      paymentInfo.amount = parseFloat(amountStr);
      break;
    }
  }

  // Extract payment account
  const accountPatterns = [
    /(?:using|from|with)\s+(?:the\s+)?([A-Za-z0-9\s&.]+?)\s+(?:account|acct)/i,
    /(?:using|from|with)\s+(?:the\s+)?([A-Za-z0-9\s&.]+?)\s+(?:bank|checking|savings)/i,
    /(?:account|acct)\s+([A-Za-z0-9\s&.]+)/i,
  ];

  for (const pattern of accountPatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      paymentInfo.payment_account = match[1].trim();
      break;
    }
  }

  // Extract payment method
  if (normalized.includes("check")) {
    paymentInfo.payment_method = "Check";
  } else if (
    normalized.includes("ach") ||
    normalized.includes("wire") ||
    normalized.includes("transfer")
  ) {
    paymentInfo.payment_method = "ACH/Wire";
  } else if (
    normalized.includes("credit card") ||
    normalized.includes("card")
  ) {
    paymentInfo.payment_method = "Credit Card";
  } else if (normalized.includes("cash")) {
    paymentInfo.payment_method = "Cash";
  }

  // Extract reference number (check number, transaction ID, etc.)
  const referencePatterns = [
    /(?:reference|ref|check)\s+(?:number|#|no\.?)\s*([A-Za-z0-9-]+)/i,
    /(?:transaction|confirmation)\s+(?:id|number|#)\s*([A-Za-z0-9-]+)/i,
  ];

  for (const pattern of referencePatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      paymentInfo.reference_number = match[1].trim();
      break;
    }
  }

  // Extract payment date
  const datePatterns = [
    /(?:on|dated|date)\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    /(?:on|dated|date)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = normalized.match(pattern);
    if (match && match[1]) {
      // Simple date parsing - in a real app, you'd want more robust date parsing
      paymentInfo.payment_date = match[1].trim();
      break;
    }
  }

  // If no date specified, default to today
  if (!paymentInfo.payment_date) {
    const today = new Date();
    paymentInfo.payment_date = today.toISOString().split("T")[0]; // YYYY-MM-DD format
  }

  console.log(`[APUtils] Extracted payment info:`, paymentInfo);
  return paymentInfo;
}
/**
 * Interface for AI-powered payment extraction response
 */
export interface PaymentInfoExtraction {
  vendor_name?: string;
  bill_number?: string;
  amount?: number;
  payment_date?: string;
  payment_account?: string;
  payment_method?: string;
  reference_number?: string;
  all_bills?: boolean;
  confidence: number;
  reasoning?: string;
}

/**
 * Extract payment information from a message using Claude AI
 * This is the AI-powered version of extractPaymentInfoFromQuery
 */
export async function extractPaymentInfoWithAI(
  message: string,
  anthropicClient?: Anthropic
): Promise<PaymentInfoExtraction> {
  console.log(`[APUtils] Using AI to extract payment info from: "${message}"`); 
  
  // Use the provided anthropic client or create a new one
  const client = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
  });

  const systemPrompt = `You are an AI specialized in extracting payment information from user messages in an accounting system.
  
  Analyze the given message and extract structured information about a payment request. 
  The user's query may be asking to record a payment for bills or invoices, and you need to extract relevant details.
  
  Keys to extract (all are optional - only extract what's explicitly mentioned):
  - vendor_name: Name of the vendor being paid (if mentioned)
  - bill_number: Specific bill or invoice number (if mentioned)
  - amount: Payment amount (if mentioned)
  - payment_date: When the payment is/was made (if mentioned, otherwise use today's date)
  - payment_account: Account used for the payment (if mentioned)
  - payment_method: Method of payment, such as Check, ACH/Wire, Credit Card, Cash (if mentioned)
  - reference_number: Any reference or confirmation number (if mentioned)
  - all_bills: Boolean true if the request is to pay all bills or if no specific bill is mentioned
  
  Be careful NOT to interpret general terms like "these bills", "the bills", or "all bills" as vendor names.
  Be careful not to include any text about bills or invoices in the vendor name, unless it's clearly part of the vendor name.
  
  Format your response as JSON with these fields, plus:
  - confidence: Number between 0-1 indicating how confident you are in this extraction
  - reasoning: Brief explanation of your extraction decisions
  
  Only include fields in your response that can be confidently extracted from the message.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: message
      }]
    });

    // Parse the AI response to extract the result
    if (!response.content || response.content.length === 0) {
      console.log('[APUtils] Empty response from Claude when extracting payment info');
      return {
        all_bills: true,  // Default to all bills for empty responses
        payment_date: new Date().toISOString().split("T")[0], // Default to today
        confidence: 0.1,
        reasoning: "AI returned empty response, defaulting to minimal info"
      };
    }

    // Get the content as text
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Try to parse JSON from the response
    try {
      const extractedData = extractJsonFromString(responseText);
      console.log('[APUtils] AI payment extraction result:', extractedData);
      
      // Ensure all_bills is true if no specific bill info is provided
      if (!extractedData.bill_number && !extractedData.vendor_name) {
        extractedData.all_bills = true;
      }
      
      // Default payment date to today if not provided
      if (!extractedData.payment_date) {
        extractedData.payment_date = new Date().toISOString().split("T")[0];
      }
      
      return extractedData;
    } catch (jsonError) {
      console.error('[APUtils] Error parsing AI payment extraction JSON:', jsonError);
      // Fallback to pattern extraction
      const fallbackData = extractPaymentInfoFromQuery(message);
      return {
        ...fallbackData,
        confidence: 0.3,
        reasoning: "AI response parsing failed, used fallback pattern matching"
      };
    }
  } catch (error) {
    console.error('[APUtils] Error in AI payment extraction:', error);
    // Fallback to the regex-based approach
    const fallbackData = extractPaymentInfoFromQuery(message);
    return {
      ...fallbackData,
      confidence: 0.3,
      reasoning: "AI request failed, used fallback pattern matching"
    };
  }
}

/**
 * Interface for AI-powered bill status update analysis
 */
export interface BillStatusUpdateAnalysis {
  isUpdateRequest: boolean;
  confidence: number;
  isBulkUpdate: boolean;
  updateType?: 'mark_paid' | 'mark_open' | 'mark_void' | 'post' | 'general';
  limitToRecent?: number;
  reasoning?: string;
}

/**
 * Determine if a message is requesting a bill status update using Claude AI
 * This replaces the pattern-based simplifiedBillStatusCheck function
 */
export async function detectBillStatusUpdateWithAI(
  message: string,
  anthropicClient?: Anthropic
): Promise<BillStatusUpdateAnalysis> {
  console.log(`[APUtils] Using AI to detect bill status update in: "${message}"`);
  
  // Use the provided anthropic client or create a new one
  const client = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
  });

  const systemPrompt = `You are an AI specialized in analyzing payment and bill management requests in an accounting system.
  
  Analyze the given message and determine if it's requesting to update the status of one or more bills (such as marking bills as paid, posting bills, etc.).
  
  Focus on these key aspects:
  - Is this a request to change the status of bills? (e.g., marking as paid, posting, etc.)
  - Does it apply to multiple bills (bulk update) or a specific bill?
  - Is there any mention of limiting to recent bills?
  
  Common bill status update patterns include:
  - Requests to pay bills ("pay all open bills")
  - Requests to record payments ("record payment for these bills")
  - Requests to mark bills as paid or posted ("mark these bills as paid")
  - Requests to change bill status ("change bill status to paid")
  
  Format your response as JSON with these fields:
  - isUpdateRequest: Boolean indicating if this is a bill status update request
  - confidence: Number between 0-1 indicating how confident you are
  - isBulkUpdate: Boolean indicating if this applies to multiple bills
  - updateType: Optional string, one of: 'mark_paid', 'mark_open', 'mark_void', 'post', 'general'
  - limitToRecent: Optional number indicating a limit to recent bills (if specified)
  - reasoning: Brief explanation of your analysis
  
  Only include fields in your JSON that are relevant to the message.`;

  try {
    const response = await client.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: message
      }]
    });

    // Parse the AI response
    if (!response.content || response.content.length === 0) {
      console.log('[APUtils] Empty response from Claude when detecting bill status update');
      return {
        isUpdateRequest: false,
        confidence: 0.1,
        isBulkUpdate: false,
        reasoning: "AI returned empty response"
      };
    }

    // Get the content as text
    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Try to parse JSON from the response
    try {
      const analysisData = extractJsonFromString(responseText);
      console.log('[APUtils] AI bill status update detection result:', analysisData);
      return analysisData;
    } catch (jsonError) {
      console.error('[APUtils] Error parsing AI bill status update JSON:', jsonError);
      // Fallback to a default response
      return {
        isUpdateRequest: false,
        confidence: 0.2,
        isBulkUpdate: false,
        reasoning: "Failed to parse AI response JSON"
      };
    }
  } catch (error) {
    console.error('[APUtils] Error in AI bill status update detection:', error);
    // Return a default response on error
    return {
      isUpdateRequest: false,
      confidence: 0.1,
      isBulkUpdate: false,
      reasoning: "AI request failed"
    };
  }
}

/**
 * Interface for AI-powered bill creation analysis
 */
export interface BillCreationAnalysis {
  isCreationQuery: boolean;
  confidence: number;
  billType?: 'ap' | 'ar' | 'general';
  reasoning?: string;
}

/**
 * Determine if a message is requesting to create a bill using Claude AI
 */
export async function isBillCreationQueryWithAI(
  message: string,
  anthropicClient?: Anthropic
): Promise<BillCreationAnalysis> {
  console.log(`[APUtils] Using AI to check for bill creation in: "${message}"`);
  
  // Create local Anthropic client if not provided
  const anthropic = anthropicClient || new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    dangerouslyAllowBrowser: true
  });
  
  // System prompt for bill creation detection
  const systemPrompt = `You are an AI specialized in detecting bill creation intents in accounting systems.
  
  Analyze the given message and determine if it's requesting to create or add a new bill in an accounts payable system.
  Consider various ways users might express bill creation intents, such as:
  - Creating a new bill or invoice
  - Adding a bill for a vendor
  - Recording an invoice from a supplier
  - Entering a new bill
  
  IMPORTANT: Distinguish between bill creation and bill payment.
  - Bill CREATION is about RECORDING a NEW bill in the system (example: "Create a bill for Amazon")
  - Bill PAYMENT is about PAYING an EXISTING bill (example: "Pay the Amazon bill", "Record payment for bills")
  
  Requests about recording PAYMENTS should be classified as NOT bill creation.
  
  Return a JSON object with:
  - isCreationQuery: true if the message is about creating/recording a new bill/invoice, false if it's about payment or something else
  - confidence: number between 0 and 1 indicating your confidence level
  - billType: 'ap' (accounts payable), 'ar' (accounts receivable), or 'general'
  - reasoning: brief explanation of why you classified it this way

  Return ONLY the JSON object with no additional text.`;

  try {
    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      temperature: 0,
      messages: [
        { role: "user", content: `${systemPrompt}\n\nMessage to analyze: ${message}` }
      ]
    });

    // Parse response
    let responseText = '';
    if (response.content[0].type === 'text') {
      responseText = response.content[0].text;
    }
    
    try {
      const result = JSON.parse(responseText);
      console.log(`[APUtils] AI bill creation detection result:`, result);
      return result as BillCreationAnalysis;
    } catch (parseError) {
      console.error(`[APUtils] Error parsing AI response: ${parseError}. Raw response: ${responseText}`);
      // Fallback with default value
      return {
        isCreationQuery: false,
        confidence: 0,
        reasoning: `Error parsing AI response: ${parseError}`
      };
    }
  } catch (error) {
    console.error(`[APUtils] Error calling AI for bill creation detection: ${error}`);
    // Fallback with default value
    return {
      isCreationQuery: false,
      confidence: 0,
      reasoning: `Error calling AI: ${error}`
    };
  }
}

/**
 * Determine if a message is requesting to create a bill (legacy pattern-based version)
 * This function is kept for fallback if AI is unavailable
 */
export function isBillCreationQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Checking for bill creation in: "${normalized}"`);

  // IMPORTANT: Exclude payment-related queries
  // Check if this might be a payment query first
  if (
    normalized.includes("payment") ||
    normalized.includes(" pay ") ||
    normalized.includes("paying") ||
    (normalized.includes("open") && normalized.includes("bill")) ||
    normalized.includes("operating account") // Common in payment requests
  ) {
    console.log(`[APUtils] Message contains payment terms, not considering as bill creation`);
    return false;
  }

  // First, use a simple but broad check for the keywords "bill" and "create"
  // This catches phrases like "I need to create an Amazon bill"
  if (
    normalized.includes("bill") &&
    (normalized.includes("create") ||
      normalized.includes("add") ||
      normalized.includes("enter") ||
      normalized.includes("new"))
  ) {
    console.log(`[APUtils] Simple bill creation pattern matched with keywords`);

    // Only consider it as AR invoice if explicitly mentions customer or AR
    if (
      normalized.includes("customer") ||
      normalized.includes("accounts receivable") ||
      normalized.includes("ar ")
    ) {
      console.log(`[APUtils] Not AP bill - seems to be AR related`);
      return false;
    }

    return true;
  }

  // Detailed patterns for bill creation queries
  const billCreatePatterns = [
    // Basic patterns with very flexible matching
    /create\s+.*\s*bill/i,
    /add\s+.*\s*bill/i,
    /enter\s+.*\s*bill/i,
    // Modified to exclude payment-related queries
    /record\s+(?!.*payment)(?!.*pay).*\s*bill/i,
    /need.*create.*bill/i, // This should match "I need to create an Amazon bill"

    // Want/Need patterns with flexible matching
    /want\s+.*create\s+.*bill/i,
    /need\s+.*create\s+.*bill/i,
    /would\s+like\s+.*create\s+.*bill/i,
    /need\s+.*add\s+.*bill/i,

    // Vendor-specific bill creation
    /\b(amazon|vendor)\s+bill\b/i,
    /bill\s+(for|from)\s+/i,
    /\bnew\s+bill\b/i,
    /\bbill\s+for\s+/i,
  ];

  // Check if any pattern matches
  for (const pattern of billCreatePatterns) {
    if (pattern.test(normalized)) {
      console.log(`[APUtils] Bill creation pattern matched: ${pattern}`);
      return true;
    }
  }

  // Additional logging for debug
  console.log(
    `[APUtils] No bill creation patterns matched for: "${normalized}"`
  );
  return false;
}

/**
 * Extract bill information from a bill creation query
 */
export function extractBillInfoFromQuery(message: string): {
  vendor_name?: string;
  bill_number?: string;
  amount?: number;
  due_date?: string;
  description?: string;
} {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Extracting bill info from: "${normalized}"`);

  const billInfo: {
    vendor_name?: string;
    bill_number?: string;
    amount?: number;
    due_date?: string;
    description?: string;
  } = {};

  // Extract vendor name patterns
  const vendorPatterns = [
    // Standard patterns
    /(?:bill|invoice)\s+(?:for|from)\s+([A-Za-z0-9\s&.]+?)(?:\s+for|\s+in|\s+amount|\s+due|$)/i,
    /from\s+([A-Za-z0-9\s&.]+?)(?:\s+for|\s+in|\s+amount|\s+due|$)/i,
    // Additional patterns for more scenarios
    /new\s+bill\s+from\s+([A-Za-z0-9\s&.]+)/i,
    /enter\s+a\s+(?:new\s+)?(?:bill|invoice)\s+from\s+([A-Za-z0-9\s&.]+)/i,
    /([A-Za-z0-9\s&.]+?)\s+(?:bill|invoice)\s+(?:for|of)\s+[$]?\d+/i,
  ];

  for (const pattern of vendorPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.vendor_name = match[1].trim();
      break;
    }
  }

  // Extract bill/invoice number
  const billNumberPattern =
    /(?:bill|invoice)\s+(?:number|#)\s*([A-Za-z0-9\-]+)/i;
  const billNumberMatch = message.match(billNumberPattern);
  if (billNumberMatch && billNumberMatch[1]) {
    billInfo.bill_number = billNumberMatch[1].trim();
  }

  // Extract amount - look for various patterns
  const amountPatterns = [
    // Amount following a keyword
    /(?:amount|total|sum|cost)\s*(?:of|:)?\s*[$]?(\d+(?:\.\d{1,2})?)/i,
    // Plain dollar amount with $ sign
    /[$\$](\d+(?:\.\d{1,2})?)/i,
    // Amount followed by 'dollars'
    /(\d+(?:\.\d{1,2})?)\s*dollars/i,
    // Simple amount pattern at the end of phrases like "for $X"
    /for\s+[$]?(\d+(?:\.\d{1,2})?)/i,
  ];

  for (const pattern of amountPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.amount = parseFloat(match[1]);
      break;
    }
  }

  // Extract due date
  const dueDatePattern =
    /(?:due|payment)\s+(?:date|on)\s*(?:of|:)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i;
  const dueDateMatch = message.match(dueDatePattern);
  if (dueDateMatch && dueDateMatch[1]) {
    billInfo.due_date = dueDateMatch[1];
  }

  // Extract description/memo
  const descriptionPatterns = [
    // Standard pattern
    /(?:for|description|memo|notes?)\s*(?::|is|are|of)?\s*["']?([^"'\n\r.]+)["']?/i,
    // Pattern for "X for Y" format
    /(?:[$]?\d+(?:\.\d{1,2})?)\s+for\s+([^.\n\r]+)(?:\.|$)/i,
    // Pattern for descriptions at the end of a sentence
    /\bfor\s+([^.\n\r]+)(?:\.|$)/i,
  ];

  for (const pattern of descriptionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.description = match[1].trim();
      break;
    }
  }

  console.log("[APUtils] Extracted bill info:", billInfo);
  return billInfo;
}

/**
 * Check if a query might be about accounts payable topics
 * Uses keyword detection and common AP phrases
 */
export function mightBeAboutAP(query: string): boolean {
  // First check if this is a bill creation request
  // This should take precedence over other checks
  if (isBillCreationQuery(query)) {
    console.log(
      `[APUtils] Query detected as bill creation request: "${query}"`
    );
    return true;
  }

  // Check if this is a vendor creation request
  if (isVendorCreationQuery(query)) {
    console.log(
      `[APUtils] Query detected as vendor creation request: "${query}"`
    );
    return true;
  }

  // Keywords or phrases that might indicate an AP-related query
  const apKeywords = [
    "accounts payable",
    "vendor",
    "vendors",
    "supplier",
    "suppliers",
    "ap ",
    "bills",
    "bill payment",
    "bill from", // Add pattern that's common in bill creation
    "due date",
    "invoice approval",
    "payment term",
    "purchase order",
    "creditor",
    "aging report",
    "create vendor",
    "add vendor",
    "new vendor",
    "new supplier",
  ];

  const normalizedQuery = query.toLowerCase();

  // Special handling for vendor creation follow-up messages
  // Detect comma-separated lists with common vendor info patterns
  if (query.includes(",")) {
    // Check if query contains patterns that look like contact info
    const parts = query.split(",").map((p: string) => p.trim());
    let infoCount = 0;

    // Count how many parts look like vendor information
    for (const part of parts) {
      if (
        // Email pattern
        /[\w\.-]+@[\w\.-]+\.[a-z]{2,}/i.test(part) ||
        // Phone number pattern
        /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/.test(part) ||
        // Address with number pattern
        /^\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl)/i.test(
          part
        ) ||
        // Person name pattern (1-3 words, all alpha)
        /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(part)
      ) {
        infoCount++;
      }
    }

    // If at least 2 parts look like vendor info, this is likely a vendor-related message
    if (infoCount >= 2) {
      console.log(
        `[APUtils] Detected vendor information in comma-separated format: ${infoCount} fields`
      );
      return true;
    }
  }

  // Check if any keyword is in the query
  return apKeywords.some((keyword) =>
    query.toLowerCase().includes(keyword.toLowerCase())
  );
}

// AI-Powered function to analyze if a message is about bill status updates or queries.
export interface BillStatusAnalysis {
  isStatusRelated: boolean;
  isUpdateRequest: boolean;
  targetStatus?: string; 
  isQueryByStatus: boolean;
  queriedStatus?: string;
  billNumbers?: string[];
  isBulkUpdate?: boolean;
  queryType?: 'count' | 'list' | 'specific_bill_info' | 'general_status_summary';
  // Add other fields if extractable by AI, e.g., date constraints, vendor info related to status query
}

export async function isBillStatusUpdateQuery(
  message: string,
  anthropic: Anthropic,
  userId?: string // Optional, for logging/context if needed
): Promise<BillStatusAnalysis> {
  const prompt = `Analyze the following user query related to vendor bills to determine if it's about updating bill statuses or querying bills by status. Provide a JSON response with the following structure:
{
  "isStatusRelated": boolean, // true if the query is about bill statuses in any way (update or query)
  "isUpdateRequest": boolean, // true if the user wants to *change or set* a bill's status
  "targetStatus": "string | null", // If isUpdateRequest is true, the status to set (e.g., "Paid", "Void", "Approved"). Normalize to common statuses.
  "isQueryByStatus": boolean, // true if the user is *asking about* bills with a certain status (e.g., "how many open bills", "list paid bills")
  "queriedStatus": "string | null", // If isQueryByStatus is true, the status category being queried (e.g., "Open", "Paid", "Draft", "Overdue"). Normalize to common categories.
  "billNumbers": "string[] | null", // An array of specific bill numbers mentioned, if any.
  "isBulkUpdate": boolean, // true if the request implies action on multiple bills (e.g. "pay all open bills", "post selected invoices"). False if about a single bill or a general query.
  "queryType": "count | list | specific_bill_info | general_status_summary | null" // If isQueryByStatus, classify the type of query.
}

User Query: "${message}"

JSON Response:`;

  try {
    if (userId) { 
      console.log(`[APUtils.isBillStatusUpdateQuery] Processing for user: ${userId}, query: "${message}"`);
    }
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307", // Using Haiku for potentially faster/cheaper responses
      max_tokens: 400, 
      messages: [{ role: "user", content: prompt }],
    });

    let jsonResponseString = "";
    if (response.content && response.content.length > 0 && response.content[0].type === 'text') {
        jsonResponseString = response.content[0].text;
    }
    
    const cleanedJsonResponseString = jsonResponseString.replace(/```json\n?|\n?```/g, '').trim();
    
    if (!cleanedJsonResponseString) {
        console.error('[APUtils.isBillStatusUpdateQuery] AI response was empty after cleaning.');
        return {
            isStatusRelated: false, 
            isUpdateRequest: false,
            isQueryByStatus: false,
            billNumbers: [],
            isBulkUpdate: false,
        };
    }

    const analysisResult = JSON.parse(cleanedJsonResponseString) as BillStatusAnalysis;
    
    if (typeof analysisResult.isStatusRelated !== 'boolean' ||
        typeof analysisResult.isUpdateRequest !== 'boolean' ||
        typeof analysisResult.isQueryByStatus !== 'boolean') {
        console.error('[APUtils.isBillStatusUpdateQuery] AI response does not match expected structure:', analysisResult);
        return {
            isStatusRelated: false,
            isUpdateRequest: false,
            isQueryByStatus: false,
            billNumbers: [],
            isBulkUpdate: false,
        };
    }
    
    return analysisResult;

  } catch (error) {
    console.error('[APUtils.isBillStatusUpdateQuery] Error calling Anthropic or parsing response:', error);
    return {
      isStatusRelated: false, 
      isUpdateRequest: false,
      isQueryByStatus: false,
      billNumbers: [],
      isBulkUpdate: false,
    };
  }
}

/**
 * Determine if a message is requesting to create a vendor
 */
export function isVendorCreationQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Checking for vendor creation in: "${normalized}"`);

  // Patterns for vendor creation queries
  const vendorCreatePatterns = [
    // Basic patterns
    /create\s+(new\s+)?(vendor|supplier)/i,
    /add\s+(new\s+)?(vendor|supplier)/i,
    /set\s+up\s+(new\s+)?(vendor|supplier)/i,
    /new\s+(vendor|supplier)/i,

    // Want/Need patterns
    /want\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i, // Handles "want create"
    /need\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,
    /would\s+like\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,
    /want\s+(a\s*)?(new\s*)?(vendor|supplier)/i, // Handles "want a new vendor"
    /i\s+want\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i, // Explicitly match "I want"

    // More specific patterns
    /create\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(called|named|with|for)/i,
    /add\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(called|named|with|for)/i,

    // Specific vendor creation with name
    /create\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(account|record)?\s+for\s+([^,\.]+)/i,

    // General pattern
    /new\s+(vendor|supplier)\s+(called|named|for)/i,

    // Allow vendor name between the action and the word vendor/supplier
    /create\s+(?:a\s+)?(?:new\s+)?[\w&.'\-]+(?:\s+[\w&.'\-]+)*\s+(vendor|supplier)/i,
    /(?:i\s+)?want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?[\w&.'\-]+(?:\s+[\w&.'\-]+)*\s+(vendor|supplier)/i,
  ];

  // Check each pattern and log which one matches
  for (const pattern of vendorCreatePatterns) {
    if (pattern.test(normalized)) {
      console.log(`[APUtils] Vendor creation pattern matched: ${pattern}`);
      console.log(`[APUtils] Is vendor creation query: true`);
      return true;
    }
  }

  console.log(`[APUtils] Is vendor creation query: false`);
  return false;
}

/**
 * Find relevant vendors based on a query
 * @param query The user's query text
 * @param limit Maximum number of vendors to return
 */
export async function findRelevantVendors(
  query: string,
  limit: number = 5
): Promise<Vendor[]> {
  try {
    // Check if query might be about vendors that were paid
    const normalizedQuery = query.toLowerCase();
    const isPaidQuery =
      normalizedQuery.includes("paid") ||
      normalizedQuery.includes("payment") ||
      normalizedQuery.includes("which vendor");

    // If asking about paid vendors, use specialized query
    if (isPaidQuery) {
      const paidVendors = await getVendorsWithPaidBills(limit);
      if (paidVendors.length > 0) {
        return paidVendors;
      }
    }

    // Extract potential vendor names or keywords from the query
    const searchTerms = extractVendorSearchTerms(query);
    let allVendors: Vendor[] = [];

    // Search for each term individually to improve matches
    for (const term of searchTerms) {
      if (term.length < 3) continue; // Skip very short terms

      const { vendors } = await getVendors(1, limit, term);
      allVendors = [...allVendors, ...vendors];
    }

    // Deduplicate vendors by ID
    const uniqueVendors = allVendors.filter(
      (vendor, index, self) =>
        index === self.findIndex((v) => v.id === vendor.id)
    );

    // Limit the number of results
    return uniqueVendors.slice(0, limit);
  } catch (error) {
    console.error("[APUtils] Error finding relevant vendors:", error);
    return [];
  }
}

/**
 * Find relevant bills based on a query
 * @param query The user's query text
 * @param limit Maximum number of bills to return
 */
export async function findRelevantBills(
  query: string,
  limit: number = 5,
  vendorId?: number
): Promise<BillWithDetails[]> {
  try {
    // Check if query might be about recent or paid bills
    const normalizedQuery = query.toLowerCase();
    const isPaidQuery =
      normalizedQuery.includes("paid") ||
      normalizedQuery.includes("payment") ||
      normalizedQuery.includes("last bill");

    // If asking about paid bills, use specialized query
    if (isPaidQuery) {
      // Get the last paid bill if asking specifically about the last payment
      if (
        normalizedQuery.includes("last paid") ||
        normalizedQuery.includes("most recent payment") ||
        normalizedQuery.includes("latest payment")
      ) {
        const lastPaidBill = await getLastPaidBill();
        return lastPaidBill ? [lastPaidBill] : [];
      }

      // Otherwise get bills with paid status
      return await getBillsWithVendors(limit, "Paid", vendorId);
    }

    // Try to determine if the query is about a specific status
    const status = await extractBillStatus(query);

    // Use enhanced query that includes vendor information
    return await getBillsWithVendors(limit, status, vendorId);
  } catch (error) {
    console.error("[APUtils] Error finding relevant bills:", error);
    return [];
  }
}

/**
 * Extract potential vendor search terms from a query
 * @private
 */
function extractVendorSearchTerms(query: string): string[] {
  // Clean and normalize the query
  const normalizedQuery = query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Replace punctuation with spaces
    .replace(/\s+/g, " ") // Normalize spaces
    .trim();

  // Remove common stopwords that might interfere with vendor name extraction
  const stopwords = [
    "the",
    "and",
    "of",
    "for",
    "from",
    "with",
    "about",
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
  ];
  const filteredWords = normalizedQuery
    .split(" ")
    .filter((word) => !stopwords.includes(word) && word.length > 2);

  // Get word combinations that might represent vendor names
  // For example "bills from acme corp" -> try "acme", "corp", "acme corp"
  const terms: string[] = [];

  // Add individual words
  terms.push(...filteredWords);

  // Add adjacent word pairs (potential multi-word vendor names)
  for (let i = 0; i < filteredWords.length - 1; i++) {
    terms.push(`${filteredWords[i]} ${filteredWords[i + 1]}`);
  }

  // Add triplets for longer vendor names
  for (let i = 0; i < filteredWords.length - 2; i++) {
    terms.push(
      `${filteredWords[i]} ${filteredWords[i + 1]} ${filteredWords[i + 2]}`
    );
  }

  return terms;
}

/**
 * Extract bill status from a query if mentioned
 * @private
 */
async function extractBillStatus(query: string): Promise<string | undefined> {
  try {
    // Get the list of valid bill statuses from the database
    const validStatuses = await getBillStatuses();

    // Normalize the query
    const normalizedQuery = query.toLowerCase();

    // Check if any status is mentioned in the query
    for (const status of validStatuses) {
      if (normalizedQuery.includes(status.toLowerCase())) {
        return status;
      }
    }

    // Special cases for common terms
    if (
      normalizedQuery.includes("unpaid") ||
      normalizedQuery.includes("outstanding")
    ) {
      return "Unpaid";
    }
    if (
      normalizedQuery.includes("overdue") ||
      normalizedQuery.includes("late")
    ) {
      return "Overdue";
    }
    if (normalizedQuery.includes("paid")) {
      return "Paid";
    }

    return undefined;
  } catch (error) {
    console.error("[APUtils] Error extracting bill status:", error);
    return undefined;
  }
}

/**
 * Extract vendor information from a vendor creation query
 */
export function extractVendorInfoFromQuery(message: string): {
  name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
} {
  const result: {
    name?: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
  } = {};

  const normalized = message.toLowerCase();
  console.log(`[APUtils] Extracting vendor info from: "${normalized}"`);

  // Extract vendor name
  const namePatterns = [
    // Direct name specification
    /(?:vendor|supplier)\s+(?:name|called|named)\s*[:=]?\s*["']?([^"',.d][^,."']*?)["']?/i,
    /(?:name|call|called)\s+["']?([^"',.d][^,."']*?)["']?/i,

    // "for [name]" pattern
    /(?:vendor|supplier)\s+(?:account|record)?\s+for\s+["']?([^"',.d][^,."']*?)["']?/i,
    /for\s+["']?([^"',.d][^,."']*?)["']?/i,

    // "new [name] vendor" pattern - catches "new Apple vendor"
    /new\s+([^"',.d][^,."'s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,

    // "want create a new [name] vendor" pattern
    /want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?([^"',.d][^,."'s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,
    /i\s+want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?([^"',.d][^,."'s]*?)\s+(?:vendor|supplier)(?:\s|$)/i,

    // More general patterns as fallback
    /create\s+(?:a|an)\s+(?:new\s+)?(?:vendor|supplier)\s+([^"',.d][^,."']*?)(?:\s|$)/i,
  ];

  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.name = match[1].trim();
      console.log(`[APUtils] Found vendor name: ${result.name}`);
      break;
    }
  }

  // Extract contact person
  const contactPatterns = [
    /contact\s*(?:person|name)?\s*[:=]?\s*["']?([^"',]+)["']?/i,
    /person\s*[:=]?\s*["']?([^"',]+)["']?/i,
    /(?:contact|attention)\s+is\s+["']?([^"',]+)["']?/i,
  ];

  for (const pattern of contactPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.contact_person = match[1].trim();
      console.log(`[APUtils] Found contact person: ${result.contact_person}`);
      break;
    }
  }

  // Extract email
  const emailPatterns = [
    // Labeled email
    /(?:email|e-mail)\s*[:=]?\s*[\"\'']?([\w\.-]+@[\w\.-]+\.[a-z]{2,})[\"\'']?/i,
    // Email anywhere in input
    /([\w\.-]+@[\w\.-]+\.[a-z]{2,})/i,
  ];

  for (const pattern of emailPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.email = match[1].trim();
      console.log(`[APUtils] Found email: ${result.email}`);
      break;
    }
  }

  // Extract phone
  const phonePatterns = [
    /(?:phone|telephone|cell|mobile)\s*(?:number)?\s*[:=]?\s*[\"\'']?([\d\s\+\-\(\)\.]{7,})[\"\'']?/i,
    /(?:phone|telephone|cell|mobile)\s+is\s+[\"\'']?([\d\s\+\-\(\)\.]{7,})[\"\'']?/i,
    // Phone numbers in standard formats without label
    /\b((?:\+?1[-\s]?)?(?:\(?\d{3}\)?[-\s]?)?\d{3}[-\s]?\d{4})\b/,
  ];

  for (const pattern of phonePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.phone = match[1].trim();
      console.log(`[APUtils] Found phone: ${result.phone}`);
      break;
    }
  }

  // Extract address
  const addressPatterns = [
    /address\s*[:=]?\s*[\"\'']?([^\"\''].{5,})[\"\'']?(?:\.|$)/i,
    /located\s+at\s+[\"\'']?([^\"\''].{5,})[\"\'']?(?:\.|$)/i,
    /location\s*[:=]?\s*[\"\'']?([^\"\''].{5,})[\"\'']?(?:\.|$)/i,
    // Common address format with number, street name, and "Street/Ave/Road/etc."
    /\b(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd))\b/i,
  ];

  for (const pattern of addressPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      result.address = match[1].trim();
      console.log(`[APUtils] Found address: ${result.address}`);
      break;
    }
  }

  // Handle comma-separated values
  if (message.includes(",")) {
    const parts = message.split(",").map((part) => part.trim());

    // Try to identify parts by content patterns if not already extracted
    for (const part of parts) {
      // If looks like an address but we don't have one yet
      if (
        !result.address &&
        (/^\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd)/i.test(
          part
        ) ||
          part.split(" ").length >= 3)
      ) {
        result.address = part;
        console.log(
          `[APUtils] Found address from comma-separated format: ${result.address}`
        );
      }
      // If looks like email but we don't have one yet
      else if (!result.email && /[\w\.-]+@[\w\.-]+\.[a-z]{2,}/i.test(part)) {
        result.email = part;
        console.log(
          `[APUtils] Found email from comma-separated format: ${result.email}`
        );
      }
      // If looks like phone but we don't have one yet
      else if (
        !result.phone &&
        /[\d\s\+\-\(\)\.]{7,}/.test(part) &&
        /\d{3}/.test(part)
      ) {
        result.phone = part;
        console.log(
          `[APUtils] Found phone from comma-separated format: ${result.phone}`
        );
      }
      // If looks like a name (1-3 words) and we don't have contact yet
      else if (
        !result.contact_person &&
        /^[A-Za-z\s]{2,}$/.test(part) &&
        part.split(" ").length <= 3
      ) {
        result.contact_person = part;
        console.log(
          `[APUtils] Found contact person from comma-separated format: ${result.contact_person}`
        );
      }
    }
  }

  return result;
}

/**
 * Create a new vendor in the system
 */
export async function createVendor(vendorData: {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
}): Promise<{ success: boolean; message: string; vendor?: any }> {
  try {
    console.log(`[APUtils] Creating vendor: ${vendorData.name}`);

    if (!vendorData.name) {
      return { success: false, message: "Vendor name is required." };
    }

    // Call the API to create the vendor
    const response = await fetch("/api/vendors", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        vendor: vendorData,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        message: result.error || `Failed to create vendor ${vendorData.name}.`,
      };
    }

    return {
      success: true,
      message: `Vendor ${vendorData.name} has been created successfully.`,
      vendor: result,
    };
  } catch (error) {
    console.error("[APUtils] Error creating vendor:", error);
    let errorMessage = "An unknown error occurred while creating the vendor.";

    if (error instanceof Error) {
      errorMessage = `Error creating vendor: ${error.message}`;
    }

    return { success: false, message: errorMessage };
  }
}

/**
 * Get counts of bills by status
 * @returns A record of status -> count mappings
 */
export async function getBillStatusCounts(): Promise<Record<string, number>> {
  try {
    const response = await fetch("/api/bills/status-count");
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const data = await response.json();
    return data.success ? data.statusCounts : {};
  } catch (error) {
    console.error("Error fetching bill status counts:", error);
    return {};
  }
}

export {
  getVendors,
  getBills,
  getAccounts
};

import { Vendor } from "./accounting/vendorQueries";
import { Bill, BillWithVendor } from "./accounting/billQueries";
import { getVendors } from "./accounting/vendorQueries";
import { getBills, getBillStatuses, updateBill, getBill } from "./accounting/billQueries";
import { getBillsWithVendors, getLastPaidBill, getVendorsWithPaidBills, getRecentBillPayments, BillLineDetail, BillWithDetails } from "./accounting/apQueries";
import { logAuditEvent } from "./auditLogger";
import { sql } from "@vercel/postgres";

/**
 * Check if a query might be about accounts payable topics
 * Uses keyword detection and common AP phrases
 */
/**
 * Determine if a message is requesting to create a bill
 */
export function isBillCreationQuery(message: string): boolean {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Checking for bill creation in: "${normalized}"`);
  
  // First, use a simple but broad check for the keywords "bill" and "create"
  // This catches phrases like "I need to create an Amazon bill"
  if (normalized.includes('bill') && 
      (normalized.includes('create') || 
       normalized.includes('add') || 
       normalized.includes('enter') || 
       normalized.includes('new'))) {
    console.log(`[APUtils] Simple bill creation pattern matched with keywords`);
    
    // Only consider it as AR invoice if explicitly mentions customer or AR
    if (normalized.includes('customer') || 
        normalized.includes('accounts receivable') || 
        normalized.includes('ar ')) {
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
    /record\s+.*\s*bill/i,
    /need.*create.*bill/i,  // This should match "I need to create an Amazon bill"
    
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
  console.log(`[APUtils] No bill creation patterns matched for: "${normalized}"`);
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
    /([A-Za-z0-9\s&.]+?)\s+(?:bill|invoice)\s+(?:for|of)\s+[$]?\d+/i
  ];
  
  for (const pattern of vendorPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.vendor_name = match[1].trim();
      break;
    }
  }
  
  // Extract bill/invoice number
  const billNumberPattern = /(?:bill|invoice)\s+(?:number|#)\s*([A-Za-z0-9\-]+)/i;
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
    /for\s+[$]?(\d+(?:\.\d{1,2})?)/i
  ];
  
  for (const pattern of amountPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.amount = parseFloat(match[1]);
      break;
    }
  }
  
  // Extract due date
  const dueDatePattern = /(?:due|payment)\s+(?:date|on)\s*(?:of|:)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i;
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
    /\bfor\s+([^.\n\r]+)(?:\.|$)/i
  ];
  
  for (const pattern of descriptionPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      billInfo.description = match[1].trim();
      break;
    }
  }
  
  console.log('[APUtils] Extracted bill info:', billInfo);
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
    console.log(`[APUtils] Query detected as bill creation request: "${query}"`);
    return true;
  }
  
  // Check if this is a vendor creation request
  if (isVendorCreationQuery(query)) {
    console.log(`[APUtils] Query detected as vendor creation request: "${query}"`);
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
    "bill from",  // Add pattern that's common in bill creation
    "due date",
    "invoice approval",
    "payment term",
    "purchase order",
    "creditor",
    "aging report",
    "create vendor",
    "add vendor",
    "new vendor",
    "new supplier"
  ];
  
  const normalizedQuery = query.toLowerCase();
  
  // Special handling for vendor creation follow-up messages
  // Detect comma-separated lists with common vendor info patterns
  if (query.includes(',')) {
    // Check if query contains patterns that look like contact info
    const parts = query.split(',').map((p: string) => p.trim());
    let infoCount = 0;
    
    // Count how many parts look like vendor information
    for (const part of parts) {
      if (
        // Email pattern
        /[\w\.-]+@[\w\.-]+\.[a-z]{2,}/i.test(part) ||
        // Phone number pattern
        /\d{3}[\s\-]?\d{3}[\s\-]?\d{4}/.test(part) ||
        // Address with number pattern
        /^\d+\s+[\w\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|place|pl)/i.test(part) ||
        // Person name pattern (1-3 words, all alpha)
        /^[A-Za-z]+(?:\s+[A-Za-z]+){0,2}$/.test(part)
      ) {
        infoCount++;
      }
    }
    
    // If at least 2 parts look like vendor info, this is likely a vendor-related message
    if (infoCount >= 2) {
      console.log(`[APUtils] Detected vendor information in comma-separated format: ${infoCount} fields`); 
      return true;
    }
  }
  
  // Check if any keyword is in the query
  return apKeywords.some(keyword => normalizedQuery.includes(keyword.toLowerCase()));
}

/**
 * Determine if a message is requesting to update the status of bills
 * Detects requests to post, open, or change the status of bills
 * 
 * This is a legacy function that's kept for backward compatibility.
 * For new code, use analyzeBillStatusUpdateWithAI from aiExtraction.ts
 */
export function isBillStatusUpdateQuery(message: string): { 
  isUpdateRequest: boolean; 
  billNumber?: string;
  requestedStatus?: string;
  isBulkUpdate: boolean;
  limitToRecent?: number;
  billNumbers?: string[];
} {
  const normalized = message.toLowerCase();
  console.log(`[APUtils] Checking for bill status update in: "${normalized}"`);
  
  // Use the analyzeBillStatusUpdateWithAI function asynchronously if possible
  // But return a valid result synchronously for backward compatibility
  // This function gets called frequently so we'll dispatch the AI analysis asynchronously
  // and improve future calls with its results
  
  // Dispatch AI analysis in the background, but don't wait for it
  import('./aiExtraction').then(async ({ analyzeBillStatusUpdateWithAI }) => {
    try {
      // This runs asynchronously and doesn't affect the current result
      // But it helps provide better training data and logging
      const aiResult = await analyzeBillStatusUpdateWithAI(message);
      console.log('[APUtils] AI analysis of bill status update complete:', aiResult);
    } catch (error) {
      console.error('[APUtils] Error in background AI analysis:', error);
    }
  }).catch(error => {
    console.error('[APUtils] Failed to import or run AI analysis:', error);
  });
  
  // Initialize result object
  const result = {
    isUpdateRequest: false,
    billNumber: undefined as string | undefined,
    requestedStatus: undefined as string | undefined,
    isBulkUpdate: false,
    limitToRecent: undefined as number | undefined,
    billNumbers: [] as string[]
  };
  
  // Bill number extraction patterns
  const billNumberPatterns = [
    /bill\s+#?([a-zA-Z0-9]+)/i,
    /invoice\s+#?([a-zA-Z0-9]+)/i,
    /#([a-zA-Z0-9]+)/i
  ];
  
  // Single bill status patterns
  const statusUpdatePatterns = [
    { pattern: /post\s+.*(bill|invoice)/i, status: 'Open' },
    { pattern: /open\s+.*(bill|invoice)/i, status: 'Open' },
    { pattern: /mark\s+.*as\s+open/i, status: 'Open' },
    { pattern: /change\s+.*status.*to\s+open/i, status: 'Open' },
    { pattern: /set\s+.*status.*to\s+open/i, status: 'Open' },
    { pattern: /make\s+.*(bill|invoice)\s+open/i, status: 'Open' },
    { pattern: /post\/open/i, status: 'Open' }
  ];
  
  // Bulk update patterns - these indicate requests to update multiple bills at once
  const bulkUpdatePatterns = [
    // Patterns for all bills
    { pattern: /move\s+all\s+.*\s+from\s+draft\s+to\s+open/i, status: 'Open' },
    { pattern: /change\s+all\s+.*\s+to\s+open/i, status: 'Open' },
    { pattern: /update\s+all\s+.*\s+to\s+open/i, status: 'Open' },
    { pattern: /post\s+all\s+.*\s+bills/i, status: 'Open' },
    { pattern: /open\s+all\s+.*\s+bills/i, status: 'Open' },
    { pattern: /mark\s+all\s+.*\s+as\s+open/i, status: 'Open' },
    { pattern: /set\s+all\s+.*\s+to\s+open/i, status: 'Open' },
    { pattern: /set\s+status\s+of\s+all\s+.*\s+to\s+open/i, status: 'Open' },
    
    // Patterns for specific groups of bills
    { pattern: /post\s+these\s+(bills|invoices)/i, status: 'Open' },
    { pattern: /move\s+these\s+.*\s+from\s+draft\s+to\s+open/i, status: 'Open' },
    { pattern: /update\s+status\s+of\s+these\s+/i, status: 'Open' },
    { pattern: /update\s+these\s+to\s+open/i, status: 'Open' },
    
    // Patterns for recent/latest bills
    { pattern: /move\s+(?:the\s+)?last\s+(\d+)\s+.*bills.*\s+from\s+draft\s+to\s+open/i, status: 'Open', limitExtractor: (match: RegExpMatchArray) => parseInt(match[1], 10) },
    { pattern: /move\s+(?:the\s+)?recent\s+.*bills.*\s+from\s+draft\s+to\s+open/i, status: 'Open' },
    { pattern: /open\s+(?:the\s+)?last\s+(\d+)\s+.*bills/i, status: 'Open', limitExtractor: (match: RegExpMatchArray) => parseInt(match[1], 10) },
    { pattern: /update\s+(?:the\s+)?latest\s+.*bills\s+to\s+open/i, status: 'Open' },
    { pattern: /change\s+(?:the\s+)?recent\s+.*bills\s+to\s+open/i, status: 'Open' },
    
    // Catch-all for moving bills from draft to open
    { pattern: /move.*bills.*from\s+draft\s+to\s+open/i, status: 'Open' }
  ];
  
  // Check for bulk update patterns first
  for (const patternObj of bulkUpdatePatterns) {
    const match = normalized.match(patternObj.pattern);
    if (match) {
      result.isUpdateRequest = true;
      result.requestedStatus = patternObj.status;
      result.isBulkUpdate = true;
      
      // Extract limit for recent bills if available
      if (patternObj.limitExtractor && typeof patternObj.limitExtractor === 'function') {
        result.limitToRecent = patternObj.limitExtractor(match);
      }
      
      console.log(`[APUtils] Bulk bill status update pattern matched: ${patternObj.pattern} → ${patternObj.status}`);
      if (result.limitToRecent) {
        console.log(`[APUtils] Detected request for ${result.limitToRecent} most recent bills`);
      }
      return result; // Early return for bulk update
    }
  }
  
  // Check for single bill update patterns
  for (const { pattern, status } of statusUpdatePatterns) {
    if (pattern.test(normalized)) {
      result.isUpdateRequest = true;
      result.requestedStatus = status;
      console.log(`[APUtils] Single bill status update pattern matched: ${pattern} → ${status}`);
      break;
    }
  }
  
  // If it's a status update request for a single bill, extract the bill number
  if (result.isUpdateRequest && !result.isBulkUpdate) {
    for (const pattern of billNumberPatterns) {
      const match = normalized.match(pattern);
      if (match && match[1]) {
        result.billNumber = match[1];
        result.billNumbers?.push(match[1]);
        console.log(`[APUtils] Extracted bill number: ${result.billNumber}`);
        break;
      }
    }
  } else if (!result.isUpdateRequest) {
    console.log(`[APUtils] No bill status update patterns matched`);
  }
  
  return result;
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
    /want\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,  // Handles "want create"
    /need\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,
    /would\s+like\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,
    /want\s+(a\s*)?(new\s*)?(vendor|supplier)/i,  // Handles "want a new vendor"
    /i\s+want\s+(to\s+)?create\s+(a\s*)?(new\s*)?(vendor|supplier)/i,  // Explicitly match "I want"
    
    // More specific patterns
    /create\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(called|named|with|for)/i,
    /add\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(called|named|with|for)/i,
    
    // Specific vendor creation with name
    /create\s+(a|an)\s+(new\s+)?(vendor|supplier)\s+(account|record)?\s+for\s+([^,\.]+)/i,
    
    // General pattern
    /new\s+(vendor|supplier)\s+(called|named|for)/i,

    // Allow vendor name between the action and the word vendor/supplier
    /create\s+(?:a\s+)?(?:new\s+)?[\w&.'\-]+(?:\s+[\w&.'\-]+)*\s+(vendor|supplier)/i,
    /(?:i\s+)?want\s+(?:to\s+)?create\s+(?:a\s+)?(?:new\s+)?[\w&.'\-]+(?:\s+[\w&.'\-]+)*\s+(vendor|supplier)/i
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
    const isPaidQuery = normalizedQuery.includes('paid') || 
                       normalizedQuery.includes('payment') ||
                       normalizedQuery.includes('which vendor');

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
    const uniqueVendors = allVendors.filter((vendor, index, self) =>
      index === self.findIndex(v => v.id === vendor.id)
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
    const isPaidQuery = normalizedQuery.includes('paid') || 
                       normalizedQuery.includes('payment') ||
                       normalizedQuery.includes('last bill');

    // If asking about paid bills, use specialized query
    if (isPaidQuery) {
      // Get the last paid bill if asking specifically about the last payment
      if (normalizedQuery.includes('last paid') || 
          normalizedQuery.includes('most recent payment') || 
          normalizedQuery.includes('latest payment')) {
        const lastPaidBill = await getLastPaidBill();
        return lastPaidBill ? [lastPaidBill] : [];
      }
      
      // Otherwise get bills with paid status
      return await getBillsWithVendors(limit, 'Paid', vendorId);
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
  const normalizedQuery = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
    .replace(/\s+/g, ' ')      // Normalize spaces
    .trim();
  
  // Remove common stopwords that might interfere with vendor name extraction
  const stopwords = ["the", "and", "of", "for", "from", "with", "about", "who", "what", "when", "where", "why", "how"];
  const filteredWords = normalizedQuery.split(' ')
    .filter(word => !stopwords.includes(word) && word.length > 2);
  
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
    terms.push(`${filteredWords[i]} ${filteredWords[i + 1]} ${filteredWords[i + 2]}`);
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
    if (normalizedQuery.includes("unpaid") || normalizedQuery.includes("outstanding")) {
      return "Unpaid";
    }
    if (normalizedQuery.includes("overdue") || normalizedQuery.includes("late")) {
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
    /create\s+(?:a|an)\s+(?:new\s+)?(?:vendor|supplier)\s+([^"',.d][^,."']*?)(?:\s|$)/i

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
    /([\w\.-]+@[\w\.-]+\.[a-z]{2,})/i
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
    /\b((?:\+?1[-\s]?)?(?:\(?\d{3}\)?[-\s]?)?\d{3}[-\s]?\d{4})\b/
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
    /\b(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd))\b/i
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
  if (message.includes(',')) {
    const parts = message.split(',').map(part => part.trim());
    
    // Try to identify parts by content patterns if not already extracted
    for (const part of parts) {
      // If looks like an address but we don't have one yet
      if (!result.address && 
          (/^\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Way|Boulevard|Blvd)/i.test(part) || 
           part.split(' ').length >= 3)) {
        result.address = part;
        console.log(`[APUtils] Found address from comma-separated format: ${result.address}`);
      }
      // If looks like email but we don't have one yet
      else if (!result.email && /[\w\.-]+@[\w\.-]+\.[a-z]{2,}/i.test(part)) {
        result.email = part;
        console.log(`[APUtils] Found email from comma-separated format: ${result.email}`);
      }
      // If looks like phone but we don't have one yet
      else if (!result.phone && /[\d\s\+\-\(\)\.]{7,}/.test(part) && /\d{3}/.test(part)) {
        result.phone = part;
        console.log(`[APUtils] Found phone from comma-separated format: ${result.phone}`);
      }
      // If looks like a name (1-3 words) and we don't have contact yet
      else if (!result.contact_person && /^[A-Za-z\s]{2,}$/.test(part) && part.split(' ').length <= 3) {
        result.contact_person = part;
        console.log(`[APUtils] Found contact person from comma-separated format: ${result.contact_person}`);
      }
    }
  }
  
  return result;
}

/**
 * Create a new vendor in the system
 */
export async function createVendor(
  vendorData: {
    name: string;
    contact_person?: string;
    email?: string;
    phone?: string;
    address?: string;
  }
): Promise<{ success: boolean; message: string; vendor?: any }> {
  try {
    console.log(`[APUtils] Creating vendor: ${vendorData.name}`);
    
    if (!vendorData.name) {
      return { success: false, message: 'Vendor name is required.' };
    }
    
    // Call the API to create the vendor
    const response = await fetch('/api/vendors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vendor: vendorData
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      return { 
        success: false, 
        message: result.error || `Failed to create vendor ${vendorData.name}.` 
      };
    }
    
    return { 
      success: true, 
      message: `Vendor ${vendorData.name} has been created successfully.`,
      vendor: result
    };
    
  } catch (error) {
    console.error('[APUtils] Error creating vendor:', error);
    let errorMessage = 'An unknown error occurred while creating the vendor.';
    
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
    const response = await fetch('/api/bills/status-count');
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }
    const data = await response.json();
    return data.success ? data.statusCounts : {};
  } catch (error) {
    console.error('Error fetching bill status counts:', error);
    return {};
  }
}
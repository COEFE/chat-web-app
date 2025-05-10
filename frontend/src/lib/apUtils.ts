import { Vendor } from "./accounting/vendorQueries";
import { Bill, BillWithVendor } from "./accounting/billQueries";
import { getVendors } from "./accounting/vendorQueries";
import { getBills, getBillStatuses } from "./accounting/billQueries";
import { getBillsWithVendors, getLastPaidBill, getVendorsWithPaidBills, getRecentBillPayments, BillLineDetail, BillWithDetails } from "./accounting/apQueries";

/**
 * Check if a query might be about accounts payable topics
 * Uses keyword detection and common AP phrases
 */
export function mightBeAboutAP(query: string): boolean {
  const apKeywords = [
    "accounts payable",
    "vendor",
    "suppliers",
    "ap ",
    "bills",
    "bill payment",
    "due date",
    "invoice approval",
    "payment term",
    "purchase order",
    "creditor",
    "aging report",
  ];
  
  const normalizedQuery = query.toLowerCase();
  
  // Check if any keyword is in the query
  return apKeywords.some(keyword => normalizedQuery.includes(keyword.toLowerCase()));
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

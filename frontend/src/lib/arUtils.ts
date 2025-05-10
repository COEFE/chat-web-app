import { getInvoicesWithDetails, InvoiceWithCustomer } from './accounting/invoiceQueries';
import { getCustomers, Customer } from './accounting/customerQueries';

/**
 * Check if a query might be about accounts receivable topics
 * @param query The user's query text
 */
export function mightBeAboutAR(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  
  // AR related terms
  const arTerms = [
    "invoice",
    "invoices",
    "accounts receivable",
    "customer",
    "customers",
    "sales",
    "revenue",
    "payment",
    "overdue",
    "collections",
    "customer statement",
    "customer balance",
    "outstanding",
    "aging report",
    "past due",
    "receipts",
    "credit memo",
    "invoice approval",
    "paid invoice"
  ];
  
  return arTerms.some(term => normalizedQuery.includes(term));
}

/**
 * Find relevant customers based on a query
 * @param query The user's query text
 * @param limit Maximum number of customers to return
 */
export async function findRelevantCustomers(
  query: string,
  limit: number = 5
): Promise<Customer[]> {
  try {
    const normalizedQuery = query.toLowerCase();
    const allCustomers = await getCustomers();
    
    // Filter customers whose name matches part of the query
    const matchedCustomers = allCustomers.filter(customer => {
      const customerName = customer.name.toLowerCase();
      return normalizedQuery.includes(customerName) || 
             customerName.includes(normalizedQuery);
    });
    
    // Sort customers by most relevant (contains the name) first
    matchedCustomers.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      const aDirectlyMentioned = normalizedQuery.includes(aName);
      const bDirectlyMentioned = normalizedQuery.includes(bName);
      
      if (aDirectlyMentioned && !bDirectlyMentioned) return -1;
      if (!aDirectlyMentioned && bDirectlyMentioned) return 1;
      
      // Secondary sort by activity (most recent transactions)
      return 0; // In future: sort by recent activity
    });
    
    return matchedCustomers.slice(0, limit);
  } catch (error) {
    console.error("[ARUtils] Error finding relevant customers:", error);
    return [];
  }
}

/**
 * Find relevant invoices based on a query
 * @param query The user's query text
 * @param limit Maximum number of invoices to return
 * @param customerId Optional customer ID to filter by
 */
export async function findRelevantInvoices(
  query: string,
  limit: number = 5,
  customerId?: number
): Promise<InvoiceWithCustomer[]> {
  try {
    // Check if query might be about specific types of invoices
    const normalizedQuery = query.toLowerCase();
    
    // Look for patterns in the query
    const isPaidQuery = normalizedQuery.includes('paid') || normalizedQuery.includes('payment');
    const isOverdueQuery = normalizedQuery.includes('overdue') || normalizedQuery.includes('past due') || 
                          normalizedQuery.includes('late') || normalizedQuery.includes('outstanding');
    const isDraftQuery = normalizedQuery.includes('draft') || normalizedQuery.includes('unsent');
    
    // Determine status filter based on query patterns
    let statusFilter: string | undefined;
    
    if (isPaidQuery) {
      statusFilter = 'Paid';
    } else if (isOverdueQuery) {
      statusFilter = 'Sent';
    } else if (isDraftQuery) {
      statusFilter = 'Draft';
    }
    
    // Set up date range for overdue invoices
    let fromDate: string | undefined;
    let toDate: string | undefined;
    
    if (isOverdueQuery) {
      // For overdue, we want invoices due before today
      toDate = new Date().toISOString().split('T')[0];
    }
    
    // Determine if we should include line items and payments
    const includeLines = normalizedQuery.includes('item') || 
                        normalizedQuery.includes('line') ||
                        normalizedQuery.includes('service') ||
                        normalizedQuery.includes('product') ||
                        normalizedQuery.includes('what was') ||
                        normalizedQuery.includes('what is');
                        
    const includePayments = normalizedQuery.includes('payment') ||
                           normalizedQuery.includes('paid') ||
                           normalizedQuery.includes('received');
    
    // Fetch invoices with appropriate filters
    const invoices = await getInvoicesWithDetails({
      customerId,
      status: statusFilter,
      limit,
      includeLines,
      includePayments,
      fromDate,
      toDate
    });
    
    // If we have a specific invoice number mentioned, prioritize that
    const invoiceNumberMatch = normalizedQuery.match(/invoice\s+#?(\w+)/i) || 
                              normalizedQuery.match(/(\w+)\s+invoice/i);
    
    if (invoiceNumberMatch && invoiceNumberMatch[1]) {
      const mentionedNumber = invoiceNumberMatch[1].toLowerCase();
      
      // Sort invoices so that the matching invoice number comes first
      invoices.sort((a, b) => {
        const aNumber = a.invoice_number.toLowerCase();
        const bNumber = b.invoice_number.toLowerCase();
        
        if (aNumber.includes(mentionedNumber) && !bNumber.includes(mentionedNumber)) return -1;
        if (!aNumber.includes(mentionedNumber) && bNumber.includes(mentionedNumber)) return 1;
        
        // Secondary sort by date (most recent first)
        return new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime();
      });
    } else {
      // Default sort by date (most recent first)
      invoices.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
    }
    
    return invoices.slice(0, limit);
  } catch (error) {
    console.error("[ARUtils] Error finding relevant invoices:", error);
    return [];
  }
}

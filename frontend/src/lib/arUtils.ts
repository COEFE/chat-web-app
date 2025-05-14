import { getInvoicesWithDetails, InvoiceWithCustomer, createInvoice, CreateInvoiceData } from './accounting/invoiceQueries';
import { Customer, getCustomers, createCustomer, getCustomerById } from './accounting/customerQueries';
import { 
  isCustomerCreationWithAI, 
  extractCustomerInfoWithAI, 
  CustomerData, 
  isInvoiceCreationWithAI, 
  extractInvoiceInfoWithAI, 
  InvoiceData,
  isInvoicePaymentWithAI,
  extractPaymentInfoWithAI,
  PaymentData
} from './arAiExtraction';
import { getAccounts, Account } from './accounting/accountQueries';
import { createInvoicePayment, getInvoiceById, getInvoiceByNumber } from './accounting/invoiceQueries';
import { selectRevenueAccountWithAI } from './revenueAccountSelection';
import { findCustomerWithAI } from './customerSelection';

/**
 * Find revenue accounts in the system
 * @returns Array of account objects that can be used for revenue
 */
async function findRevenueAccounts(): Promise<Account[]> {
  // First try to get accounts explicitly tagged as 'revenue' type
  const revenueAccounts = await getAccounts({ types: ['revenue'] });
  
  // If found accounts with revenue type, return them
  if (revenueAccounts.length > 0) {
    return revenueAccounts;
  }
  
  // As a fallback, get all accounts and filter for likely revenue accounts
  const allAccounts = await getAccounts({});
  
  // Filter for accounts that look like revenue accounts based on code or name
  const filteredAccounts = allAccounts.filter(account => 
    // Standard chart of accounts uses 4000 series for revenue
    account.code.startsWith('4') || 
    // Look for keywords in account names
    account.name.toLowerCase().includes('revenue') || 
    account.name.toLowerCase().includes('income') ||
    account.account_type?.toLowerCase() === 'revenue'
  );
  
  return filteredAccounts;
}

/**
 * Check if a query is about creating a customer using regex patterns
 * @param query The user's query text
 */
export function isCustomerCreationQuery(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  
  // Customer creation related patterns
  const customerCreationPatterns = [
    /create\s+(a\s+)?new\s+customer/i,
    /add\s+(a\s+)?customer/i,
    /register\s+(a\s+)?customer/i,
    /new\s+customer\s+record/i,
    /create\s+customer\s+profile/i,
    /add\s+(a\s+)?new\s+client/i,
  ];
  
  return customerCreationPatterns.some(pattern => pattern.test(normalizedQuery));
}

/**
 * Create a customer based on information extracted from a query
 * @param query The user's query text
 * @returns The created customer ID and details if successful
 */
export async function createCustomerFromQuery(query: string): Promise<{ success: boolean; message: string; customerId?: number; customerName?: string }> {
  try {
    // First check if this is really about creating a customer
    const isCreationQuery = await isCustomerCreationWithAI(query);
    
    if (!isCreationQuery) {
      return {
        success: false,
        message: "This query doesn't appear to be about creating a new customer."
      };
    }
    
    // Extract customer information using AI
    const customerInfo = await extractCustomerInfoWithAI(query);
    
    if (!customerInfo || !customerInfo.name) {
      return {
        success: false,
        message: "Couldn't extract valid customer information. Please provide at least a customer name."
      };
    }
    
    // Create the customer in the database
    const customerId = await createCustomer(customerInfo);
    
    if (!customerId) {
      return {
        success: false,
        message: "Failed to create customer in the database."
      };
    }
    
    return {
      success: true,
      message: `Successfully created customer: ${customerInfo.name}`,
      customerId,
      customerName: customerInfo.name
    };
  } catch (error) {
    console.error('[arUtils] Error creating customer from query:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error creating customer"
    };
  }
}

/**
 * Create an invoice from a natural language query
 * @param query The user's query text
 */
export async function createInvoiceFromQuery(query: string): Promise<{
  success: boolean;
  message: string;
  invoiceId?: number;
  invoiceNumber?: string;
}> {
  try {
    // Use AI to extract invoice information
    const invoiceData = await extractInvoiceInfoWithAI(query);
    
    // Log what we extracted for debugging
    console.log('[arUtils] Invoice data extracted:', JSON.stringify(invoiceData, null, 2));
    
    if (!invoiceData) {
      return { 
        success: false, 
        message: "Couldn't extract valid invoice information from your request. Please try again with more details." 
      };
    }
    
    if (!invoiceData.customer_name) {
      return { 
        success: false, 
        message: "Please specify a customer name for the invoice." 
      };
    }
    
    if (!invoiceData.lines || invoiceData.lines.length === 0) {
      return { 
        success: false, 
        message: "Please specify at least one line item for the invoice." 
      };
    }
    
    // First check if this is really about creating an invoice
    const isCreationQuery = await isInvoiceCreationWithAI(query);
    
    if (!isCreationQuery) {
      return {
        success: false,
        message: "This query doesn't appear to be about creating a new invoice."
      };
    }
    
    // Resolve customer ID from name
    let customerId: number | undefined;
    if (invoiceData.customer_id) {
      // Customer ID was directly provided
      customerId = invoiceData.customer_id;
      console.log(`[arUtils] Using provided customer ID: ${customerId}`);
    } else if (invoiceData.customer_name) {
      console.log(`[arUtils] Looking up customer: "${invoiceData.customer_name}"`);
      
      // Look up customer by name using AI-enhanced matching
      const customers = await findRelevantCustomers(invoiceData.customer_name, 1);
      
      if (customers && customers.length > 0) {
        customerId = customers[0].id;
        console.log(`[arUtils] Found existing customer: ${customers[0].name} (ID: ${customerId})`);
      } else {
        // Always auto-create customers for AI-generated invoices
        console.log(`[arUtils] Customer '${invoiceData.customer_name}' not found. Creating automatically.`);
        
        // Always create the customer with auto-generated email if needed
        // Generate an email if one isn't provided
        const customerEmail = invoiceData.customer_email || 
                           `${invoiceData.customer_name.toLowerCase().replace(/[^a-z0-9]/g, '')}@customer.local`;
        
        // Create new customer record
        const newCustomer = await createCustomer({
          name: invoiceData.customer_name || '',
          email: customerEmail,  // Email is now the only required field
          phone: invoiceData.customer_phone || '',
          billing_address: invoiceData.customer_address || '',
          shipping_address: ''
        });
        
        if (newCustomer) {
          customerId = newCustomer;
          console.log(`[arUtils] Successfully created customer with ID: ${newCustomer}`);
        } else {
          console.error(`[arUtils] Failed to create customer: ${invoiceData.customer_name}`);
          return {
            success: false,
            message: "Failed to create customer in the database."
          };
        }
      }
    } else {
      // No customer information provided
      console.error('[arUtils] No customer specified in invoice data');
      return {
        success: false,
        message: "No customer specified for this invoice. Please specify a customer."
      };
    }
    
    // Resolve AR account ID
    let arAccountId: number;
    if (invoiceData.ar_account_id) {
      arAccountId = invoiceData.ar_account_id;
    } else {
      // Use default AR account or look up by name
      if (invoiceData.ar_account_name) {
        const accounts = await getAccounts({ types: ['Accounts Receivable'] });
        const arAccount = accounts.find((account: Account) => 
          account.name.toLowerCase().includes(invoiceData.ar_account_name!.toLowerCase()) ||
          invoiceData.ar_account_name!.toLowerCase().includes(account.name.toLowerCase())
        );
        
        if (arAccount) {
          arAccountId = arAccount.id;
        } else {
          // Use first AR account as default
          const defaultArAccount = accounts[0];
          if (defaultArAccount) {
            arAccountId = defaultArAccount.id;
          } else {
            return {
              success: false,
              message: "No Accounts Receivable account found. Please set up at least one AR account first."
            };
          }
        }
      } else {
        // Use default AR account - find accounts with code 1100 (Accounts Receivable)
        const accounts = await getAccounts({ types: ['asset'] });
        // Filter for code 1100 specifically as that's the AR account we want
        const arAccounts = accounts.filter(account => account.code === '1100' || account.name.toLowerCase().includes('receivable'));
        if (arAccounts.length === 0) {
          return {
            success: false,
            message: "No Accounts Receivable account found. Please set up at least one AR account first."
          };
        }
        arAccountId = arAccounts[0].id;
      }
    }
    
    // Resolve revenue accounts for each line item
    for (const line of invoiceData.lines) {
      if (!line.revenue_account_id && line.revenue_account_name) {
        // Get revenue accounts using the helper function
        const accounts = await findRevenueAccounts();
        // Try to find a revenue account that matches the name mentioned
        const revenueAccount = accounts.find(account => 
          account.name.toLowerCase().includes(line.revenue_account_name!.toLowerCase()) ||
          line.revenue_account_name!.toLowerCase().includes(account.name.toLowerCase())
        );
        
        if (revenueAccount) {
          // Direct name match found
          line.revenue_account_id = revenueAccount.id;
          console.log(`[arUtils] Found revenue account by name match: ${revenueAccount.code} - ${revenueAccount.name}`);
        } else {
          // Use AI to select the best account based on the line description
          const selectedAccount = await selectRevenueAccountWithAI(line.description, accounts);
          
          if (selectedAccount) {
            line.revenue_account_id = selectedAccount.id;
          } else {
            return {
              success: false,
              message: "No valid revenue account found. Please set up at least one Revenue account."
            };
          }
        }
      } else if (!line.revenue_account_id) {
        // Get revenue accounts using the helper function
        const accounts = await findRevenueAccounts();
        if (accounts.length > 0) {
          // Use AI to select the most appropriate revenue account based on line description
          const selectedAccount = await selectRevenueAccountWithAI(line.description, accounts);
          
          if (selectedAccount) {
            line.revenue_account_id = selectedAccount.id;
            console.log(`[arUtils] AI selected revenue account: ${selectedAccount.code} - ${selectedAccount.name}`);
          } else {
            // Fallback to first account if AI selection fails
            line.revenue_account_id = accounts[0].id;
            console.log(`[arUtils] Using default revenue account: ${accounts[0].code} - ${accounts[0].name}`);
          }
        } else {
          return {
            success: false,
            message: "No revenue accounts found in the system. Please set up at least one Revenue account."
          };
        }
      }
    }

    // Ensure customer ID is defined before proceeding
    if (!customerId) {
      console.error(`[arUtils] Customer ID is undefined after customer resolution process. Invoice data: ${JSON.stringify(invoiceData)}`);
      return {
        success: false,
        message: "Failed to resolve customer ID. Please try again with a specific customer name."
      };
    }
    
    // Log successful customer resolution
    console.log(`[arUtils] Successfully resolved customer ID to: ${customerId}`);

    // Ensure AR account ID is defined
    if (!arAccountId) {
      console.error('[arUtils] AR account ID is undefined after account resolution process');
      return {
        success: false,
        message: "Failed to resolve AR account. Please ensure an Accounts Receivable account is set up."
      };
    }
    
    // Get the AR account name
    let arAccountName: string = '';
    try {
      // Get all accounts and find the one with matching ID
      const accounts = await getAccounts();
      const arAccount = accounts.find(acc => acc.id === arAccountId);
      if (arAccount) {
        arAccountName = arAccount.name;
        console.log(`[arUtils] Found AR account name: ${arAccountName}`);
      } else {
        // Fallback name if account not found
        arAccountName = 'Accounts Receivable';
        console.log(`[arUtils] AR account not found, using default name: ${arAccountName}`);
      }
    } catch (error) {
      console.error('[arUtils] Error getting AR account name:', error);
      // Fallback if error occurs
      arAccountName = 'Accounts Receivable';
    }
    
    // Prepare invoice creation payload
    console.log(`[arUtils] Creating invoice with customer ID: ${customerId} and AR account ID: ${arAccountId}`);
    
    // Find the customer name - we need to include this in the invoice
    let customerName = invoiceData.customer_name;
    if (!customerName) {
      try {
        // Try to get the customer name from the database
        const customer = await getCustomerById(customerId);
        customerName = customer?.name || 'Unknown Customer';
      } catch (error) {
        console.error('[arUtils] Error getting customer name:', error);
        customerName = 'Unknown Customer';
      }
    }
    
    const createInvoicePayload = {
      customer_id: customerId,
      customer_name: customerName, // Add the customer name to the payload
      invoice_date: invoiceData.invoice_date || new Date().toISOString().split('T')[0],
      due_date: invoiceData.due_date || '', // Will use default terms if empty
      terms: invoiceData.terms || '30 Days',
      memo_to_customer: invoiceData.memo_to_customer || '',
      ar_account_id: arAccountId,
      ar_account_name: arAccountName, // Add the AR account name to the payload
      invoice_number: '',  // Will be auto-generated
      lines: await Promise.all(invoiceData.lines.map(async line => {
        // Ensure revenue_account_id is a number
        if (!line.revenue_account_id) {
          throw new Error('Revenue account ID is required for all invoice lines');
        }
        
        // Find the revenue account name
        let revenueAccountName = '';
        try {
          // Get account details to find the name
          const accounts = await getAccounts();
          const revenueAccount = accounts.find(acc => acc.id === line.revenue_account_id);
          
          if (revenueAccount) {
            revenueAccountName = revenueAccount.name;
            console.log(`[arUtils] Found revenue account name: ${revenueAccountName} for line: ${line.description}`);
          } else {
            // Fallback name if account not found
            revenueAccountName = 'Revenue';
            console.log(`[arUtils] Revenue account not found, using default name: ${revenueAccountName}`);
          }
        } catch (error) {
          console.error('[arUtils] Error getting revenue account name:', error);
          // Fallback if error occurs
          revenueAccountName = 'Revenue';
        }
        
        return {
          description: line.description,
          quantity: line.quantity || 1,
          unit_price: line.unit_price,
          revenue_account_id: line.revenue_account_id,
          revenue_account_name: revenueAccountName
        };
      }))
    };
    
    // Create the invoice in the database
    const invoiceId = await createInvoice(createInvoicePayload);
    
    if (!invoiceId) {
      return {
        success: false,
        message: "Failed to create invoice in the database."
      };
    }
    
    // Get the invoice number
    const invoices = await getInvoicesWithDetails({
      limit: 1,
      includeLines: false,
      includePayments: false
    });
    
    const invoiceNumber = invoices.length > 0 ? invoices[0].invoice_number : 'Unknown';
    
    return {
      success: true,
      message: `Successfully created invoice ${invoiceNumber} for customer ${customerId}`,
      invoiceId,
      invoiceNumber
    };
  } catch (error) {
    console.error('[arUtils] Error creating invoice from query:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error creating invoice"
    };
  }
}

/**
 * Check if a query might be about accounts receivable topics
 * @param query The user's query text
 */
export function mightBeAboutAR(query: string): boolean {
  const arTerms = [
    'invoice', 'invoices', 'invoicing',
    'bill', 'billing', 'bills', 
    'customer', 'customers', 'client', 'clients',
    'receivable', 'receivables', 'AR', 'A/R',
    'payment', 'payments', 'receipt', 'receipts',
    'revenue', 'revenues', 'sales', 'income',
    'credit', 'credits', 'credit memo', 'credit memos',
    'outstanding', 'aging', 'aged',
    'charge', 'charges'
  ];
  
  const normalizedQuery = query.toLowerCase();
  
  return arTerms.some(term => normalizedQuery.includes(term.toLowerCase()));
}

/**
 * Check if a query is about creating an invoice using regex patterns
 * @param query The user's query text
 */
export function isInvoiceCreationQuery(query: string): boolean {
  const patterns = [
    /create\s+(?:a\s+|an\s+)?(?:new\s+)?invoice/i,
    /generate\s+(?:a\s+|an\s+)?(?:new\s+)?invoice/i,
    /make\s+(?:a\s+|an\s+)?(?:new\s+)?invoice/i,
    /new\s+invoice\s+for/i,
    /send\s+(?:a\s+|an\s+)?(?:new\s+)?invoice/i,
    /invoice\s+(?:a\s+|the\s+)?customer/i,
    /bill\s+(?:a\s+|the\s+)?customer/i
  ];
  
  return patterns.some(pattern => pattern.test(query));
}

/**
 * Find relevant customers based on a query or specific customer ID
 * @param query The user's query text (can be empty if customerId is provided)
 * @param limit Maximum number of customers to return
 * @param customerId Optional specific customer ID to look up
 */
export async function findRelevantCustomers(
  query: string,
  limit: number = 5,
  customerId?: number
): Promise<Customer[]> {
  try {
    // If specific customer ID is provided, fetch just that customer
    if (customerId) {
      const customer = await getCustomerById(customerId);
      return customer ? [customer] : [];
    }
    
    // For empty queries, return most recent customers up to the limit
    if (!query || query.trim() === '') {
      return await getCustomers({ limit });
    }
    
    const normalizedQuery = query.toLowerCase();
    const allCustomers = await getCustomers();
    
    // Step 1: First try traditional text-based matching
    const matchedCustomers = allCustomers.filter(customer => {
      const customerName = customer.name.toLowerCase();
      const customerEmail = (customer.email || '').toLowerCase();
      const customerPhone = (customer.phone || '').toLowerCase();
      
      return customerName.includes(normalizedQuery) || 
             normalizedQuery.includes(customerName) ||
             customerEmail.includes(normalizedQuery) ||
             customerPhone.includes(normalizedQuery);
    });
    
    // If we found exact matches, return those
    if (matchedCustomers.length > 0) {
      console.log(`[arUtils] Found ${matchedCustomers.length} customer(s) via text matching for query: ${query}`);
      return matchedCustomers.slice(0, limit);
    }
    
    // Step 2: If no text-based matches, try AI matching
    console.log(`[arUtils] No exact customer matches for "${query}". Trying AI matching...`);
    const aiSelectedCustomer = await findCustomerWithAI(query, allCustomers);
    
    if (aiSelectedCustomer) {
      console.log(`[arUtils] AI found matching customer: ${aiSelectedCustomer.name} (ID: ${aiSelectedCustomer.id})`);
      return [aiSelectedCustomer];
    }
    
    // No matches found via any method
    console.log(`[arUtils] No customer matches found for query: ${query} via text or AI matching`);
    return [];
  } catch (error) {
    console.error('[arUtils] Error finding relevant customers:', error);
    return [];
  }
}

/**
 * Process an invoice payment from a user query using AI for extraction
 * @param query The user's query about recording a payment
 * @param previousMessages Optional array of previous messages for context
 * @param activeInvoiceId Optional ID of an invoice that is currently active in the conversation
 * @returns Object containing success status, message, and payment details
 */
export async function processInvoicePaymentFromQuery(
  query: string, 
  previousMessages: string[] = [], 
  activeInvoiceId?: number
): Promise<{ 
  success: boolean; 
  message: string; 
  payment?: any;
  invoice?: any;
}> {
  try {
    console.log('[arUtils] Processing invoice payment from query:', query);
    
    // Check if query contains a customer name to help with matching
    const customers = await getCustomers();
    let customerMatch = null;
    
    // Look for customer names in the query
    for (const customer of customers) {
      if (!customer.name) continue;
      
      // Clean up customer name and query for comparison
      const cleanCustomerName = customer.name.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
      const cleanQuery = query.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
      
      // Check for customer name in the query
      if (cleanQuery.includes(cleanCustomerName) && cleanCustomerName.length > 3) { // Min 4 chars to avoid false positives
        console.log('[arUtils] Found customer name in query:', customer.name);
        customerMatch = customer;
        break;
      }
    }
    
    // Step 1: Extract payment information from the query
    const paymentData = await extractPaymentInfoWithAI(query);
    if (!paymentData) {
      return { 
        success: false, 
        message: 'Could not extract payment information from your query. Please provide details like invoice number, amount, payment date, and payment method.'
      };
    }
    
    console.log('[arUtils] Extracted payment data:', paymentData);
    
    // If we found a customer name in the query, add it to the payment data
    if (customerMatch) {
      console.log('[arUtils] Using customer match from query:', customerMatch.name);
      paymentData.customer_id = customerMatch.id;
      paymentData.customer_name = customerMatch.name;
    }
    
    // Step 2: Resolve invoice identification
    let invoice = null;
    let invoiceIdentifier = '';
    
    // Case 1: Try using explicit invoice number from the query
    if (paymentData.invoice_number) {
      invoiceIdentifier = paymentData.invoice_number;
      invoice = await getInvoiceByNumber(paymentData.invoice_number);
    } 
    // Case 2: Try using activeInvoiceId if provided
    else if (activeInvoiceId) {
      invoiceIdentifier = `ID ${activeInvoiceId}`;
      invoice = await getInvoiceById(activeInvoiceId);
    } 
    // Case 3: Try to extract invoice number from previous messages
    else if (previousMessages.length > 0) {
      console.log('[arUtils] No invoice number in current query, searching previous messages');
      
      // Check if the query contains a demonstrative reference like "this invoice"
      const hasThisInvoiceReference = /this\s+invoice|that\s+invoice|the\s+invoice/i.test(query);
      console.log('[arUtils] Query contains demonstrative reference:', hasThisInvoiceReference);
      
      // Extract invoice numbers from previous messages using regex with expanded patterns
      const invoiceNumberPattern = /invoice\s+#?(\w+[-\w]*)|inv\s+#?(\w+[-\w]*)|invoice\s+number\s+#?(\w+[-\w]*)|invoice (\w+[-\w]*)|\b(INV[-\w]+)\b/gi;
      const invoiceIdPattern = /invoice\s+id\s*:\s*(\d+)|invoice\s+id\s+(\d+)|invoice (\d+)|#(\d+)/gi;
      
      // Look for mentions of the most recent/last invoice
      const lastInvoicePattern = /last\s+invoice|latest\s+invoice|most\s+recent\s+invoice/gi;
      
      // Combine previous messages into a single string for easier processing
      const messageHistory = previousMessages.join(' ');
      console.log('[arUtils] Searching previous message history:', messageHistory);
      
      let invoiceNumber = null;
      let match;
      
      // Try to find invoice number references
      while ((match = invoiceNumberPattern.exec(messageHistory)) !== null) {
        invoiceNumber = match[1] || match[2] || match[3] || match[4] || match[5];
        if (invoiceNumber) {
          console.log('[arUtils] Found invoice number in previous messages:', invoiceNumber);
          break;
        }
      }
      
      // If no invoice number found, try to find invoice ID references
      if (!invoiceNumber) {
        let invoiceId = null;
        while ((match = invoiceIdPattern.exec(messageHistory)) !== null) {
          invoiceId = match[1] || match[2] || match[3] || match[4];
          if (invoiceId) {
            console.log('[arUtils] Found invoice ID in previous messages:', invoiceId);
            break;
          }
        }
        
        if (invoiceId) {
          invoiceIdentifier = `ID ${invoiceId}`;
          invoice = await getInvoiceById(parseInt(invoiceId, 10));
        } 
        // If we have a demonstrative reference ("this invoice") or asking about the latest invoice, try to find it
        else if (hasThisInvoiceReference || lastInvoicePattern.test(messageHistory) || /the last customer invoice/i.test(messageHistory)) {
          console.log('[arUtils] Found reference to most recent invoice');
          // Get the most recent invoices - if we have a customer ID, filter by that customer
          // This makes "this invoice was paid" much more accurate when a customer name is in context
          const recentInvoices = await getInvoicesWithDetails({
            limit: 5,
            customerId: paymentData.customer_id // Will be undefined if no customer matched
          });
          
          // Sort by created_at in descending order (newest first)
          recentInvoices.sort((a, b) => {
            const dateA = new Date(a.created_at || a.invoice_date).getTime();
            const dateB = new Date(b.created_at || b.invoice_date).getTime();
            return dateB - dateA; // Descending order
          });
          
          if (recentInvoices.length > 0) {
            invoice = recentInvoices[0];
            invoiceIdentifier = invoice.invoice_number;
            console.log('[arUtils] Using most recent invoice:', invoiceIdentifier);
          }
        }
      } else {
        invoiceIdentifier = invoiceNumber;
        invoice = await getInvoiceByNumber(invoiceNumber);
      }
    }
    
    // If still no invoice found, return error
    if (!invoice) {
      return { 
        success: false, 
        message: invoiceIdentifier ? 
          `Invoice ${invoiceIdentifier} not found. Please check the invoice number and try again.` : 
          'Please specify which invoice number this payment is for.'
      };
    }
    
    // Step 3: Validate payment amount
    if (!paymentData.amount) {
      // If no amount is provided, default to the full invoice amount
      const totalAmount = typeof invoice.total_amount === 'number' ? 
        invoice.total_amount : 
        parseFloat(invoice.total_amount as unknown as string) || 0;
      
      // Check if there are any existing payments
      const existingPayments = invoice.payments || [];
      const totalPaid = existingPayments.reduce((sum: number, payment: any) => {
        const amount = typeof payment.amount_received === 'number' ? 
          payment.amount_received : 
          parseFloat(payment.amount_received as unknown as string) || 0;
        return sum + amount;
      }, 0);
      
      // Calculate remaining amount
      const remainingAmount = totalAmount - totalPaid;
      
      if (remainingAmount <= 0) {
        return { 
          success: false, 
          message: `Invoice #${invoice.invoice_number} is already fully paid.`
        };
      }
      
      // Use remaining amount as the default payment amount - store as number for the database
      // but convert to string for the log message
      paymentData.amount = remainingAmount;
      console.log(`[arUtils] No amount specified, using remaining balance: ${remainingAmount.toFixed(2)}`);
    }
    
    console.log('[arUtils] Found invoice:', invoice);
    
    // Step 4: Get default cash/bank account for deposit
    const accounts = await getAccounts();
    const cashAccount = accounts.find(account => 
      account.name.toLowerCase().includes('cash') || 
      account.name.toLowerCase().includes('bank') ||
      account.name.toLowerCase().includes('checking')
    );
    
    if (!cashAccount) {
      return { 
        success: false, 
        message: 'No cash or bank account found in the system to deposit the payment. Please set up a cash or bank account first.'
      };
    }
    
    // Step 5: Check for potential overpayment
    // Ensure all values are numbers by parsing strings
    const currentAmountPaid = typeof invoice.amount_paid === 'string' ? parseFloat(invoice.amount_paid) || 0 : (invoice.amount_paid || 0);
    const totalAmount = typeof invoice.total_amount === 'string' ? parseFloat(invoice.total_amount) : invoice.total_amount;
    const paymentAmount = typeof paymentData.amount === 'string' ? parseFloat(paymentData.amount) : (paymentData.amount || totalAmount - currentAmountPaid);
    const remainingBalance = totalAmount - currentAmountPaid;
    
    // Check if this payment would cause an overpayment
    if (paymentAmount > remainingBalance + 0.01) { // Add small tolerance for floating point precision
      console.log(`[arUtils] Preventing overpayment: Payment amount $${paymentAmount.toFixed(2)} exceeds remaining balance $${remainingBalance.toFixed(2)}`);
      return {
        success: false,
        message: `Cannot process payment of $${paymentAmount.toFixed(2)} as it would result in an overpayment. The remaining balance is $${remainingBalance.toFixed(2)}.`
      };
    }
    
    // Step 6: Determine payment date
    if (!paymentData.payment_date) {
      const today = new Date();
      paymentData.payment_date = today.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    
    // Step 7: Create the payment record
    const paymentResult = await createInvoicePayment({
      invoice_id: invoice.id,
      payment_date: paymentData.payment_date,
      amount_received: paymentAmount, // Payment amount is already parsed to a number above
      deposit_to_account_id: cashAccount.id,
      payment_method: paymentData.payment_method || 'Unknown',
      reference_number: paymentData.reference_number
      // notes field removed as it doesn't exist in the database schema
    });
    
    if (!paymentResult) {
      return { 
        success: false, 
        message: 'Error creating payment record. Please try again.'
      };
    }
    
    const amountForDisplay = (typeof paymentData.amount === 'string' ? parseFloat(paymentData.amount) : paymentData.amount).toFixed(2);
    const invoiceNumber = invoice.invoice_number;
    // Handle customer name from different invoice response formats
    const customerName = invoice.customer_name || (invoice as any).customer?.name || 'Unknown customer';
    
    console.log(`[arUtils] Created payment record: $${amountForDisplay} for Invoice #${invoiceNumber} from ${customerName}`);
    
    return { 
      success: true, 
      message: `Successfully recorded payment of $${amountForDisplay} for Invoice #${invoiceNumber} from ${customerName}`,
      payment: paymentResult,
      invoice: invoice
    };
  } catch (error) {
    console.error('[arUtils] Error processing invoice payment:', error);
    return { 
      success: false, 
      message: 'An error occurred while processing the payment. Please try again.'
    };
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
  customerId?: number,
  invoiceId?: number
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
    const options: any = {
      customerId,
      status: statusFilter,
      limit,
      includeLines,
      includePayments,
      fromDate,
      toDate
    };
    
    // If invoiceId is provided, prioritize that
    if (invoiceId) {
      options.invoiceId = invoiceId;
      options.includeLines = true;
      options.includePayments = true;
    }
    
    const invoices = await getInvoicesWithDetails(options);
    
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

import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { sql } from '@vercel/postgres';
import { 
  mightBeAboutAP, 
  findRelevantVendors, 
  findRelevantBills,
  isVendorCreationQuery,
  extractVendorInfoFromQuery,
  isBillCreationQuery,
  extractBillInfoFromQuery,
  isBillStatusUpdateQuery
} from "@/lib/apUtils";
import { 
  sendAgentMessage, 
  respondToAgentMessage, 
  AgentMessageType, 
  MessagePriority, 
  MessageStatus,
  getMessageById
} from "@/lib/agentCommunication";
import { extractBillInfoWithAI, analyzeBillStatusUpdateWithAI, BillStatusUpdateInfo } from "@/lib/aiExtraction";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { Vendor } from "../accounting/vendorQueries";
import { Bill, BillWithVendor } from "../accounting/billQueries";
import { BillLine } from "../accounting/billQueries";
import { BillWithDetails, BillLineDetail } from "../accounting/apQueries";
import { createVendor as createVendorRecord, getVendorByName, getVendors } from "@/lib/accounting/vendorQueries";
import { createBill, updateBill, getBill } from "@/lib/accounting/billQueries";
import { 
  isStatementProcessed, 
  recordProcessedStatement, 
  hasStartingBalanceStatement, 
  findStatementByAccountIdentifiers 
} from '@/lib/accounting/statementTracker';
import { checkStatementStatus, processStatementViaApi } from '@/lib/accounting/statementUtils';

/**
 * APAgent specializes in handling Accounts Payable related queries
 * It provides information about vendors, bills, payments, and AP workflows
 */
// Simple in-memory store for pending vendor creation info keyed by user
const pendingVendorCreation: Record<string, Partial<ReturnType<typeof extractVendorInfoFromQuery>>> = {};

export class APAgent implements Agent {
  id = "ap_agent";
  name = "Accounts Payable Agent";
  description = "Handles queries about vendors, bills, and accounts payable workflows";
  
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
  
  // Track the last duplicate vendor warning to handle confirmations
  private lastDuplicateWarning: { userId: string, vendorName: string, vendorInfo: any } | null = null;
  
  // Track the pending bill creation to handle confirmations
  private pendingBillCreation: { userId: string, billInfo: any, vendorId?: number } | null = null;
  
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }

  /**
   * Determine if this agent can handle the given query
   */
  async canHandle(query: string): Promise<boolean> {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Check for pending vendor or bill creation state - if there is any, we should
    // handle simple confirmations and responses to prompts
    const hasPendingVendors = Object.keys(pendingVendorCreation).length > 0;
    const hasPendingBill = this.pendingBillCreation !== null;
    
    if (hasPendingVendors || hasPendingBill) {
      // Handle simple confirmation responses
      const confirmationResponses = ['yes', 'yeah', 'yep', 'yup', 'yess', 'yesss', 'yea', 'sure', 'confirm', 'proceed', 'ok', 'okay'];
      if (confirmationResponses.includes(normalizedQuery)) {
        console.log(`[APAgent] Handling confirmation response: ${query}`);
        return true;
      }
    }
    
    // Use the AP detection logic for other cases
    return mightBeAboutAP(query);
  }

  /**
   * Process accounts payable related requests
   */

  /**
   * Get counts of bills by status
   */
  private async getBillsStatusCount(): Promise<Record<string, number>> {
    try {
      // Query the database to get counts of bills by status
      const result = await sql`
        SELECT status, COUNT(*) as count
        FROM bills
        WHERE is_deleted IS NOT TRUE
        GROUP BY status
        ORDER BY count DESC
      `;
      
      // Convert to a record object
      const statusCounts: Record<string, number> = {};
      for (const row of result.rows) {
        statusCounts[row.status] = parseInt(row.count);
      }
      
      return statusCounts;
    } catch (error) {
      console.error('[APAgent] Error getting bill status counts:', error);
      return {};
    }
  }

  private simplifyBill(bill: Bill): Partial<Bill> {
    // Convert string amounts to numbers if needed
    const total_amount = typeof bill.total_amount === 'number' 
      ? bill.total_amount 
      : parseFloat(bill.total_amount as unknown as string) || 0;
      
    const amount_paid = typeof bill.amount_paid === 'number' 
      ? bill.amount_paid 
      : parseFloat(bill.amount_paid as unknown as string) || 0;
      
    return {
      id: bill.id,
      bill_number: bill.bill_number,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      total_amount,
      amount_paid,
      status: bill.status
    };
  }

  /**
   * Handle queries about bill status counts
   */
  private async handleBillStatusCountQuery(context: AgentContext): Promise<AgentResponse> {
    try {
      // Get bill status counts
      const statusCounts = await this.getBillsStatusCount();
      
      // Format for display
      const statusStrings = Object.entries(statusCounts)
        .map(([status, count]) => `${count} bills in '${status}' status`)
        .join('\n');
      
      // Return formatted response
      return {
        success: true,
        message: `Here's a summary of your vendor bills by status:\n\n${statusStrings}\n\nWould you like more details about any specific status?`,
        data: { billStatusCounts: statusCounts }
      };
    } catch (error) {
      console.error('[APAgent] Error handling bill status count query:', error);
      return {
        success: false,
        message: `I encountered an error while retrieving bill status information. ${error instanceof Error ? error.message : 'Please try again later.'}`
      };
    }
  }

  async processRequest(context: AgentContext): Promise<AgentResponse> {
    console.log(`[APAgent] Processing request: ${context.query}`);
    
    try {
      // 1. Log the agent action
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AP_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
      
      // Handle simple confirmation responses for various AP agent operations
      const normalizedQuery = context.query.toLowerCase().trim();
      const confirmationResponses = ['yes', 'yeah', 'yep', 'yup', 'yess', 'yesss', 'yea', 'sure', 'confirm', 'proceed', 'ok', 'okay'];
      const cancellationResponses = ['no', 'nah', 'nope', 'cancel', 'stop', 'abort'];
      
      if (confirmationResponses.includes(normalizedQuery)) {
        // 1. Check if this is confirming a duplicate vendor creation
        if (this.lastDuplicateWarning?.userId === context.userId) {
          console.log(`[APAgent] Processing confirmation to create duplicate vendor: ${this.lastDuplicateWarning.vendorName}`);
          return this.createVendorAfterConfirmation(context);
        }
        
        // 2. Check if this is confirming bill creation
        if (this.pendingBillCreation?.userId === context.userId) {
          console.log(`[APAgent] Processing confirmation to create bill for vendor ID: ${this.pendingBillCreation.vendorId}`);
          return this.createBillWithInfo(context);
        }
        
        // 3. Check if this is confirming completing a vendor creation that has all required fields
        const userId = context.userId || 'unknown';
        if (pendingVendorCreation[userId]) {
          const vendorInfo = pendingVendorCreation[userId];
          
          // Check if we have all required vendor information
          if (vendorInfo.name && vendorInfo.contact_person && vendorInfo.email && 
              vendorInfo.phone && vendorInfo.address) {
            
            console.log(`[APAgent] Processing confirmation to complete vendor creation for: ${vendorInfo.name}`);
            console.log(`[APAgent] Vendor details:`, JSON.stringify(vendorInfo, null, 2));
            
            try {
              // Clear the pending state before proceeding
              const vendorToCreate = {...vendorInfo}; // Create a copy to avoid reference issues
              delete pendingVendorCreation[userId];
              
              // Create the vendor with all the information we've collected
              return this.createVendorWithInfo(userId, vendorToCreate);
            } catch (error) {
              console.error('[APAgent] Error processing vendor confirmation:', error);
              return {
                success: false,
                message: 'Sorry, there was an error processing your confirmation. Please try creating the vendor again.'
              };
            }
          } else {
            // We have pending info but some fields are still missing
            const missing: string[] = [];
            if (!vendorInfo.name) missing.push('vendor name');
            if (!vendorInfo.contact_person) missing.push('contact person');
            if (!vendorInfo.email) missing.push('email');
            if (!vendorInfo.phone) missing.push('phone number');
            if (!vendorInfo.address) missing.push('address');
            
            const needsList = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
            return {
              success: false,
              message: `I still need more information before I can create this vendor. Missing: ${needsList}.`
            };
          }
        }
      }
      
      // Handle explicit cancellation of duplicate vendor creation
      if (cancellationResponses.includes(normalizedQuery)) {
        if (this.lastDuplicateWarning?.userId === context.userId) {
          // User chose not to create duplicate; clear the warning and pending state
          this.lastDuplicateWarning = null;
          return {
            success: true,
            message: 'Okay, I will not create another vendor with the same name.'
          };
        }
        
        if (this.pendingBillCreation?.userId === context.userId) {
          // User chose not to create the bill; clear the pending state
          this.pendingBillCreation = null;
          return {
            success: true,
            message: 'Okay, I will not create the bill.'
          };
        }
      }
      
      // If we have an outstanding duplicate warning, prompt the user until they confirm or cancel.
      if (this.lastDuplicateWarning?.userId === context.userId) {
        return {
          success: false,
          message: `There is already a vendor named "${this.lastDuplicateWarning.vendorName}". Reply "yes" to create another one or "no" to cancel.`
        };
      }
      
      // 2. First, check if we have a pending vendor creation for this user
      const normalized = context.query.toLowerCase();
      const userId = context.userId || 'unknown';
      if (pendingVendorCreation[userId]) {
        console.log(`[APAgent] Found pending vendor creation for user ${userId}`);
        
        // Extract any new information from this message
        const newInfo = extractVendorInfoFromQuery(context.query);
        console.log(`[APAgent] Extracted new vendor info:`, newInfo);
        
        // Merge with stored information (new info takes precedence)
        const stored = pendingVendorCreation[userId];
        const merged = { 
          name: newInfo.name || stored.name,
          contact_person: newInfo.contact_person || stored.contact_person,
          email: newInfo.email || stored.email,
          phone: newInfo.phone || stored.phone,
          address: newInfo.address || stored.address
        };
        
        console.log(`[APAgent] Merged vendor info:`, merged);
        
        // Update store with new merged information
        pendingVendorCreation[userId] = merged;
        
        // If name still missing, ask again (unlikely)
        if (!merged.name) {
          return {
            success: false,
            message: 'I still need the vendor name. Please provide it.'
          };
        }
        
        // Check for remaining missing fields
        const missing: string[] = [];
        if (!merged.contact_person) missing.push('contact person');
        if (!merged.email) missing.push('email');
        if (!merged.phone) missing.push('phone number');
        if (!merged.address) missing.push('address');
        
        if (missing.length > 0) {
          const needsList = missing.join(', ').replace(/, ([^,]*)$/, ' and $1');
          return {
            success: false,
            message: `Thanks. I still need the following for vendor ${merged.name}: ${needsList}.`
          };
        }
        
        // All info available, ask for confirmation before proceeding
        console.log(`[APAgent] All vendor info collected, requesting confirmation for ${merged.name}`);
        
        // Don't clear the pending state yet, wait for confirmation
        return {
          success: true,
          message: `I have all the information needed to create vendor ${merged.name}:
- Contact Person: ${merged.contact_person}
- Email: ${merged.email}
- Phone: ${merged.phone}
- Address: ${merged.address}

Would you like me to create this vendor? Please confirm.`
        };
      }

      if (isVendorCreationQuery(normalized)) {
        return this.handleVendorCreation(context);
      }
      
      // First check for bill status update request (post/open bill)
      // This needs to be checked before bill creation because some bill creation queries 
      // may also match bill status update patterns
      const billStatusUpdate = isBillStatusUpdateQuery(context.query);
      if (billStatusUpdate.isUpdateRequest) {
        console.log(`[APAgent] Detected bill status update request - isBulkUpdate: ${billStatusUpdate.isBulkUpdate}, limitToRecent: ${billStatusUpdate.limitToRecent || 'none'}`);
        return this.handleBillStatusUpdate(context, billStatusUpdate);
      }
      
      // Only check for bill creation after confirming it's not a status update
      if (isBillCreationQuery(normalized)) {
        return this.handleBillCreation(context);
      }
      
      // Check if user is asking about bill counts or status
      if (normalized.includes('how many') && 
          (normalized.includes('bill') || normalized.includes('bills')) && 
          (normalized.includes('draft') || normalized.includes('open') || normalized.includes('paid') || normalized.includes('status'))) {
        console.log('[APAgent] Handling bill status count query');
        return this.handleBillStatusCountQuery(context);
      }
      
      // Check if this is a statement processing request
      if (this.isStatementProcessingQuery(normalized)) {
        console.log('[APAgent] Handling statement processing query');
        return this.processStatement(context, context.query);
      }
      
      // Check if this is a confirmation to set starting balance
      if (confirmationResponses.includes(normalizedQuery) && 
          this.pendingStatementProcessing[context.userId]) {
        console.log('[APAgent] Handling confirmation to set starting balance');
        return this.setAccountStartingBalance(context);
      }
      
      // 3. Gather relevant vendor information
      const relevantVendors = await findRelevantVendors(context.query, 5);
      console.log(`[APAgent] Found ${relevantVendors.length} relevant vendors`);
      
      // 3. Get relevant bills - if there's a vendor match, get their bills specifically
      const vendorId = relevantVendors.length > 0 ? relevantVendors[0].id : undefined;
      const relevantBills = await findRelevantBills(context.query, 5, vendorId);
      console.log(`[APAgent] Found ${relevantBills.length} relevant bills`);
      
      // 4. Prepare context for Claude
      const systemPrompt = this.buildSystemPrompt(relevantVendors, relevantBills);
      
      // 5. Format previous messages for Claude if available
      const messages: MessageParam[] = [];
      
      if (context.previousMessages && context.previousMessages.length > 0) {
        for (const msg of context.previousMessages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role as "user" | "assistant",
              content: msg.content
            });
          }
        }
      }
      
      // 6. Add current query
      messages.push({
        role: "user",
        content: context.query
      });
      
      // 7. Send to Claude
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages
      });
      
      // 8. Log successful completion
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AP_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { 
          query: context.query,
          relevantVendorsCount: relevantVendors.length,
          relevantBillsCount: relevantBills.length,
          agentId: this.id
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        message: typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text || '' : '',
        data: {
          relevantVendors: relevantVendors.map(v => this.simplifyVendor(v)),
          relevantBills: relevantBills.map(b => this.simplifyBill(b))
        }
      };
    } catch (error) {
      console.error("[APAgent] Error processing request:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AP_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: "I encountered an error while processing your accounts payable query. Please try again or rephrase your question.",
        data: {}
      };
    }
  }
  
  /**
   * Build a system prompt for Claude that includes vendor and bill information
   */
  private buildSystemPrompt(vendors: Vendor[], bills: Bill[]): string {
    let prompt = `You are an Accounts Payable Assistant specialized in helping users with vendor management, bill processing, and payment workflows.
    
Use the following information to help answer the user's query about accounts payable:

`;

    // Add vendor information if available
    if (vendors.length > 0) {
      prompt += `## Relevant Vendors\n\n`;
      
      vendors.forEach((vendor, index) => {
        prompt += `### Vendor ${index + 1}: ${vendor.name}\n`;
        prompt += `- Contact: ${vendor.contact_person || 'N/A'}\n`;
        prompt += `- Email: ${vendor.email || 'N/A'}\n`;
        prompt += `- Phone: ${vendor.phone || 'N/A'}\n`;
        prompt += `- Address: ${vendor.address || 'N/A'}\n\n`;
      });
    }
    
    // Add bill information if available
    if (bills.length > 0) {
      prompt += `## Relevant Bills\n\n`;
      
      bills.forEach((bill, index) => {
        const totalAmount = typeof bill.total_amount === 'number' ? bill.total_amount : parseFloat(bill.total_amount as unknown as string) || 0;
        const amountPaid = typeof bill.amount_paid === 'number' ? bill.amount_paid : parseFloat(bill.amount_paid as unknown as string) || 0;
        
        // Get vendor name from bill if available (from BillWithVendor)
        const vendorName = (bill as BillWithVendor).vendor_name || 'Unknown Vendor';
        
        prompt += `### Bill ${index + 1}: ${bill.bill_number || `Bill #${bill.id}`}\n`;
        prompt += `- Vendor: ${vendorName}\n`;
        prompt += `- Amount: $${totalAmount.toFixed(2)}\n`;
        prompt += `- Date: ${bill.bill_date}\n`;
        prompt += `- Due Date: ${bill.due_date}\n`;
        prompt += `- Status: ${bill.status || 'Unknown'}\n`;
        prompt += `- Amount Paid: $${amountPaid.toFixed(2)}\n`;
        
        // Add memo if available
        if (bill.memo) {
          prompt += `- Memo: ${bill.memo}\n`;
        }
        
        // Add line items if available
        const detailedBill = bill as BillWithDetails;
        if (detailedBill.lines && detailedBill.lines.length > 0) {
          prompt += `- Line Items:\n`;
          
          detailedBill.lines.forEach((line, lineIndex) => {
            prompt += `  * ${line.description || 'No description'}: $${line.amount} (${line.expense_account_name || 'Unknown account'})\n`;
          });
        }
        
        prompt += '\n';
      });
    }
    
    prompt += `## Guidelines for Responses:

1. Be concise and focused on accounts payable information.
2. If you're asked about a vendor or bill not in the context, explain that you don't have that specific information and suggest using the accounting system to look it up.
3. For general accounts payable questions, provide helpful guidance based on standard accounting practices.
4. Recommend using the Accounts Payable section of the accounting system for detailed vendor or bill management.
5. Don't make up information about specific vendors or bills that aren't provided in the context.
`;

    return prompt;
  }
  
  /**
   * Create a vendor with complete information
   * This is used when we have all required fields
   */
  private async createVendorWithInfo(userId: string, vendorInfo: any): Promise<AgentResponse & { vendor?: any }> {
    try {
      console.log('[APAgent] Creating vendor with complete info:', vendorInfo);
      
      // Check for duplicate vendor name
      const existing = await getVendorByName(vendorInfo.name!);
      if (existing) {
        // Store duplicate warning so we can handle user confirmation later
        this.lastDuplicateWarning = {
          userId: userId || 'unknown',
          vendorName: vendorInfo.name!,
          vendorInfo
        };
        return {
          success: false,
          message: `A vendor named "${vendorInfo.name}" already exists (ID ${existing?.id || 'unknown'}). Do you still want to create another one? If yes, please confirm.`
        };
      }
      
      // Create vendor in database
      let dbVendor;
      try {
        dbVendor = await createVendorRecord({
          name: vendorInfo.name!,
          contact_person: vendorInfo.contact_person,
          email: vendorInfo.email,
          phone: vendorInfo.phone,
          address: vendorInfo.address
        });
      } catch (dbErr) {
        console.error('[APAgent] DB error creating vendor:', dbErr);
        await logAuditEvent({
          user_id: userId || 'unknown',
          action_type: "VENDOR_CREATION",
          entity_type: "VENDOR",
          entity_id: vendorInfo.name,
          context: { vendorInfo, error: dbErr },
          status: "FAILURE",
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          message: 'Failed to create the vendor due to a server error.'
        };
      }

      await logAuditEvent({
        user_id: userId || 'unknown',
        action_type: "VENDOR_CREATION",
        entity_type: "VENDOR",
        entity_id: dbVendor.id?.toString() || vendorInfo.name,
        context: { vendorInfo, vendorId: dbVendor.id },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `Vendor ${dbVendor.name} has been created successfully.`,
        vendor: dbVendor
      };
    } catch (error) {
      console.error('[APAgent] Error in createVendorWithInfo:', error);
      return {
        success: false,
        message: 'An error occurred while creating the vendor. Please try again.'
      };
    }
  }
  
  /**
   * Handle vendor creation requests
   * This handles the initial vendor creation request and extracts information
   */
  /**
   * Process a confirmation to create a vendor even though it's a duplicate
   */
  private async createVendorAfterConfirmation(context: AgentContext): Promise<AgentResponse> {
    try {
      // If we don't have vendor info stored, this is an error condition
      if (!this.lastDuplicateWarning || !this.lastDuplicateWarning.vendorInfo) {
        return {
          success: false,
          message: "I'm not sure which vendor you're confirming. Please provide the vendor details again."
        };
      }
      
      const vendorInfo = this.lastDuplicateWarning.vendorInfo;
      console.log(`[APAgent] Creating duplicate vendor after confirmation: ${vendorInfo.name}`);
      
      // Create vendor in database
      let dbVendor;
      try {
        dbVendor = await createVendorRecord({
          name: vendorInfo.name!,
          contact_person: vendorInfo.contact_person,
          email: vendorInfo.email,
          phone: vendorInfo.phone,
          address: vendorInfo.address
        });
      } catch (dbErr) {
        console.error('[APAgent] DB error creating vendor:', dbErr);
        await logAuditEvent({
          user_id: context.userId || 'unknown',
          action_type: "VENDOR_CREATION",
          entity_type: "VENDOR",
          entity_id: vendorInfo.name,
          context: { query: context.query, vendorInfo, error: dbErr },
          status: "FAILURE",
          timestamp: new Date().toISOString()
        });
        return {
          success: false,
          message: 'Failed to create the vendor due to a server error.'
        };
      }

      // Clear the stored warning since we've now handled it
      this.lastDuplicateWarning = null;
      
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "VENDOR_CREATION",
        entity_type: "VENDOR",
        entity_id: dbVendor.id?.toString() || vendorInfo.name,
        context: { query: context.query, vendorInfo, vendorId: dbVendor.id },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `Vendor ${dbVendor.name} has been created successfully, even though a vendor with the same name already existed.`
      };
    } catch (error) {
      console.error('[APAgent] Error in createVendorAfterConfirmation:', error);
      return {
        success: false,
        message: 'An error occurred while creating the vendor. Please try again.'
      };
    }
  }
  
  /**
   * Store partial vendor information and prompt for missing fields
   */
  private async storePartialVendorInfo(context: AgentContext, vendorInfo: any): Promise<AgentResponse> {
    const missingFields: string[] = [];
    if (!vendorInfo.name) missingFields.push('vendor name');
    if (!vendorInfo.contact_person) missingFields.push('contact person');
    if (!vendorInfo.email) missingFields.push('email');
    if (!vendorInfo.phone) missingFields.push('phone number');
    if (!vendorInfo.address) missingFields.push('address');
    
    // Store what we have so far in our in-memory store
    pendingVendorCreation[context.userId || 'unknown'] = vendorInfo;
    
    // Log the attempt
    await logAuditEvent({
      user_id: context.userId || 'unknown',
      action_type: "VENDOR_CREATION",
      entity_type: "VENDOR",
      entity_id: vendorInfo.name || 'unknown',
      context: { query: context.query, vendorInfo, missingFields },
      status: "FAILURE",
      timestamp: new Date().toISOString()
    });
    
    // Format a friendly message asking for the missing fields
    const needsList = missingFields.join(', ').replace(/, ([^,]*)$/, ' and $1');
    
    return {
      success: false,
      message: `To create the vendor${vendorInfo.name ? ' '+vendorInfo.name : ''}, I still need the following information: ${needsList}. Please provide.`
    };
  }
  
  private async handleVendorCreation(context: AgentContext): Promise<AgentResponse> {
    try {
      // Extract vendor details from the query
      const vendorInfo = extractVendorInfoFromQuery(context.query);
      console.log('[APAgent] Extracted vendor info:', vendorInfo);
      
      // Log audit event
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "VENDOR_CREATION",
        entity_type: "VENDOR",
        entity_id: vendorInfo.name || 'unknown',
        context: { query: context.query, vendorInfo },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
      
      // Determine any missing fields we want to collect before creation
      const missingFields: string[] = [];
      if (!vendorInfo.name) missingFields.push('vendor name');
      if (!vendorInfo.contact_person) missingFields.push('contact person');
      if (!vendorInfo.email) missingFields.push('email');
      if (!vendorInfo.phone) missingFields.push('phone number');
      if (!vendorInfo.address) missingFields.push('address');

      // Store what we have and ask for more
      return await this.storePartialVendorInfo(context, vendorInfo);
      
      // Check for duplicate vendor name
      const existing = await getVendorByName(vendorInfo.name!);
      if (existing) {
        return {
          success: false,
          message: `A vendor named "${vendorInfo.name}" already exists (ID ${existing?.id || 'unknown'}). Do you still want to create another one? If yes, please confirm.`
        };
      }
      
      // If we have all required information, proceed with creation
      if (vendorInfo.name && vendorInfo.contact_person && vendorInfo.email && 
          vendorInfo.phone && vendorInfo.address) {
        return this.createVendorWithInfo(context.userId || 'unknown', vendorInfo);
      }
      
      // Otherwise, store what we have and prompt for the rest
      return await this.storePartialVendorInfo(context, vendorInfo);
      
    } catch (error) {
      console.error('[APAgent] Error in vendor creation:', error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "VENDOR_CREATION",
        entity_type: "VENDOR",
        entity_id: 'unknown',
        context: { query: context.query, errorType: "ERROR" },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: `I encountered an error while trying to create the vendor: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle bill creation requests
   * This handles the initial bill creation request and extracts information using AI
   */
  /**
   * Handle bill status update requests
   * This handles requests to change a bill's status (e.g., from Draft to Open)
   */
  private async handleBillStatusUpdate(context: AgentContext, legacyUpdateInfo: ReturnType<typeof isBillStatusUpdateQuery>): Promise<AgentResponse> {
    try {
      // First, use our AI-powered analyzer for more accurate detection
      const updateInfo = await analyzeBillStatusUpdateWithAI(context.query);
      console.log('[APAgent] AI analysis of bill status update:', updateInfo);
      
      // Combine info from both analyzers (AI and legacy regex)
      // The AI analyzer should take precedence, but we keep legacy info as fallback
      const combinedInfo = {
        isUpdateRequest: updateInfo.isUpdateRequest || legacyUpdateInfo.isUpdateRequest,
        isBulkUpdate: updateInfo.isBulkUpdate || legacyUpdateInfo.isBulkUpdate,
        requestedStatus: updateInfo.requestedStatus || legacyUpdateInfo.requestedStatus,
        billNumbers: updateInfo.billNumbers?.length ? updateInfo.billNumbers : (legacyUpdateInfo.billNumbers || []),
        limitToRecent: updateInfo.limitToRecent || legacyUpdateInfo.limitToRecent,
        vendorName: updateInfo.vendorName
      };
      
      // Need a target status regardless of what kind of update it is
      if (!combinedInfo.requestedStatus) {
        return {
          success: false,
          message: "I'm not sure what status you want to set for the bills. Please specify if you want to set them to 'Open'."
        };
      }

      // Handle recent bills if specified
      if (combinedInfo.limitToRecent && combinedInfo.limitToRecent > 0) {
        return await this.handleRecentBillsStatusUpdate(context, combinedInfo.requestedStatus, combinedInfo.limitToRecent);
      }
      
      // Handle bulk update if requested
      if (combinedInfo.isBulkUpdate) {
        // If we have a vendor name, only update bills for that vendor
        if (combinedInfo.vendorName) {
          return await this.handleVendorBillsStatusUpdate(context, combinedInfo.requestedStatus, combinedInfo.vendorName);
        }
        return await this.handleBulkBillStatusUpdate(context, combinedInfo.requestedStatus, combinedInfo.billNumbers);
      }
      
      // For single bill updates, we need a bill number
      // Use the first bill number from the combined info
      const billNumber = combinedInfo.billNumbers?.[0] || legacyUpdateInfo.billNumber;
      
      if (!billNumber) {
        return {
          success: false,
          message: "I need a bill number to update the status. Please specify which bill you'd like to update."
        };
      }

      console.log(`[APAgent] Attempting to update bill #${billNumber} to status: ${combinedInfo.requestedStatus}`);
      
      // Find the bill by bill number
      const bills = await findRelevantBills(billNumber);
      
      if (bills.length === 0) {
        return {
          success: false,
          message: `I couldn't find a bill with the number ${billNumber}. Please check the bill number and try again.`
        };
      }

      // Get the first matching bill
      const bill = bills[0];
      
      // If the bill is already in the requested status, inform the user
      if (bill.status === combinedInfo.requestedStatus) {
        return {
          success: true,
          message: `Bill #${billNumber} is already in ${combinedInfo.requestedStatus} status.`
        };
      }

      // Make sure the bill has an ID
      if (!bill.id) {
        return {
          success: false,
          message: `Found bill #${billNumber} but it has an invalid ID. Please contact your system administrator.`
        };
      }
      
      console.log(`[APAgent] Found bill ID ${bill.id}, current status: ${bill.status}, updating to: ${combinedInfo.requestedStatus}`);
      
      // For bills changing from Draft to Open, we need to:
      // 1. Update the bill status
      // 2. Create a journal entry
      const previousStatus = bill.status;
      const isChangingToOpen = previousStatus !== 'Open' && combinedInfo.requestedStatus === 'Open';
      
      // First, update the bill status via the database
      const updatedBill = await updateBill(bill.id, { status: combinedInfo.requestedStatus });
      
      if (!updatedBill) {
        return {
          success: false,
          message: `Failed to update bill #${billNumber}. The bill might have been deleted or there was a server error.`
        };
      }
      
      // If changing to Open status, call the API endpoint to create the journal entry
      // This API does the full update + journal entry creation
      if (isChangingToOpen) {
        console.log(`[APAgent] Bills have been updated to Open status, now creating journal entries`);
        try {
          console.log(`[APAgent] Bill changed from ${previousStatus} to Open - calling API to create journal entry`);
          
          // Make a simple cross-process API call that will detect the status change
          // and create the journal entry
          // Get base URL for the API call
          const host = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
          const protocol = host.includes('localhost') ? 'http' : 'https';
          const baseUrl = host.startsWith('http') ? host : `${protocol}://${host}`;
          
          console.log(`[APAgent] Using base URL for API call: ${baseUrl}`);
          
          const response = await fetch(`${baseUrl}/api/bills/${bill.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer internal-api-call'
            },
            body: JSON.stringify({
              bill: { 
                // Set status to Open again, which will trigger journal entry creation
                // via the API's existing logic
                status: 'Open' 
              }
            })
          });
          
          if (!response.ok) {
            console.warn(`[APAgent] API call for journal entry creation returned status ${response.status}`);
            // Note: We don't return an error here since the bill status was already updated
          } else {
            console.log(`[APAgent] Journal entry created successfully for bill ${bill.id}`);
          }
        } catch (apiError) {
          // Log the error but don't fail the operation since the bill status was already updated
          console.error('[APAgent] Error calling API to create journal entry:', apiError);
        }
      }

      // Log the status update
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "BILL_STATUS_UPDATE",
        entity_type: "BILL",
        entity_id: bill.id.toString(),
        context: { 
          query: context.query, 
          previousStatus: bill.status,
          newStatus: combinedInfo.requestedStatus 
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `I've updated bill #${billNumber} from '${bill.status}' to '${combinedInfo.requestedStatus}' status. ${combinedInfo.requestedStatus === 'Open' ? 'A journal entry has been created for this bill.' : ''}`
      };
    } catch (error) {
      console.error('[APAgent] Error updating bill status:', error);
      
      return {
        success: false,
        message: `Sorry, I encountered an error while trying to update the bill status. ${error instanceof Error ? error.message : 'Please try again later.'}`
      };
    }
  }
  
  /**
   * Handle updating the status of the most recent bills
   * This is used when the user requests to update the N most recent bills
   */
  private async handleRecentBillsStatusUpdate(context: AgentContext, newStatus: string, limit: number): Promise<AgentResponse> {
    try {
      console.log(`[APAgent] Attempting to update the ${limit} most recent draft bills to ${newStatus}`);
      
      // Find the most recent draft bills up to the limit
      // Only select columns that we know exist in the bills table
      console.log(`[APAgent] Searching for draft bills with limit: ${limit}`);
      
      // Debug query to check what status values exist in the database
      const statusCheck = await sql`
        SELECT DISTINCT status FROM bills
      `;
      console.log(`[APAgent] Available bill statuses in database:`, statusCheck.rows.map(row => row.status));
      
      // Using case-insensitive comparison for status field
      const result = await sql`
        SELECT id, bill_number, status, vendor_id, created_at 
        FROM bills 
        WHERE LOWER(status) = 'draft'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      
      const recentBills = result.rows;
      
      if (recentBills.length === 0) {
        return {
          success: false,
          message: "I couldn't find any recent bills in 'Draft' status to update. All bills may already be in 'Open' status."
        };
      }
      
      console.log(`[APAgent] Found ${recentBills.length} recent bills in Draft status to update`);
      
      // Get bill IDs to update
      const billIds = recentBills.map(bill => bill.id);
      
      // Update all bills to the new status
      let updatedBills;
      try {
        // If we have no IDs, return early
        if (billIds.length === 0) {
          console.log('[APAgent] No valid bill IDs found to update');
          return {
            success: false,
            message: "No valid bills found to update."
          };
        }
        
        console.log(`[APAgent] Attempting to update ${billIds.length} bills with IDs: ${billIds.join(', ')} to status: ${newStatus.toLowerCase()}`);
        
        // Update each bill individually to avoid array syntax issues
        // Ensure status is properly capitalized to match database expectations
        // Most database schemas use 'Draft' and 'Open' with capital first letters
        const formattedStatus = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).toLowerCase();
        console.log(`[APAgent] Updating bills to status: ${formattedStatus}`);
        
        for (const billId of billIds) {
          await sql`
            UPDATE bills
            SET status = ${formattedStatus},
            updated_at = NOW()
            WHERE id = ${billId}
          `;
        }
        
        // Get updated bills using parameterized queries for each ID
        // This avoids any potential issues with SQL injection or string formatting
        const updatedBillsPromises = billIds.map(id => {
          return sql`
            SELECT id, bill_number, status
            FROM bills
            WHERE id = ${id}
          `;
        });
        
        const updatedBillsResults = await Promise.all(updatedBillsPromises);
        updatedBills = { rows: updatedBillsResults.flatMap(result => result.rows) };
      } catch (dbError) {
        console.error('[APAgent] Database error in recent bills update:', dbError);
        return {
          success: false,
          message: `I encountered a database error while trying to update the bills: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`
        };
      }
      
      // For bills changing to Open status, call the API endpoint to create journal entries
      const isChangingToOpen = newStatus.toLowerCase() === 'open';
      let journalEntriesCreated = 0;
      
      if (isChangingToOpen) {
        // Get base URL for the API call
        const host = process.env.VERCEL_URL || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        
        // Create journal entries for each bill
        for (const billId of billIds) {
          try {
            const response = await fetch(`${baseUrl}/api/bills/${billId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer internal-api-call'
              },
              body: JSON.stringify({
                bill: { status: 'Open' }
              })
            });
            
            if (response.ok) {
              console.log(`[APAgent] Successfully created journal entry for bill ${billId}`);
              journalEntriesCreated++;
            }
          } catch (apiError) {
            // Log but continue with other bills
            console.error(`[APAgent] Error creating journal entry for bill ${billId}:`, apiError);
          }
        }
      }
      
      // Format bill numbers for the message
      const billNumbers = recentBills.map(bill => bill.bill_number || `ID: ${bill.id}`).join(', ');
      
      // Log the bulk status update
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "BULK_BILL_STATUS_UPDATE",
        entity_type: "BILLS",
        entity_id: "recent",
        context: { 
          query: context.query, 
          previousStatus: "Draft",
          newStatus: newStatus,
          billCount: recentBills.length,
          limit: limit,
          billIds: billIds
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `I've updated the ${recentBills.length} most recent draft bills to '${newStatus}' status.${billNumbers ? ` The bills updated were: ${billNumbers}.` : ''} ${isChangingToOpen ? `Journal entries have been created for ${journalEntriesCreated} bills.` : ''}`
      };
    } catch (error) {
      console.error('[APAgent] Error in recent bills status update:', error);
      
      return {
        success: false,
        message: `Sorry, I encountered an error while trying to update the recent bills: ${error instanceof Error ? error.message : 'Please try again later.'}`
      };
    }
  }
  
  /**
   * Handle updating bills for a specific vendor
   * This is used when the user requests to update all bills from a specific vendor
   */
  private async handleVendorBillsStatusUpdate(context: AgentContext, newStatus: string, vendorName: string): Promise<AgentResponse> {
    try {
      console.log(`[APAgent] Attempting to update bills for vendor '${vendorName}' to ${newStatus}`);
      
      // First, find the vendor ID by name
      const vendorResult = await sql`
        SELECT id, name 
        FROM vendors 
        WHERE name ILIKE ${`%${vendorName}%`}
        LIMIT 1
      `;
      
      if (vendorResult.rows.length === 0) {
        return {
          success: false,
          message: `I couldn't find a vendor matching '${vendorName}'. Please check the vendor name and try again.`
        };
      }
      
      const vendorId = vendorResult.rows[0].id;
      const exactVendorName = vendorResult.rows[0].name;
      
      console.log(`[APAgent] Found vendor ID ${vendorId} for '${exactVendorName}'`);
      
      // Find draft bills for this vendor
      // Only select columns that we know exist in the bills table
      const billsResult = await sql`
        SELECT id, bill_number, status
        FROM bills 
        WHERE vendor_id = ${vendorId}
        AND status = 'Draft'
      `;
      
      const vendorBills = billsResult.rows;
      
      if (vendorBills.length === 0) {
        return {
          success: false,
          message: `I couldn't find any bills in 'Draft' status for vendor '${exactVendorName}'.`
        };
      }
      
      console.log(`[APAgent] Found ${vendorBills.length} draft bills for vendor '${exactVendorName}'`);
      
      // Get bill IDs to update
      const billIds = vendorBills.map(bill => bill.id);
      
      // Update all bills to the new status
      let updatedBills;
      try {
        // Create a parameterized query with billIds as a comma-separated list
        const billIdString = billIds.join(', ');
        
        // If we have no IDs, return early
        if (!billIdString) {
          return {
            success: false,
            message: "No valid bills found to update."
          };
        }
        
        // Use raw SQL with a properly escaped list of IDs
        updatedBills = await sql`
          UPDATE bills
          SET status = ${newStatus.toLowerCase()},
          updated_at = NOW()
          WHERE id IN (SELECT unnest(ARRAY[${billIdString}]::integer[]))
          RETURNING id, bill_number, status
        `;
      } catch (dbError) {
        console.error('[APAgent] Database error in vendor bills update:', dbError);
        return {
          success: false,
          message: `I encountered a database error while trying to update the vendor bills: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`
        };
      }
      
      // For bills changing to Open status, call the API endpoint to create journal entries
      const isChangingToOpen = newStatus.toLowerCase() === 'open';
      let journalEntriesCreated = 0;
      
      if (isChangingToOpen) {
        // Get base URL for the API call
        const host = process.env.VERCEL_URL || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        
        // Create journal entries for each bill
        for (const billId of billIds) {
          try {
            const response = await fetch(`${baseUrl}/api/bills/${billId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                bill: { status: 'Open' }
              })
            });
            
            if (response.ok) {
              journalEntriesCreated++;
            }
          } catch (apiError) {
            // Log but continue with other bills
            console.error(`[APAgent] Error creating journal entry for bill ${billId}:`, apiError);
          }
        }
      }
      
      // Format bill numbers for the message
      const billNumbers = vendorBills.map(bill => bill.bill_number || `ID: ${bill.id}`).join(', ');
      
      // Log the bulk status update
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "VENDOR_BILLS_STATUS_UPDATE",
        entity_type: "BILLS",
        entity_id: vendorId.toString(),
        context: { 
          query: context.query, 
          previousStatus: "Draft",
          newStatus: newStatus,
          vendorName: exactVendorName,
          vendorId: vendorId,
          billCount: vendorBills.length,
          billIds: billIds
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `I've updated ${vendorBills.length} draft bills for vendor '${exactVendorName}' to '${newStatus}' status.${billNumbers ? ` The bills updated were: ${billNumbers}.` : ''} ${isChangingToOpen ? `Journal entries have been created for ${journalEntriesCreated} bills.` : ''}`
      };
    } catch (error) {
      console.error('[APAgent] Error in vendor bills status update:', error);
      
      return {
        success: false,
        message: `Sorry, I encountered an error while trying to update bills for the vendor: ${error instanceof Error ? error.message : 'Please try again later.'}`
      };
    }
  }
  
  /**
   * Handle bulk bill status updates
   * This handles updating multiple bills at once, typically from Draft to Open status
   */
  private async handleBulkBillStatusUpdate(context: AgentContext, newStatus: string, billNumbers?: string[]): Promise<AgentResponse> {
    try {
      console.log(`[APAgent] Attempting bulk bill status update to ${newStatus}`);
      
      // Find bills by ID if bill numbers are provided, otherwise find all draft bills
      let result;
      
      if (billNumbers && billNumbers.length > 0) {
        console.log(`[APAgent] Looking for specific bills by ID/number: ${billNumbers.join(', ')}`);
        
        // Try to find bills by ID first (if the bill numbers are numeric)
        const numericIds = billNumbers
          .filter((num: string) => !isNaN(parseInt(num)))
          .map((num: string) => parseInt(num));
          
        if (numericIds.length > 0) {
          console.log(`[APAgent] Searching for bills with IDs: ${numericIds.join(', ')}`);
          const idList = numericIds.join(',');
          result = await sql.query(`
            SELECT id, bill_number, status, vendor_id, total_amount 
            FROM bills 
            WHERE id IN (${idList})
          `);
        } else {
          // If no numeric IDs, try to find by bill_number
          console.log(`[APAgent] No numeric IDs found, searching by bill_number`);
          const billNumberList = billNumbers.map(bn => `'${bn}'`).join(',');
          result = await sql.query(`
            SELECT id, bill_number, status, vendor_id, total_amount 
            FROM bills 
            WHERE bill_number IN (${billNumberList})
          `);
        }
      } else {
        // No specific bill numbers provided, find bills based on the requested status change
        // For payment requests, we need to find Open bills
        // For other status changes (like Draft to Open), we find Draft bills
        const statusToFind = newStatus.toLowerCase() === 'paid' ? 'open' : 'draft';
        console.log(`[APAgent] No specific bill numbers provided, finding all ${statusToFind} bills`);
        
        // Add user_id filter for proper data isolation
        const userId = context.userId;
        if (!userId) {
          console.warn('[APAgent] No userId provided for bill status update, data isolation may be compromised');
        }
        
        // Use parameterized query with user_id filter
        if (userId) {
          result = await sql.query(
            `SELECT id, bill_number, status, vendor_id, total_amount 
             FROM bills 
             WHERE LOWER(status) = $1 AND user_id = $2`,
            [statusToFind, userId]
          );
        } else {
          result = await sql.query(
            `SELECT id, bill_number, status, vendor_id, total_amount 
             FROM bills 
             WHERE LOWER(status) = $1`,
            [statusToFind]
          );
        }
      }
      
      const billsToUpdate = result.rows;
      
      // Determine the appropriate message based on the status we're looking for
      const statusToFind = newStatus.toLowerCase() === 'paid' ? 'Open' : 'Draft';
      
      if (billsToUpdate.length === 0) {
        return {
          success: false,
          message: `I couldn't find any bills in '${statusToFind}' status to update.`
        };
      }
      
      console.log(`[APAgent] Found ${billsToUpdate.length} bills in ${statusToFind} status to update`);
      
      // Get bill IDs to update
      const billIds = billsToUpdate.map((bill: any) => bill.id);
      
      // Update all bills to the new status
      let updatedBills;
      try {
        // If we have no IDs, return early
        if (billIds.length === 0) {
          return {
            success: false,
            message: "No valid bills found to update."
          };
        }
        
        console.log(`[APAgent] Updating bill status for ${billIds.length} bills to ${newStatus}`);
        
        // Use the dedicated API endpoint for bulk bill status updates
        try {
          // Get base URL for the API call
          const host = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'localhost:3000';
          const protocol = host.includes('localhost') ? 'http' : 'https';
          const baseUrl = host.startsWith('http') ? host : `${protocol}://${host}`;
          console.log(`[APAgent] Using base URL for API call: ${baseUrl}`);
          
          const response = await fetch(`${baseUrl}/api/bills/update-status`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer internal-api-call'
            },
            body: JSON.stringify({
              billIds: billIds,
              newStatus: newStatus
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[APAgent] API error in bulk bill update: ${response.status} - ${errorText}`);
            
            // Check for specific error messages and handle them gracefully
            if (errorText.includes('No default payment account found')) {
              return {
                success: false,
                message: "I couldn't complete the payment process because no default payment account is set up. Please set up a payment account first."
              };
            }
            
            throw new Error(`API error: ${response.status} - ${errorText}`);
          }
          
          const result = await response.json();
          updatedBills = result;
          console.log(`[APAgent] Successfully updated ${billIds.length} bills to ${newStatus} status`);
        } catch (apiError) {
          console.error('[APAgent] API error in bulk bill update:', apiError);
          throw apiError;
        }
      } catch (dbError) {
        console.error('[APAgent] Database error in bulk bill update:', dbError);
        return {
          success: false,
          message: `I encountered a database error while trying to update the bills: ${dbError instanceof Error ? dbError.message : 'Unknown database error'}`
        };
      }
      
      // For bills changing to Open status, call the API endpoint to create journal entries
      const isChangingToOpen = newStatus.toLowerCase() === 'open';
      let journalEntriesCreated = 0;
      
      if (isChangingToOpen) {
        // Get base URL for the API call
        const host = process.env.VERCEL_URL || 'localhost:3000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        
        // Create journal entries for each bill
        for (const billId of billIds) {
          try {
            const response = await fetch(`${baseUrl}/api/bills/${billId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                bill: { status: 'Open' }
              })
            });
            
            if (response.ok) {
              journalEntriesCreated++;
            }
          } catch (apiError) {
            // Log but continue with other bills
            console.error(`[APAgent] Error creating journal entry for bill ${billId}:`, apiError);
          }
        }
      }
      
      // Log the bulk status update
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "BULK_BILL_STATUS_UPDATE",
        entity_type: "BILLS",
        entity_id: "multiple",
        context: { 
          query: context.query, 
          previousStatus: "Draft",
          newStatus: newStatus,
          billCount: billsToUpdate.length,
          billIds: billIds
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: `I've updated ${billsToUpdate.length} bills to '${newStatus}' status. ${isChangingToOpen ? `Journal entries have been created for ${journalEntriesCreated} bills.` : ''}`
      };
    } catch (error) {
      console.error('[APAgent] Error in bulk bill status update:', error);
      
      return {
        success: false,
        message: `Sorry, I encountered an error while trying to update multiple bills: ${error instanceof Error ? error.message : 'Please try again later.'}`
      };
    }
  }

  /**
   * Handle bill creation requests
   */
  private async handleBillCreation(context: AgentContext): Promise<AgentResponse> {
    try {
      // First check if this is a bill creation request using the simple pattern matching
      if (!isBillCreationQuery(context.query)) {
        return {
          success: false,
          message: "I'm not sure if you're trying to create a bill. Please provide details like vendor name, amount, and what the bill is for."
        };
      }
      
      // Use AI to extract bill details from the query for more accurate results
      console.log('[APAgent] Using AI to extract bill info from query');
      const billInfo = await extractBillInfoWithAI(context.query);
      console.log('[APAgent] AI-extracted bill info:', billInfo);
      
      // Log audit event
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "BILL_CREATION",
        entity_type: "BILL",
        entity_id: billInfo.vendor_name || 'unknown',
        context: { query: context.query, billInfo },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
    
      // Clean up vendor name - remove trailing periods and other punctuation
      if (billInfo.vendor_name) {
        billInfo.vendor_name = billInfo.vendor_name.replace(/[.,;:!]+$/, "").trim();
      }
      
      // If we have a vendor name, try to find matching vendor
      let vendorId: number | undefined;
      let vendorExactMatch = false;
      
      if (billInfo.vendor_name) {
        try {
          console.log(`[APAgent] Searching for vendor with name: "${billInfo.vendor_name}"`);
          const vendors = await getVendors(1, 10, billInfo.vendor_name);
          console.log(`[APAgent] Found ${vendors.vendors.length} potential matching vendors:`, vendors.vendors);
          
          if (vendors.vendors.length > 0) {
            // Check for exact match first
            const exactMatch = vendors.vendors.find(v => 
              v.name.toLowerCase() === billInfo.vendor_name?.toLowerCase()
            );
            
            if (exactMatch) {
              vendorId = exactMatch.id;
              vendorExactMatch = true;
              console.log(`[APAgent] Found exact vendor match with ID ${vendorId}`);
            } else {
              // If no exact match, use the first vendor
              vendorId = vendors.vendors[0].id;
              console.log(`[APAgent] Using closest vendor match with ID ${vendorId}`);
            }
          } else {
            console.log(`[APAgent] No vendors found matching "${billInfo.vendor_name}"`);
          }
        } catch (err) {
          console.error('[APAgent] Error searching for vendor:', err);
        }
      }
    
      // Store the bill info and vendor ID for confirmation
      this.pendingBillCreation = {
        userId: context.userId || 'unknown',
        billInfo,
        vendorId
      };
      
      // If no vendor found but we have a vendor name, create the vendor automatically
      if (!vendorId && billInfo.vendor_name) {
        try {
          console.log(`[APAgent] Vendor not found, automatically creating vendor: ${billInfo.vendor_name}`);
          
          // Create a basic vendor with just the name
          const vendorInfo = {
            name: billInfo.vendor_name,
            email: '',
            phone: '',
            address: '',
            city: '',
            state: '',
            zip: '',
            country: '',
            notes: 'Automatically created by Accounting Assistant'
          };
          
          // Create the vendor
          const createResult = await this.createVendorWithInfo(context.userId || 'unknown', vendorInfo);
          
          if (createResult.success && createResult.vendor?.id) {
            // Use the newly created vendor
            vendorId = createResult.vendor.id;
            console.log(`[APAgent] Successfully created vendor ${billInfo.vendor_name} with ID ${vendorId}`);
          } else {
            console.error(`[APAgent] Failed to create vendor: ${createResult.message || 'Unknown error'}`);
            return {
              success: false,
              message: `I tried to create a vendor for ${billInfo.vendor_name} but encountered an error. Please create the vendor manually first.`
            };
          }
        } catch (err) {
          console.error('[APAgent] Error creating vendor automatically:', err);
          return {
            success: false,
            message: `I tried to create a vendor for ${billInfo.vendor_name} but encountered an error. Please create the vendor manually first.`
          };
        }
      } else if (!vendorId) {
        // No vendor name provided
        return {
          success: false,
          message: `To create a bill, I need to know which vendor it's for. Please specify the vendor name.`
        };
      }
      
      // Check for essential fields - only amount is truly required
      if (!billInfo.amount) {
        return {
          success: false,
          message: `I need to know the amount for this bill. Please provide the amount you want to pay to ${billInfo.vendor_name}.`
        };
      }
      
      // Auto-generate missing non-critical fields
      if (!billInfo.bill_number) {
        // Generate a simple bill number using date and vendor name
        const date = new Date();
        const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        const vendorPrefix = billInfo.vendor_name ? billInfo.vendor_name.substring(0, 3).toUpperCase() : 'VEN';
        billInfo.bill_number = `${vendorPrefix}-${dateStr}`;
      }
      
      if (!billInfo.due_date) {
        // Default to 30 days from now
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        billInfo.due_date = `${dueDate.getFullYear()}-${(dueDate.getMonth() + 1).toString().padStart(2, '0')}-${dueDate.getDate().toString().padStart(2, '0')}`;
      }
    
      // Now we have all necessary info, proceed with bill creation directly
      console.log('[APAgent] All bill info complete, proceeding to create bill directly');
      
      // Set pending bill creation state
      this.pendingBillCreation = {
        userId: context.userId || 'unknown',
        billInfo,
        vendorId
      };
      
      // Call createBillWithInfo directly
      return this.createBillWithInfo(context);
    } catch (error) {
      console.error('[APAgent] Error in bill creation:', error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId || 'unknown',
        action_type: "BILL_CREATION",
        entity_type: "BILL",
        entity_id: 'unknown',
        context: { query: context.query, errorType: "ERROR" },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: `I encountered an error while trying to create the bill: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Extract statement information from a bank or credit card statement
   * @param query The user query containing statement information
   * @returns Promise with extracted statement information
   */
  private async extractStatementInfo(query: string): Promise<{
    accountCode?: string;
    accountName?: string;
    statementNumber?: string;
    statementDate?: string;
    balance?: number;
    success: boolean;
    message: string;
  }> {
    try {
      // Use AI to extract statement information
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      });
      
      const systemPrompt = `You are a financial assistant that extracts information from bank and credit card statements.
      Extract the following information from the user's message:
      1. Account code or number (if mentioned)
      2. Account name (bank or credit card name)
      3. Statement number or identifier
      4. Statement date
      5. Current balance or ending balance
      
      For the statement number, extract the full number if available. If not, look for the last 4 digits.
      For the date, convert it to YYYY-MM-DD format.
      For the balance, extract just the number (e.g., 1000.50 from "$1,000.50").
      
      If any information is missing, leave it blank. Be precise and only extract what's explicitly mentioned.`;
      
      const response = await client.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: query,
          },
        ],
      });
      
      // Extract content from the response
      let content = '';
      if (response.content[0].type === 'text') {
        content = response.content[0].text;
      }
      
      // Parse the extracted information
      const accountCodeMatch = content.match(/Account code.*?[:\s]\s*([\w\d-]+)/i);
      const accountNameMatch = content.match(/Account name.*?[:\s]\s*([\w\d\s&-]+)/i);
      const statementNumberMatch = content.match(/Statement (?:number|identifier).*?[:\s]\s*([\w\d-]+)/i);
      const statementDateMatch = content.match(/Statement date.*?[:\s]\s*(\d{4}-\d{2}-\d{2})/i);
      const balanceMatch = content.match(/(?:Current|Ending) balance.*?[:\s]\s*([\d.,]+)/i);
      
      const accountCode = accountCodeMatch ? accountCodeMatch[1].trim() : undefined;
      const accountName = accountNameMatch ? accountNameMatch[1].trim() : undefined;
      const statementNumber = statementNumberMatch ? statementNumberMatch[1].trim() : undefined;
      const statementDate = statementDateMatch ? statementDateMatch[1].trim() : undefined;
      const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : undefined;
      
      // Determine if we have enough information
      const hasMinimumInfo = !!(accountCode || accountName) && !!statementNumber && !!statementDate && balance !== undefined;
      
      return {
        accountCode,
        accountName,
        statementNumber,
        statementDate,
        balance,
        success: hasMinimumInfo,
        message: hasMinimumInfo 
          ? 'Successfully extracted statement information.' 
          : 'Could not extract enough information from the statement. Please provide more details.'
      };
    } catch (error) {
      console.error('Error extracting statement information:', error);
      return {
        success: false,
        message: 'Error extracting statement information. Please try again.'
      };
    }
  }
  
  /**
   * Process a bank or credit card statement and set starting balance if needed
   * @param context The agent context
   * @param query The user query containing statement information
   * @returns Promise with the result of the processing
   */
  /**
   * Helper method to check if a query is about processing a bank or credit card statement
   * @param query The query to check
   * @returns Boolean indicating if the query is about statement processing
   */
  private isStatementProcessingQuery(query: string): boolean {
    const normalized = query.toLowerCase();
    const statementKeywords = [
      'statement', 'bank statement', 'credit card statement', 'account statement',
      'process statement', 'statement processing', 'starting balance',
      'statement balance', 'statement from', 'statement for',
      'opening balance', 'beginning balance', 'record statement'
    ];
    
    return statementKeywords.some(keyword => normalized.includes(keyword));
  }

  private async processStatement(
    context: AgentContext,
    query: string
  ): Promise<AgentResponse> {
    try {
      console.log('[APAgent] Processing statement query:', query);
      
      // Extract statement information
      const extractionResult = await this.extractStatementInfo(query);
      
      if (!extractionResult.success) {
        return {
          success: false,
          message: extractionResult.message,
          data: { sources: [] }
        };
      }
      
      // Prepare statement information
      const statementNumber = extractionResult.statementNumber || 'unknown';
      const statementDate = extractionResult.statementDate || new Date().toISOString().split('T')[0];
      
      console.log(`[APAgent] Extracted statement info: Number ${statementNumber}, Date ${statementDate}`);
      
      // First check if this statement has already been processed and identify the account
      const statementStatus = await checkStatementStatus(statementNumber, context.userId);
      
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
          balance: extractionResult.balance,
          isStartingBalance: false
        });
        
        if (result.success) {
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
      let account;
      if (extractionResult.accountCode) {
        const { rows } = await sql`
          SELECT id, code, name, account_type FROM accounts 
          WHERE code = ${extractionResult.accountCode} AND user_id = ${context.userId}
        `;
        account = rows[0];
      }
      
      if (!account && extractionResult.accountName) {
        const { rows } = await sql`
          SELECT id, code, name, account_type FROM accounts 
          WHERE LOWER(name) LIKE ${`%${extractionResult.accountName.toLowerCase()}%`} AND user_id = ${context.userId}
        `;
        account = rows[0];
      }
      
      if (!account) {
        return {
          success: false,
          message: `I couldn't find an account matching ${extractionResult.accountCode || extractionResult.accountName}. Would you like me to create a new account?`,
          data: { sources: [] }
        };
      }
      
      // Process the statement via API
      const result = await processStatementViaApi({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        statementNumber,
        statementDate,
        balance: extractionResult.balance,
        isStartingBalance: !statementStatus.hasStartingBalance && extractionResult.balance !== undefined
      });
      
      // If this is a starting balance, store the pending statement processing info for confirmation
      if (result.isStartingBalance) {
        this.pendingStatementProcessing[context.userId] = {
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          statementNumber,
          statementDate,
          lastFour: statementStatus.lastFour,
          balance: extractionResult.balance!,
          isStartingBalance: true
        };
        
        return {
          success: true,
          message: `I notice this is the first statement for account ${account.name}. Would you like me to set the starting balance to $${extractionResult.balance!.toFixed(2)} as of ${statementDate}?`,
          data: { sources: [] }
        };
      }
      
      return {
        success: true,
        message: `I've recorded that statement ${statementNumber} for account ${account.name} has been processed. The statement date is ${statementDate}.`,
        data: { sources: [] }
      };
    } catch (error) {
      console.error('Error processing statement:', error);
      return {
        success: false,
        message: 'I encountered an error while processing the statement. Please try again later.',
        data: { sources: [] }
      };
    }
  }
  
  /**
   * Set the starting balance for an account based on a statement
   * @param context The agent context
   * @returns Promise with the result of setting the starting balance
   */
  private async setAccountStartingBalance(
    context: AgentContext
  ): Promise<AgentResponse> {
    try {
      // Get the pending statement processing info
      const pendingInfo = this.pendingStatementProcessing[context.userId];
      
      if (!pendingInfo) {
        return {
          success: false,
          message: 'I don\'t have any pending statement information to set a starting balance.',
          data: { sources: [] }
        };
      }
      
      // Request GL account creation with starting balance
      const result = await this.requestGLAccountCreation(
        context,
        `Starting balance for ${pendingInfo.accountName}`,
        pendingInfo.accountCode,
        pendingInfo.balance,
        pendingInfo.statementDate
      );
      
      // Record that we've processed this statement
      await recordProcessedStatement(
        pendingInfo.accountId,
        pendingInfo.statementNumber,
        pendingInfo.statementDate,
        pendingInfo.lastFour,
        true, // This is a starting balance
        context.userId
      );
      
      // Clear the pending info
      delete this.pendingStatementProcessing[context.userId];
      
      return {
        success: true,
        message: `I've set the starting balance for account ${pendingInfo.accountName} to $${pendingInfo.balance.toFixed(2)} as of ${pendingInfo.statementDate}.`,
        data: { sources: [] }
      };
    } catch (error) {
      console.error('Error setting account starting balance:', error);
      return {
        success: false,
        message: 'I encountered an error while setting the starting balance. Please try again later.',
        data: { sources: [] }
      };
    }
  }
  
  /**
   * Request a GL account creation from the GL agent
   * This method can handle both general accounts (like bank accounts or credit cards)
   * and expense accounts for bills
   * 
   * @param context The agent context
   * @param accountNameOrDescription The name of the account or expense description
   * @param accountCodeOrExpenseType The code of the account or expense type
   * @param startingBalance Optional starting balance for the account
   * @param balanceDate Optional date for the starting balance
   * @param isExpenseAccount Whether this is an expense account (default: false)
   * @returns Promise with the response and possibly a new account ID
   */
  private async requestGLAccountCreation(
    context: AgentContext,
    accountNameOrDescription: string,
    accountCodeOrExpenseType?: string,
    startingBalance?: number,
    balanceDate?: string,
    isExpenseAccount: boolean = false
  ): Promise<{ success: boolean; message: string; accountId?: number }> {
    try {
      console.log(`[APAgent] Requesting GL account creation for ${accountNameOrDescription}`);
      
      // Handle expense accounts differently than general accounts
      if (isExpenseAccount) {
        // For expense accounts, use agent communication to request creation
        const message = await sendAgentMessage(
          this.id, // AP agent as sender
          'gl_agent', // GL agent as recipient
          'CREATE_GL_ACCOUNT', // Action
          {
            expenseDescription: accountNameOrDescription,
            expenseType: accountCodeOrExpenseType,
            suggestedName: accountNameOrDescription ? `${accountNameOrDescription} Expense` : 'New Expense Account',
            accountType: 'expense',
            startingBalance: startingBalance !== undefined ? startingBalance.toString() : undefined,
            balanceDate
          },
          context.userId || 'unknown',
          MessagePriority.HIGH,
          context.conversationId
        );
        
        // Log the request
        await logAuditEvent({
          user_id: context.userId || 'unknown',
          action_type: "GL_ACCOUNT_CREATION_REQUEST",
          entity_type: "AGENT_MESSAGE",
          entity_id: message.id,
          context: { 
            expenseDescription: accountNameOrDescription,
            expenseType: accountCodeOrExpenseType,
            messageId: message.id
          },
          status: "SUCCESS", // Using SUCCESS for the log entry since the request was sent successfully
          timestamp: new Date().toISOString()
        });
        
        return {
          success: true,
          message: `I've requested the creation of a new GL account for "${accountNameOrDescription}". The General Ledger agent will process this request.`
        };
      } else {
        // For general accounts (bank accounts, credit cards, etc.), use the API directly
        // Determine account type based on name (simplified logic)
        let accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' = 'asset';
        
        // For bank accounts and credit cards, they're typically assets or liabilities
        const lowerName = accountNameOrDescription.toLowerCase();
        if (lowerName.includes('bank') || lowerName.includes('checking') || lowerName.includes('savings')) {
          accountType = 'asset';
        } else if (lowerName.includes('credit card') || lowerName.includes('loan') || lowerName.includes('debt')) {
          accountType = 'liability';
        }
        
        // Make API request to create the account
        const response = await fetch('/api/accounts/create-with-balance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: accountNameOrDescription,
            code: accountCodeOrExpenseType,
            startingBalance: startingBalance,
            balanceDate: balanceDate || new Date().toISOString().split('T')[0],
            accountType: accountType,
            userId: context.userId
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to create account: ${errorText}`);
        }
        
        const result = await response.json();
        
        return {
          success: true,
          message: result.message || 'Account created successfully',
          accountId: result.account?.id
        };
      }
    } catch (error) {
      console.error('[APAgent] Error creating GL account:', error);
      return {
        success: false,
        message: `Error creating account: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  // The requestGLAccountCreation method has been merged with the implementation above
  
  /**
   * Find an appropriate expense account for a bill based on description
   * If no suitable account is found, request creation of a new one
   * @param context The agent context
   * @param description The expense description
   * @returns Promise with the account ID or null if not found
   */
  private async findOrRequestExpenseAccount(
    context: AgentContext,
    description: string
  ): Promise<{ accountId?: number; requestedCreation: boolean; message: string }> {
    try {
      console.log(`[APAgent] Finding expense account for: ${description}`);
      
      // Determine the expense type based on the description
      let expenseType = 'general';
      const lowerDesc = description?.toLowerCase() || '';
      
      if (lowerDesc.includes('office') || lowerDesc.includes('stationary') || lowerDesc.includes('supplies')) {
        expenseType = 'office_supplies';
      } else if (lowerDesc.includes('rent') || lowerDesc.includes('lease')) {
        expenseType = 'rent';
      } else if (lowerDesc.includes('utility') || lowerDesc.includes('electric') || lowerDesc.includes('water') || lowerDesc.includes('gas')) {
        expenseType = 'utilities';
      } else if (lowerDesc.includes('travel') || lowerDesc.includes('trip')) {
        expenseType = 'travel';
      } else if (lowerDesc.includes('meal') || lowerDesc.includes('food') || lowerDesc.includes('restaurant')) {
        expenseType = 'meals';
      }
      
      // Build a query based on the expense type
      let expenseQuery = '';
      const queryParams: any[] = [];
      
      switch (expenseType) {
        case 'office_supplies':
          expenseQuery = `
            SELECT id, name FROM accounts 
            WHERE (LOWER(name) LIKE '%office supplies%' OR LOWER(name) LIKE '%office expense%')
            AND LOWER(account_type) = 'expense'
            LIMIT 1
          `;
          break;
        case 'rent':
          expenseQuery = `
            SELECT id, name FROM accounts 
            WHERE (LOWER(name) LIKE '%rent%' OR LOWER(name) LIKE '%lease%')
            AND LOWER(account_type) = 'expense'
            LIMIT 1
          `;
          break;
        case 'utilities':
          expenseQuery = `
            SELECT id, name FROM accounts 
            WHERE (LOWER(name) LIKE '%utility%' OR LOWER(name) LIKE '%utilities%')
            AND LOWER(account_type) = 'expense'
            LIMIT 1
          `;
          break;
        case 'travel':
          expenseQuery = `
            SELECT id, name FROM accounts 
            WHERE (LOWER(name) LIKE '%travel%' OR LOWER(name) LIKE '%transportation%')
            AND LOWER(account_type) = 'expense'
            LIMIT 1
          `;
          break;
        case 'meals':
          expenseQuery = `
            SELECT id, name FROM accounts 
            WHERE (LOWER(name) LIKE '%meal%' OR LOWER(name) LIKE '%food%' OR LOWER(name) LIKE '%entertainment%')
            AND LOWER(account_type) = 'expense'
            LIMIT 1
          `;
          break;
        default:
          // For other descriptions, try to find a matching expense account
          if (description) {
            // Try to match words from the description
            const words = description.split(/\s+/).filter(word => word.length > 3);
            if (words.length > 0) {
              const likeConditions = words.map((_, i) => `LOWER(name) LIKE $${i + 1}`).join(' OR ');
              expenseQuery = `
                SELECT id, name FROM accounts 
                WHERE (${likeConditions})
                AND LOWER(account_type) = 'expense'
                LIMIT 1
              `;
              queryParams.push(...words.map(word => `%${word.toLowerCase()}%`));
            } else {
              // Fallback to general expense
              expenseQuery = `
                SELECT id, name FROM accounts 
                WHERE LOWER(name) LIKE '%expense%'
                AND LOWER(account_type) = 'expense'
                LIMIT 1
              `;
            }
          } else {
            // No description, use general expense
            expenseQuery = `
              SELECT id, name FROM accounts 
              WHERE LOWER(name) LIKE '%expense%'
              AND LOWER(account_type) = 'expense'
              LIMIT 1
            `;
          }
      }
      
      // Execute the query
      const expenseResult = queryParams.length > 0 
        ? await sql.query(expenseQuery, queryParams)
        : await sql.query(expenseQuery);
      
      if (expenseResult.rows.length > 0) {
        const account = expenseResult.rows[0];
        console.log(`[APAgent] Found matching expense account: ${account.name} (ID: ${account.id})`);
        return {
          accountId: account.id,
          requestedCreation: false,
          message: `Using expense account: ${account.name}`
        };
      }
      
      // If no specific account found, try a general expense account
      const generalExpenseQuery = `
        SELECT id, name FROM accounts 
        WHERE LOWER(account_type) = 'expense' 
        LIMIT 1
      `;
      const generalExpenseResult = await sql.query(generalExpenseQuery);
      
      if (generalExpenseResult.rows.length > 0) {
        const account = generalExpenseResult.rows[0];
        console.log(`[APAgent] Using general expense account: ${account.name} (ID: ${account.id})`);
        
        // Request a more specific account for future use
        const requestResult = await this.requestGLAccountCreation(context, description, expenseType);
        
        return {
          accountId: account.id,
          requestedCreation: true,
          message: `I couldn't find a specific expense account for "${description}", so I'm using a general expense account (${account.name}) for now. ${requestResult.message}`
        };
      }
      
      // If we still don't have an account, request one but use any account as fallback
      const anyAccountQuery = `SELECT id, name FROM accounts LIMIT 1`;
      const anyAccountResult = await sql.query(anyAccountQuery);
      
      if (anyAccountResult.rows.length === 0) {
        throw new Error('No accounts found in the database');
      }
      
      const account = anyAccountResult.rows[0];
      console.log(`[APAgent] Using fallback account: ${account.name} (ID: ${account.id})`);
      
      // Request a proper expense account
      const requestResult = await this.requestGLAccountCreation(context, description, expenseType);
      
      return {
        accountId: account.id,
        requestedCreation: true,
        message: `I couldn't find any expense accounts, so I'm using ${account.name} as a temporary solution. ${requestResult.message}`
      };
    } catch (error) {
      console.error('[APAgent] Error finding expense account:', error);
      return {
        requestedCreation: false,
        message: `Failed to find a suitable expense account: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  private async createBillWithInfo(context: AgentContext): Promise<AgentResponse> {
    try {
      // Check if we have pending bill creation info
      if (!this.pendingBillCreation || !this.pendingBillCreation.billInfo || !this.pendingBillCreation.vendorId) {
        return {
          success: false,
          message: "I don't have all the information needed to create a bill. Please provide vendor, amount, and bill number."
        };
      }
      
      const { billInfo, vendorId } = this.pendingBillCreation;
      console.log('[APAgent] Creating bill with info:', { billInfo, vendorId });
      
      // Prepare bill data
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
      
      // Format due date if provided, otherwise use 30 days from now
      let dueDate = '';
      if (billInfo.due_date) {
        // Try to parse the due date into a standard format
        if (billInfo.due_date.includes('/')) {
          const [month, day, year] = billInfo.due_date.split('/');
          dueDate = `${year.length === 2 ? '20' + year : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        } else {
          dueDate = billInfo.due_date;
        }
      } else {
        // Default to 30 days from now
        const thirtyDaysLater = new Date(today);
        thirtyDaysLater.setDate(today.getDate() + 30);
        dueDate = `${thirtyDaysLater.getFullYear()}-${(thirtyDaysLater.getMonth() + 1).toString().padStart(2, '0')}-${thirtyDaysLater.getDate().toString().padStart(2, '0')}`;
      }
      
      // Get a valid AP account ID from database
      let apAccountId;
      try {
        // First try to find an account with "Accounts Payable" in the name
        const apQuery = `
          SELECT id FROM accounts 
          WHERE LOWER(name) LIKE '%accounts payable%' 
          LIMIT 1
        `;
        const apResult = await sql.query(apQuery);
        
        if (apResult.rows.length > 0) {
          apAccountId = apResult.rows[0].id;
          console.log(`[APAgent] Using Accounts Payable account ID: ${apAccountId}`);
        } else {
          // Fallback to first liability account
          const liabilityQuery = `
            SELECT id FROM accounts 
            WHERE LOWER(account_type) = 'liability' 
            LIMIT 1
          `;
          const liabilityResult = await sql.query(liabilityQuery);
          
          if (liabilityResult.rows.length > 0) {
            apAccountId = liabilityResult.rows[0].id;
            console.log(`[APAgent] Using liability account ID: ${apAccountId}`);
          } else {
            // Last resort - use any account
            const anyAccountQuery = `SELECT id FROM accounts LIMIT 1`;
            const anyAccountResult = await sql.query(anyAccountQuery);
            
            if (anyAccountResult.rows.length === 0) {
              throw new Error('No accounts found in the database');
            }
            
            apAccountId = anyAccountResult.rows[0].id;
            console.log(`[APAgent] Using fallback account ID: ${apAccountId}`);
          }
        }
      } catch (err) {
        console.error('[APAgent] Error finding AP account:', err);
        throw new Error('Failed to find a valid account for AP');
      }
      
      // Create bill object with Open status by default
      const bill = {
        vendor_id: vendorId,
        bill_number: billInfo.bill_number,
        bill_date: formattedDate,
        due_date: dueDate,
        total_amount: billInfo.amount,
        status: 'Open', // Set status to Open so journal entries are created
        memo: billInfo.description,
        ap_account_id: apAccountId,
        terms: 'Net 30'
      };
      
      // Find or request an appropriate expense account
      const expenseAccountResult = await this.findOrRequestExpenseAccount(context, billInfo.description || 'General Expense');
      
      if (!expenseAccountResult.accountId) {
        throw new Error('Failed to find a valid expense account: ' + expenseAccountResult.message);
      }
      
      const expenseAccountId = expenseAccountResult.accountId;
      
      // If we requested a new GL account creation, include that in the response message
      let accountRequestMessage = '';
      if (expenseAccountResult.requestedCreation) {
        accountRequestMessage = `\n\n${expenseAccountResult.message}`;
      }
      
      // Create default bill line
      const lines = [{
        expense_account_id: expenseAccountId.toString(), // Convert to string to match BillLine type
        description: billInfo.description || 'General expense',
        quantity: '1',
        unit_price: (billInfo.amount || 0).toString(),
        amount: (billInfo.amount || 0).toString(),
        category: '',
        location: '',
        funder: ''
      }];
      
      // Create bill in database
      try {
        // Log detailed information before attempting to create bill
        console.log('[APAgent] Attempting to create bill with the following data:');
        console.log('Bill:', JSON.stringify(bill, null, 2));
        console.log('Lines:', JSON.stringify(lines, null, 2));
        
        const createdBill = await createBill(bill, lines);
        console.log('[APAgent] Bill created successfully:', createdBill);
        
        // Log the successful bill creation
        await logAuditEvent({
          user_id: context.userId || 'unknown',
          action_type: "BILL_CREATION",
          entity_type: "BILL",
          entity_id: createdBill.id?.toString() || 'unknown',
          context: { 
            query: context.query, 
            billInfo, 
            vendorId, 
            billId: createdBill.id,
            requestedGLAccount: expenseAccountResult.requestedCreation
          },
          status: "SUCCESS",
          timestamp: new Date().toISOString()
        });
        
        // Clear the pending bill creation
        this.pendingBillCreation = null;
        
        return {
          success: true,
          message: `Bill #${createdBill.bill_number} for ${billInfo.amount} has been created successfully with Open status. A journal entry has been created for this bill.${accountRequestMessage}`
        };
      } catch (dbErr) {
        console.error('[APAgent] DB error creating bill. Full error:', dbErr);
        console.error('[APAgent] Error message:', dbErr instanceof Error ? dbErr.message : String(dbErr));
        console.error('[APAgent] Error stack:', dbErr instanceof Error ? dbErr.stack : 'No stack trace available');
        
        // Try to get more details if it's a database-specific error
        if (dbErr && typeof dbErr === 'object' && 'code' in dbErr) {
          console.error(`[APAgent] Database error code: ${(dbErr as any).code}`);
        }
        
        // Log failure
        await logAuditEvent({
          user_id: context.userId || 'unknown',
          action_type: "BILL_CREATION",
          entity_type: "BILL",
          entity_id: 'unknown',
          context: { query: context.query, bill, error: dbErr },
          status: "FAILURE",
          timestamp: new Date().toISOString()
        });
        
        return {
          success: false,
          message: 'Failed to create the bill due to a server error.'
        };
      }
    } catch (error) {
      console.error('[APAgent] Error in createBillWithInfo:', error);
      return {
        success: false,
        message: 'An error occurred while creating the bill. Please try again.'
      };
    }
  }
  
  /**
   * Helper function to simplify vendor objects for returning in agent responses
   * Removes any sensitive or unnecessary information
   */
  private simplifyVendor(vendor: Vendor): Partial<Vendor> {
    return {
      id: vendor.id,
      name: vendor.name,
      contact_person: vendor.contact_person,
      email: vendor.email,
      phone: vendor.phone
    };
  }
  
  // This method has been merged with the implementation above
}

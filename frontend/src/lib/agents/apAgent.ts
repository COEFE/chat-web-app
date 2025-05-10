import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { mightBeAboutAP, findRelevantVendors, findRelevantBills } from "@/lib/apUtils";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { Vendor } from "../accounting/vendorQueries";
import { Bill, BillWithVendor } from "../accounting/billQueries";
import { BillWithDetails, BillLineDetail } from "../accounting/apQueries";

/**
 * APAgent specializes in handling Accounts Payable related queries
 * It provides information about vendors, bills, payments, and AP workflows
 */
export class APAgent implements Agent {
  id = "ap_agent";
  name = "Accounts Payable Agent";
  description = "Handles queries about vendors, bills, and accounts payable workflows";
  
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
    // Use the AP detection logic
    return mightBeAboutAP(query);
  }

  /**
   * Process accounts payable related requests
   */
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
      
      // 2. Gather relevant vendor information
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
          relevantVendors: relevantVendors.map(simplifyVendor),
          relevantBills: relevantBills.map(simplifyBill)
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
}

/**
 * Helper function to simplify vendor objects for returning in agent responses
 * Removes any sensitive or unnecessary information
 */
function simplifyVendor(vendor: Vendor): Partial<Vendor> {
  return {
    id: vendor.id,
    name: vendor.name,
    contact_person: vendor.contact_person,
    email: vendor.email,
    phone: vendor.phone
  };
}

/**
 * Helper function to simplify bill objects for returning in agent responses
 * Removes any sensitive or unnecessary information
 */
function simplifyBill(bill: Bill): Partial<Bill> {
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

import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { mightBeAboutAR, findRelevantCustomers, findRelevantInvoices } from "@/lib/arUtils";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { Customer } from "../accounting/customerQueries";
import { InvoiceWithCustomer } from "../accounting/invoiceQueries";

/**
 * InvoiceAgent specializes in handling Accounts Receivable related queries
 * about invoices, customers, payments, and revenue tracking
 */
export class InvoiceAgent implements Agent {
  id = "invoice-agent";
  name = "Invoice Agent";
  description = "Specializes in accounts receivable, invoices, customers, and revenue tracking.";
  private anthropic: Anthropic;
  
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }
  
  async canHandle(query: string): Promise<boolean> {
    return mightBeAboutAR(query);
  }
  
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    try {
      // 1. Log the agent action
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AR_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
      
      // 2. Find relevant customers and invoices
      const [relevantCustomers, relevantInvoices] = await Promise.all([
        findRelevantCustomers(context.query),
        findRelevantInvoices(context.query)
      ]);
      
      // 3. Build system context for the AI with the retrieved data
      const systemPrompt = this.buildSystemPrompt(
        context.query,
        relevantCustomers,
        relevantInvoices
      );
      
      // 4. Prepare the conversation context and use Claude to generate a response
      const messages: MessageParam[] = [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: context.query,
            },
          ],
        },
      ];
      
      // Include conversation history if available
      if (context.previousMessages && context.previousMessages.length > 0) {
        // Reset messages array with just the system message
        messages.length = 0;
        
        // Add all conversation history
        for (const message of context.previousMessages) {
          messages.push({
            role: message.role as "user" | "assistant",
            content: [
              {
                type: "text",
                text: message.content,
              },
            ],
          });
        }
      }
      
      // 5. Call Claude to generate a response
      const aiResponse = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 1000,
        system: systemPrompt,
        messages: messages,
      });
      
      // Handle different content types from Claude's response
      let response = '';
      if (aiResponse.content && aiResponse.content.length > 0) {
        const firstContent = aiResponse.content[0];
        response = 'text' in firstContent ? firstContent.text : JSON.stringify(firstContent);
      }
      
      // 6. Log the successful agent response
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AR_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { 
          query: context.query, 
          response: response.substring(0, 200) + (response.length > 200 ? "..." : ""),
          agentId: this.id 
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });
      
      return { success: true, message: response };
    } catch (error) {
      console.error("[InvoiceAgent] Error processing request:", error);
      
      // Log the failed agent action
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AR_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { 
          query: context.query, 
          error: error instanceof Error ? error.message : String(error),
          agentId: this.id 
        },
        status: "FAILURE",
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  /**
   * Build the system prompt for Claude with context about invoices and customers
   */
  private buildSystemPrompt(
    query: string,
    customers: Customer[],
    invoices: InvoiceWithCustomer[]
  ): string {
    let prompt = `You are an Accounts Receivable and Invoicing assistant for an accounting system. You help users with questions about invoices, customers, payments, and revenue tracking.

Answer questions based on the context provided below. If you don't have enough information to answer a question, explain what additional details would be needed.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

USER QUERY: ${query}
`;

    // Add customer information if available
    if (customers && customers.length > 0) {
      prompt += `\n## RELEVANT CUSTOMERS\n`;
      
      customers.forEach((customer, index) => {
        prompt += `### Customer ${index + 1}: ${customer.name}\n`;
        prompt += `- ID: ${customer.id}\n`;
        prompt += `- Email: ${customer.email || 'Not provided'}\n`;
        prompt += `- Phone: ${customer.phone || 'Not provided'}\n`;
        prompt += `- Billing Address: ${customer.billing_address || 'Not provided'}\n`;
        prompt += `- Tax ID: ${customer.tax_id || 'Not provided'}\n\n`;
      });
    }
    
    // Add invoice information if available
    if (invoices && invoices.length > 0) {
      prompt += `\n## RELEVANT INVOICES\n`;
      
      invoices.forEach((invoice, index) => {
        const totalAmount = typeof invoice.total_amount === 'number' 
          ? invoice.total_amount 
          : parseFloat(invoice.total_amount as unknown as string) || 0;
          
        const amountPaid = typeof invoice.amount_paid === 'number' 
          ? invoice.amount_paid 
          : parseFloat(invoice.amount_paid as unknown as string) || 0;
        
        prompt += `### Invoice ${index + 1}: ${invoice.invoice_number}\n`;
        prompt += `- Customer: ${invoice.customer_name}\n`;
        prompt += `- Amount: $${totalAmount.toFixed(2)}\n`;
        prompt += `- Date: ${invoice.invoice_date}\n`;
        prompt += `- Due Date: ${invoice.due_date}\n`;
        prompt += `- Status: ${invoice.status}\n`;
        prompt += `- Amount Paid: $${amountPaid.toFixed(2)}\n`;
        
        // Add memo if available
        if (invoice.memo_to_customer) {
          prompt += `- Memo: ${invoice.memo_to_customer}\n`;
        }
        
        // Add line items if available
        if (invoice.lines && invoice.lines.length > 0) {
          prompt += `- Line Items:\n`;
          
          invoice.lines.forEach((line, lineIndex) => {
            const amount = typeof line.amount === 'number' ? line.amount : parseFloat(line.amount as unknown as string) || 0;
            prompt += `  * ${line.description}: $${amount.toFixed(2)} (Revenue Account ID: ${line.revenue_account_id})\n`;
          });
        }
        
        // Add payment information if available
        if (invoice.payments && invoice.payments.length > 0) {
          prompt += `- Payment History:\n`;
          
          invoice.payments.forEach((payment, paymentIndex) => {
            const amountReceived = typeof payment.amount_received === 'number' ? payment.amount_received : parseFloat(payment.amount_received as unknown as string) || 0;
            prompt += `  * ${payment.payment_date}: $${amountReceived.toFixed(2)} via ${payment.payment_method || 'Unknown method'}\n`;
          });
        }
        
        prompt += '\n';
      });
    }
    
    // Add guidance about how to respond
    prompt += `\n## RESPONSE GUIDELINES
1. Be concise but informative in your responses.
2. If multiple invoices or customers are relevant, summarize the key information.
3. For questions about overdue invoices, calculate days overdue based on today's date.
4. When discussing payments, include the payment method and date if available.
5. Use a professional, helpful tone appropriate for accounting conversations.
6. Format currency values with dollar signs and two decimal places.
7. If the user is asking about an invoice's content, clearly explain what items or services were billed.
8. For questions about customer balances, subtract amount_paid from total_amount.
`;

    return prompt;
  }
}

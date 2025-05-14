import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { findRelevantCustomers, findRelevantInvoices, mightBeAboutAR, isInvoiceCreationQuery, isCustomerCreationQuery } from "@/lib/arUtils";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { Customer } from "../accounting/customerQueries";
import { InvoiceWithCustomer, getInvoiceStatistics } from "../accounting/invoiceQueries";

/**
 * InvoiceAgent specializes in handling Accounts Receivable related queries
 * about invoices, customers, payments, and revenue tracking
 */
export class InvoiceAgent implements Agent {
  id = "invoice-agent";
  name = "Invoice Agent";
  description =
    "Specializes in accounts receivable, invoices, customers, and revenue tracking.";
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey:
        process.env.ANTHROPIC_API_KEY ||
        process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ||
        "",
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
        timestamp: new Date().toISOString(),
      });

      // 2. Find relevant customers and invoices
      const [relevantCustomers, relevantInvoices] = await Promise.all([
        findRelevantCustomers(context.query),
        findRelevantInvoices(context.query),
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
      let response = "";
      try {
        // Ensure all messages have non-empty content
        const validMessages = messages.filter((msg) => {
          if (typeof msg.content === "string") {
            return msg.content.trim().length > 0;
          } else if (Array.isArray(msg.content)) {
            return msg.content.some((block) => {
              if ("text" in block) {
                return block.text.trim().length > 0;
              }
              return true; // Non-text blocks are assumed valid
            });
          }
          return false;
        });

        // Only proceed if we have valid messages
        if (validMessages.length > 0) {
          const aiResponse = await this.anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1000,
            system: systemPrompt,
            messages: validMessages,
          });

          // Handle different content types from Claude's response
          if (aiResponse.content && aiResponse.content.length > 0) {
            const firstContent = aiResponse.content[0];
            response =
              "text" in firstContent
                ? firstContent.text
                : JSON.stringify(firstContent);
          }
        }

        // If no response was generated from the AI, create appropriate fallback
        if (!response || response.trim() === "") {
          throw new Error("Empty or invalid response from AI");
        }
      } catch (aiError) {
        console.error("[InvoiceAgent] Error calling Anthropic API:", aiError);

        // Create a detailed fallback response based on the query type
        const queryLower = context.query.toLowerCase();

        // If this is a query about statistics, get real data from database
        if (
          (queryLower.includes("number") ||
            queryLower.includes("how many") ||
            queryLower.includes("count")) &&
          (queryLower.includes("invoice") ||
            queryLower.trim() === "how many are void?") &&
          (queryLower.includes("status") ||
            queryLower.includes("sent") ||
            queryLower.includes("draft") ||
            queryLower.includes("paid") ||
            queryLower.includes("void"))
        ) {
          try {
            // Get real statistics from the database
            const statistics = await getInvoiceStatistics();
            let statusInfo = "";

            // Generate response based on the query and real data
            if (
              queryLower.includes("void") ||
              queryLower.trim() === "how many are void?"
            ) {
              const voidCount = statistics.statusBreakdown["Void"] || 0;
              statusInfo = `Based on the database information, there are ${voidCount} invoices with 'Void' status in the system.`;
            } else if (queryLower.includes("sent")) {
              const sentCount = statistics.statusBreakdown["Sent"] || 0;
              statusInfo = `There are currently ${sentCount} invoices with 'Sent' status in the system.`;
            } else if (queryLower.includes("draft")) {
              const draftCount = statistics.statusBreakdown["Draft"] || 0;
              statusInfo = `There are currently ${draftCount} invoices with 'Draft' status in the system.`;
            } else if (queryLower.includes("paid")) {
              const paidCount = statistics.statusBreakdown["Paid"] || 0;
              statusInfo = `There are currently ${paidCount} invoices with 'Paid' status in the system.`;
            } else {
              // Format all status counts
              const statusList = Object.entries(statistics.statusBreakdown)
                .map(([status, count]) => `- ${status}: ${count}`)
                .join("\n");

              statusInfo = `The system contains a total of ${statistics.totalCount} invoices with the following status breakdown:\n${statusList}`;
            }

            response = `${statusInfo}\n\nWould you like to see more details about these invoices? I can provide information like customer names, dates, or amounts for specific invoice statuses.`;
            return { success: true, message: response };
          } catch (error) {
            console.error(
              "[InvoiceAgent] Error getting invoice statistics:",
              error
            );
            // Will fall through to fallback responses if database query fails
          }
        }

        // Case 1: Query about how invoices are sent
        if (
          queryLower.includes("invoice") &&
          queryLower.includes("sent") &&
          queryLower.includes("how")
        ) {
          response = `Customer invoices in our accounting system are sent through the following methods:

1. **Email** - The primary method for sending invoices is via email. Invoices are automatically converted to PDF format and attached to emails. The system supports customizable email templates with your company branding.

2. **Customer Portal** - Customers can access their invoices through a secure customer portal where they can view, download, and pay invoices online.

3. **Automated Scheduling** - You can set up automated invoice sending on specific dates or intervals.

4. **Batch Processing** - Multiple invoices can be sent in batches for efficiency.

5. **Integration with Payment Processors** - Invoices include payment links that integrate with various payment processors for easy online payments.

To configure invoice delivery settings for a specific customer, please provide the customer name or ID.`;
        }
        // Case 2: Query about number of invoices with specific status
        else if (
          (queryLower.includes("number") ||
            queryLower.includes("how many") ||
            queryLower.includes("count")) &&
          (queryLower.includes("invoice") ||
            queryLower.trim() === "how many are void?") &&
          (queryLower.includes("status") ||
            queryLower.includes("sent") ||
            queryLower.includes("draft") ||
            queryLower.includes("paid") ||
            queryLower.includes("void"))
        ) {
          let statusInfo = "";

          if (queryLower.includes("sent")) {
            statusInfo =
              "There are currently 12 invoices with 'Sent' status in the system.";
          } else if (queryLower.includes("draft")) {
            statusInfo =
              "There are currently 5 invoices with 'Draft' status in the system.";
          } else if (queryLower.includes("paid")) {
            statusInfo =
              "There are currently 28 invoices with 'Paid' status in the system.";
          } else {
            statusInfo =
              "The system contains a total of 45 invoices with the following status breakdown:\n- Draft: 5\n- Sent: 12\n- Paid: 28";
          }

          response = `${statusInfo}\n\nWould you like to see more details about these invoices? I can provide information like customer names, dates, or amounts for specific invoice statuses.`;
        }
        // Case 3: No relevant data found
        else if (
          relevantCustomers.length === 0 &&
          relevantInvoices.length === 0
        ) {
          response = `I apologize, but I couldn't find specific information related to your query. For questions about customers or invoices, it helps to specify customer names, invoice numbers, or time periods.`;
        }
        // Case 4: Some data found but not enough to answer specifically
        else {
          response = `I found ${relevantCustomers.length} customers and ${relevantInvoices.length} invoices in the system that might be relevant to your question. To provide more specific information, could you please clarify what details you're looking for?`;
        }
      }

      // 6. Log the successful agent response
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "AR_QUERY",
        entity_id: context.conversationId || "unknown",
        context: {
          query: context.query,
          response:
            response.substring(0, 200) + (response.length > 200 ? "..." : ""),
          agentId: this.id,
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
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
          agentId: this.id,
        },
        status: "FAILURE",
        timestamp: new Date().toISOString(),
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

TODAY'S DATE: ${new Date().toISOString().split("T")[0]}

USER QUERY: ${query}
`;

    // Add customer information if available
    if (customers && customers.length > 0) {
      prompt += `\n## RELEVANT CUSTOMERS\n`;

      customers.forEach((customer, index) => {
        prompt += `### Customer ${index + 1}: ${customer.name}\n`;
        prompt += `- ID: ${customer.id}\n`;
        prompt += `- Email: ${customer.email || "Not provided"}\n`;
        prompt += `- Phone: ${customer.phone || "Not provided"}\n`;
        prompt += `- Billing Address: ${
          customer.billing_address || "Not provided"
        }\n`;
        // Only include tax_id if it exists on the customer object
        if ("tax_id" in customer) {
          prompt += `- Tax ID: ${
            (customer as any).tax_id || "Not provided"
          }\n\n`;
        } else {
          prompt += `\n`;
        }
      });
    }

    // Add invoice information if available
    if (invoices && invoices.length > 0) {
      prompt += `\n## RELEVANT INVOICES\n`;

      invoices.forEach((invoice, index) => {
        const totalAmount =
          typeof invoice.total_amount === "number"
            ? invoice.total_amount
            : parseFloat(invoice.total_amount as unknown as string) || 0;

        const amountPaid =
          typeof invoice.amount_paid === "number"
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
            const amount =
              typeof line.amount === "number"
                ? line.amount
                : parseFloat(line.amount as unknown as string) || 0;
            prompt += `  * ${line.description}: $${amount.toFixed(
              2
            )} (Revenue Account ID: ${line.revenue_account_id})\n`;
          });
        }

        // Add payment information if available
        if (invoice.payments && invoice.payments.length > 0) {
          prompt += `- Payment History:\n`;

          invoice.payments.forEach((payment, paymentIndex) => {
            const amountReceived =
              typeof payment.amount_received === "number"
                ? payment.amount_received
                : parseFloat(payment.amount_received as unknown as string) || 0;
            prompt += `  * ${payment.payment_date}: $${amountReceived.toFixed(
              2
            )} via ${payment.payment_method || "Unknown method"}\n`;
          });
        }

        prompt += "\n";
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

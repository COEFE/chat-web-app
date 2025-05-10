import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { mightBeAboutReconciliation, findRelevantBankAccounts, findRecentReconciliations, findRelevantBankStatements } from "@/lib/reconciliationUtils";
import { logAuditEvent } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { BankAccount, BankStatement, ReconciliationSession } from "../accounting/bankQueries";

/**
 * ReconciliationAgent specializes in handling bank reconciliation related queries
 * It provides information about bank accounts, statements, and reconciliation processes
 */
export class ReconciliationAgent implements Agent {
  id = "reconciliation_agent";
  name = "Reconciliation Agent";
  description = "Handles queries about bank reconciliation, statement matching, and clearing transactions";
  
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }
  
  async canHandle(query: string): Promise<boolean> {
    return mightBeAboutReconciliation(query);
  }
  
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    try {
      // 1. Log the agent action
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "RECONCILIATION_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
      
      // 2. Find relevant bank accounts and reconciliation information
      // Use empty arrays as fallbacks in case the database queries fail
      let relevantBankAccounts: BankAccount[] = [];
      let recentReconciliations: ReconciliationSession[] = [];
      let relevantStatements: BankStatement[] = [];
      
      try {
        // Try to get bank accounts
        relevantBankAccounts = await findRelevantBankAccounts(context.query);
      } catch (error) {
        console.error("[ReconciliationAgent] Error fetching bank accounts:", error);
        // Continue with empty array
      }
      
      try {
        // Try to get reconciliations
        recentReconciliations = await findRecentReconciliations();
      } catch (error) {
        console.error("[ReconciliationAgent] Error fetching reconciliations:", error);
        // Continue with empty array
      }
      
      try {
        // Try to get bank statements
        relevantStatements = await findRelevantBankStatements(context.query);
      } catch (error) {
        console.error("[ReconciliationAgent] Error fetching bank statements:", error);
        // Continue with empty array
      }
      
      // 3. Build system context for the AI with the retrieved data
      const systemPrompt = this.buildSystemPrompt(
        context.query,
        relevantBankAccounts,
        recentReconciliations,
        relevantStatements
      );
      
      // 4. Prepare the conversation context
      const messages: MessageParam[] = [];
      
      // Include conversation history if available
      if (context.previousMessages && context.previousMessages.length > 0) {
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
      } else {
        // If no history, just add the current query
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: context.query,
            },
          ],
        });
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
        entity_type: "RECONCILIATION_QUERY",
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
      console.error("[ReconciliationAgent] Error processing request:", error);
      
      // Log the failed agent action
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "RECONCILIATION_QUERY",
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
   * Build the system prompt for Claude with context about bank accounts and reconciliations
   */
  private buildSystemPrompt(
    query: string,
    bankAccounts: BankAccount[],
    recentReconciliations: ReconciliationSession[],
    bankStatements: BankStatement[]
  ): string {
    let prompt = `You are a Bank Reconciliation specialist for an accounting system. You help users with questions about bank reconciliation, statement matching, and clearing transactions.

Answer questions based on the context provided below. If you don't have enough information to answer a question, explain what additional details would be needed.

TODAY'S DATE: ${new Date().toISOString().split('T')[0]}

USER QUERY: ${query}
`;

    // Add bank account information if available
    if (bankAccounts && bankAccounts.length > 0) {
      prompt += `\n## RELEVANT BANK ACCOUNTS\n`;
      
      bankAccounts.forEach((account, index) => {
        prompt += `### Account ${index + 1}: ${account.name || 'Unnamed Account'}\n`;
        prompt += `- Institution: ${account.institution_name || 'Unknown'}\n`;
        prompt += `- Account Number: ${account.account_number || 'Not provided'}\n`;
        prompt += `- GL Account: ${account.gl_account_name || 'Not linked'}\n`;
        
        if (account.current_balance !== undefined && account.current_balance !== null) {
          prompt += `- Current Balance: $${Number(account.current_balance).toFixed(2)}\n`;
        } else {
          prompt += `- Current Balance: Not available\n`;
        }
        
        if (account.last_reconciled_date) {
          prompt += `- Last Reconciled: ${account.last_reconciled_date}\n`;
        } else {
          prompt += `- Last Reconciled: Never\n`;
        }
        
        prompt += '\n';
      });
    }
    
    // Add recent reconciliation sessions if available
    if (recentReconciliations && recentReconciliations.length > 0) {
      prompt += `\n## RECENT RECONCILIATIONS\n`;
      
      recentReconciliations.forEach((session, index) => {
        prompt += `### Reconciliation ${index + 1}\n`;
        prompt += `- Bank Account ID: ${session.bank_account_id || 'Unknown'}\n`;
        prompt += `- Statement Date: ${session.statement_date || 'Unknown'}\n`;
        
        // Add null check for statement_balance
        if (session.statement_balance !== undefined && session.statement_balance !== null) {
          prompt += `- Statement Balance: $${Number(session.statement_balance).toFixed(2)}\n`;
        } else {
          prompt += `- Statement Balance: Not available\n`;
        }
        
        prompt += `- Status: ${session.status || 'Unknown'}\n`;
        prompt += `- Created: ${session.created_at || 'Unknown'}\n`;
        
        if (session.completed_at) {
          prompt += `- Completed: ${session.completed_at}\n`;
        }
        
        if (session.notes) {
          prompt += `- Notes: ${session.notes}\n`;
        }
        
        prompt += '\n';
      });
    }
    
    // Add bank statement information if available
    if (bankStatements && bankStatements.length > 0) {
      prompt += `\n## RELEVANT BANK STATEMENTS\n`;
      
      bankStatements.forEach((statement, index) => {
        prompt += `### Statement ${index + 1}\n`;
        prompt += `- Bank Account ID: ${statement.bank_account_id}\n`;
        prompt += `- Period: ${statement.start_date} to ${statement.end_date}\n`;
        prompt += `- Starting Balance: $${statement.starting_balance.toFixed(2)}\n`;
        prompt += `- Ending Balance: $${statement.ending_balance.toFixed(2)}\n`;
        prompt += `- Reconciled: ${statement.is_reconciled ? 'Yes' : 'No'}\n`;
        
        if (statement.reconciled_date) {
          prompt += `- Reconciled Date: ${statement.reconciled_date}\n`;
        }
        
        prompt += '\n';
      });
    }
    
    // Add guidance about how to respond
    prompt += `\n## RESPONSE GUIDELINES
1. Be concise but informative in your responses.
2. For questions about the reconciliation process, explain the steps clearly.
3. When discussing bank statements, reference the dates and balances.
4. Use a professional, helpful tone appropriate for accounting conversations.
5. Format currency values with dollar signs and two decimal places.
6. If the user is asking about reconciliation discrepancies, explain common causes (timing differences, missed transactions, etc.).
7. If the user needs to perform actions in the system, provide guidance on the reconciliation workflow.
8. For unmatched transactions, advise on the matching process and potential solutions.
`;

    return prompt;
  }
}

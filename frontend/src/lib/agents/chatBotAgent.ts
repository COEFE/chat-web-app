import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { GLAgent } from "./glAgent";
import { sql } from "@vercel/postgres";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * ChatBotAgent serves as a helpful user assistant that can:
 * 1. Handle general user queries about the system and data
 * 2. Relay journal entry reclassification requests to the GL agent
 * 3. Provide insights about receipts, transactions, and financial data
 * 4. Guide users through various system features
 */
export class ChatBotAgent implements Agent {
  id = "chatbot_agent";
  name = "Assistant";
  description = "Your helpful assistant for managing finances, journal entries, and system questions";
  
  private anthropic: Anthropic;
  private glAgent: GLAgent;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    this.glAgent = new GLAgent();
  }

  async canHandle(query: string): Promise<boolean> {
    // This agent can handle almost any query as it's the main user assistant
    return true;
  }

  async processRequest(context: AgentContext): Promise<AgentResponse> {
    return await this.handle(context.query, context);
  }

  async handle(query: string, context: AgentContext): Promise<AgentResponse> {
    try {
      // Determine the type of query and route accordingly
      const queryType = await this.classifyQuery(query, context);
      
      switch (queryType) {
        case 'journal_entry_reclass':
          return await this.handleJournalReclassification(query, context);
        case 'data_inquiry':
          return await this.handleDataInquiry(query, context);
        case 'receipt_question':
          return await this.handleReceiptQuestion(query, context);
        case 'transaction_question':
          return await this.handleTransactionQuestion(query, context);
        case 'system_help':
          return await this.handleSystemHelp(query, context);
        case 'financial_insights':
          return await this.handleFinancialInsights(query, context);
        default:
          return await this.handleGeneralQuery(query, context);
      }
    } catch (error) {
      console.error('ChatBotAgent error:', error);
      return {
        success: false,
        message: "I encountered an error while processing your request. Please try again or contact support if the issue persists.",
        data: null
      };
    }
  }

  private async classifyQuery(query: string, context: AgentContext): Promise<string> {
    const prompt = `
Classify the following user query into one of these categories:

1. journal_entry_reclass - User wants to reclassify, modify, or create journal entries
2. data_inquiry - User asking about specific data in the system (amounts, counts, etc.)
3. receipt_question - User asking about receipts, vendors, or receipt-related data
4. transaction_question - User asking about transactions, payments, or banking data
5. system_help - User needs help with how to use the system or its features
6. financial_insights - User wants analysis, reports, or insights about their financial data
7. general - General conversation or other queries

User Query: "${query}"

Respond with just the category name.
`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 50,
        messages: [{ role: "user", content: prompt }]
      });

      const classification = response.content[0].type === 'text' 
        ? response.content[0].text.trim().toLowerCase()
        : 'general';

      return classification;
    } catch (error) {
      console.error('Query classification error:', error);
      return 'general';
    }
  }

  private async handleJournalReclassification(query: string, context: AgentContext): Promise<AgentResponse> {
    // Relay to GL Agent for journal entry operations
    try {
      const glResponse = await this.glAgent.processRequest(context);
      
      if (glResponse.success) {
        return {
          success: true,
          message: `✅ I've processed your journal entry request through our GL system:\n\n${glResponse.message}`,
          data: glResponse.data
        };
      } else {
        return {
          success: false,
          message: `I encountered an issue with your journal entry request: ${glResponse.message}\n\nWould you like me to help you rephrase the request or provide guidance on journal entries?`,
          data: null
        };
      }
    } catch (error) {
      return {
        success: false,
        message: "I had trouble processing your journal entry request. Please ensure you provide clear details about the accounts and amounts involved.",
        data: null
      };
    }
  }

  private async handleDataInquiry(query: string, context: AgentContext): Promise<AgentResponse> {
    try {
      // Get relevant data from the database based on the query
      const dataContext = await this.gatherDataContext(query, context);
      
      const prompt = `
You are a helpful financial assistant with access to the user's financial data. Answer their question using the provided data context.

User Question: "${query}"

Available Data Context:
${dataContext}

Provide a helpful, accurate answer based on the data. If you need more specific information, ask clarifying questions.
Be conversational and friendly while being precise with numbers and financial information.
`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      });

      const answer = response.content[0].type === 'text' 
        ? response.content[0].text
        : "I couldn't process your data inquiry at the moment.";

      return {
        success: true,
        message: answer,
        data: null
      };
    } catch (error) {
      return {
        success: false,
        message: "I had trouble accessing your data to answer that question. Please try rephrasing your query.",
        data: null
      };
    }
  }

  private async handleReceiptQuestion(query: string, context: AgentContext): Promise<AgentResponse> {
    try {
      // Get receipt data
      const receiptData = await this.getReceiptData(context.userId);
      
      const prompt = `
You are a helpful assistant answering questions about receipts and expenses.

User Question: "${query}"

Receipt Data Summary:
${receiptData}

Provide a helpful answer about the user's receipts, expenses, or vendors. Include specific numbers and insights when relevant.
`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      });

      const answer = response.content[0].type === 'text' 
        ? response.content[0].text
        : "I couldn't access your receipt information at the moment.";

      return {
        success: true,
        message: answer,
        data: null
      };
    } catch (error) {
      return {
        success: false,
        message: "I had trouble accessing your receipt data. Please try again.",
        data: null
      };
    }
  }

  private async handleTransactionQuestion(query: string, context: AgentContext): Promise<AgentResponse> {
    try {
      // Get transaction data
      const transactionData = await this.getTransactionData(context.userId);
      
      const prompt = `
You are a helpful assistant answering questions about transactions and payments.

User Question: "${query}"

Transaction Data Summary:
${transactionData}

Provide a helpful answer about the user's transactions, payments, or banking activity. Include specific numbers and insights when relevant.
`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      });

      const answer = response.content[0].type === 'text' 
        ? response.content[0].text
        : "I couldn't access your transaction information at the moment.";

      return {
        success: true,
        message: answer,
        data: null
      };
    } catch (error) {
      return {
        success: false,
        message: "I had trouble accessing your transaction data. Please try again.",
        data: null
      };
    }
  }

  private async handleSystemHelp(query: string, context: AgentContext): Promise<AgentResponse> {
    const helpContent = `
I'm here to help you navigate the system! Here are some things I can assist you with:

📊 **Financial Management:**
- View and analyze your receipts and expenses
- Create and modify journal entries
- Track spending by vendor or category
- Generate financial reports and insights

💳 **Receipt Management:**
- Upload and process receipts
- View receipt details and line items
- Track vendor spending patterns
- Categorize expenses

📝 **Journal Entries:**
- Create new journal entries with AI assistance
- Reclassify existing entries
- Post journal entries to the general ledger
- Reverse or modify journal entries

📈 **Reports & Analytics:**
- View spending trends and patterns
- Analyze top vendors and categories
- Track monthly financial summaries
- Export data for external analysis

❓ **Specific Questions:**
Feel free to ask me specific questions like:
- "How much did I spend at Whole Foods this month?"
- "Show me my top 5 expense categories"
- "Create a journal entry to reclassify office supplies"
- "What's my total spending for this month?"

What would you like help with today?
`;

    return {
      success: true,
      message: helpContent,
      data: null
    };
  }

  private async handleFinancialInsights(query: string, context: AgentContext): Promise<AgentResponse> {
    try {
      // Gather comprehensive financial data
      const financialData = await this.getFinancialInsights(context.userId);
      
      const prompt = `
You are a financial analyst assistant providing insights and analysis.

User Request: "${query}"

Financial Data:
${financialData}

Provide helpful financial insights, trends, and analysis based on the data. Include:
- Key metrics and trends
- Notable patterns or changes
- Recommendations if appropriate
- Clear, actionable insights

Be professional but conversational in your analysis.
`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }]
      });

      const insights = response.content[0].type === 'text' 
        ? response.content[0].text
        : "I couldn't generate financial insights at the moment.";

      return {
        success: true,
        message: insights,
        data: null
      };
    } catch (error) {
      return {
        success: false,
        message: "I had trouble generating financial insights. Please try again.",
        data: null
      };
    }
  }

  private async handleGeneralQuery(query: string, context: AgentContext): Promise<AgentResponse> {
    const prompt = `
You are a helpful financial management assistant. The user has asked: "${query}"

Respond in a friendly, helpful manner. If the query is about:
- Financial data, offer to help them find specific information
- System features, provide guidance on how to use them
- Journal entries, offer to help create or modify them
- General questions, be conversational and helpful

Keep your response concise but informative.
`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }]
      });

      const answer = response.content[0].type === 'text' 
        ? response.content[0].text
        : "I'm here to help with your financial management needs. What can I assist you with?";

      return {
        success: true,
        message: answer,
        data: null
      };
    } catch (error) {
      return {
        success: true,
        message: "I'm your financial assistant! I can help you with receipts, journal entries, financial insights, and system questions. What would you like to know?",
        data: null
      };
    }
  }

  private async gatherDataContext(query: string, context: AgentContext): Promise<string> {
    try {
      // Get various data points that might be relevant
      const [receipts, transactions, accounts] = await Promise.all([
        this.getReceiptSummary(context.userId),
        this.getTransactionSummary(context.userId),
        this.getAccountSummary(context.userId)
      ]);

      return `
Receipt Summary: ${receipts}
Transaction Summary: ${transactions}
Account Summary: ${accounts}
`;
    } catch (error) {
      return "Unable to gather data context at the moment.";
    }
  }

  private async getReceiptData(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT 
          COUNT(*) as total_receipts,
          SUM(total_amount::numeric) as total_amount,
          COUNT(DISTINCT vendor_name) as unique_vendors,
          vendor_name,
          SUM(total_amount::numeric) as vendor_total
        FROM receipt_embeddings 
        WHERE user_id = ${userId}
        GROUP BY vendor_name
        ORDER BY vendor_total DESC
        LIMIT 10
      `;

      const summary = result.rows[0];
      const topVendors = result.rows.slice(0, 5);

      return `
Total Receipts: ${summary?.total_receipts || 0}
Total Amount: $${summary?.total_amount || 0}
Unique Vendors: ${summary?.unique_vendors || 0}

Top Vendors:
${topVendors.map(v => `- ${v.vendor_name}: $${v.vendor_total}`).join('\n')}
`;
    } catch (error) {
      return "Receipt data unavailable";
    }
  }

  private async getTransactionData(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_credits,
          SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_debits,
          COUNT(DISTINCT account_id) as unique_accounts
        FROM transactions 
        WHERE user_id = ${userId}
      `;

      const summary = result.rows[0];

      return `
Total Transactions: ${summary?.total_transactions || 0}
Total Credits: $${summary?.total_credits || 0}
Total Debits: $${summary?.total_debits || 0}
Unique Accounts: ${summary?.unique_accounts || 0}
`;
    } catch (error) {
      return "Transaction data unavailable";
    }
  }

  private async getReceiptSummary(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT COUNT(*) as count, SUM(total_amount::numeric) as total
        FROM receipt_embeddings 
        WHERE user_id = ${userId}
      `;
      
      const row = result.rows[0];
      return `${row?.count || 0} receipts totaling $${row?.total || 0}`;
    } catch (error) {
      return "Receipt summary unavailable";
    }
  }

  private async getTransactionSummary(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT COUNT(*) as count, SUM(ABS(amount)) as total
        FROM transactions 
        WHERE user_id = ${userId}
      `;
      
      const row = result.rows[0];
      return `${row?.count || 0} transactions totaling $${row?.total || 0}`;
    } catch (error) {
      return "Transaction summary unavailable";
    }
  }

  private async getAccountSummary(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT COUNT(*) as count
        FROM accounts 
        WHERE user_id = ${userId}
      `;
      
      const row = result.rows[0];
      return `${row?.count || 0} accounts configured`;
    } catch (error) {
      return "Account summary unavailable";
    }
  }

  private async getFinancialInsights(userId: string): Promise<string> {
    try {
      const [receipts, monthlySpending, topCategories] = await Promise.all([
        this.getDetailedReceiptData(userId),
        this.getMonthlySpending(userId),
        this.getTopCategories(userId)
      ]);

      return `
${receipts}

Monthly Spending Trends:
${monthlySpending}

Top Expense Categories:
${topCategories}
`;
    } catch (error) {
      return "Financial insights unavailable";
    }
  }

  private async getDetailedReceiptData(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT 
          DATE_TRUNC('month', receipt_date) as month,
          COUNT(*) as receipt_count,
          SUM(total_amount::numeric) as monthly_total,
          AVG(total_amount::numeric) as avg_receipt_amount
        FROM receipt_embeddings 
        WHERE user_id = ${userId}
          AND receipt_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', receipt_date)
        ORDER BY month DESC
      `;

      return `Recent Monthly Receipt Activity:
${result.rows.map(row => 
  `${new Date(row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}: ${row.receipt_count} receipts, $${row.monthly_total} total, $${row.avg_receipt_amount} average`
).join('\n')}`;
    } catch (error) {
      return "Detailed receipt data unavailable";
    }
  }

  private async getMonthlySpending(userId: string): Promise<string> {
    try {
      const result = await sql`
        SELECT 
          DATE_TRUNC('month', receipt_date) as month,
          SUM(total_amount::numeric) as total
        FROM receipt_embeddings 
        WHERE user_id = ${userId}
          AND receipt_date >= CURRENT_DATE - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', receipt_date)
        ORDER BY month DESC
        LIMIT 6
      `;

      return result.rows.map(row => 
        `${new Date(row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}: $${row.total}`
      ).join('\n');
    } catch (error) {
      return "Monthly spending data unavailable";
    }
  }

  private async getTopCategories(userId: string): Promise<string> {
    try {
      // This would need to be adapted based on how categories are stored
      // For now, return a placeholder
      return "Category analysis requires receipt line item data structure review";
    } catch (error) {
      return "Category data unavailable";
    }
  }
}

export default ChatBotAgent;

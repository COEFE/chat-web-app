/**
 * Core agent types for the multi-agent architecture
 */

export interface AgentResponse {
  success: boolean;
  message: string;
  agentId?: string;
  sourceDocuments?: any;
  data?: any;
}

export interface DocumentContext {
  type: string; // 'pdf', 'excel', 'image', etc.
  name: string; // Filename
  content: string; // Base64 content or text content
  metadata?: Record<string, any>; // Additional metadata about the document
  extractedData?: {
    statementInfo?: {
      creditCardIssuer?: string;
      lastFourDigits?: string;
      statementNumber?: string;
      statementDate?: string;
      balance?: number;
      dueDate?: string;
      minimumPayment?: number;
      transactions?: Array<{
        date: string;
        description: string;
        amount: number;
        category?: string;
      }>;
    };
    [key: string]: any; // Allow for other types of extracted data
  };
}

export interface AgentContext {
  userId: string;
  query: string;
  conversationId?: string;
  previousMessages?: AgentMessage[];
  documentContext?: DocumentContext;
  token?: string; // Authentication token for API requests
  additionalContext?: Record<string, any>; // Additional context like similar conversations
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number;
  agentId?: string;
  toolName?: string;
  toolResult?: any;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  processRequest(context: AgentContext): Promise<AgentResponse>;
  canHandle(query: string): Promise<boolean>;
}

export interface AgentRegistry {
  registerAgent(agent: Agent): void;
  getAgent(id: string): Agent | undefined;
  getAllAgents(): Agent[];
  findAgentForQuery(query: string): Promise<Agent | undefined>;
}

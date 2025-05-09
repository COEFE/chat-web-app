/**
 * Core agent types for the multi-agent architecture
 */

export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
}

export interface AgentContext {
  userId: string;
  query: string;
  conversationId?: string;
  previousMessages?: AgentMessage[];
  documentContext?: any;
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

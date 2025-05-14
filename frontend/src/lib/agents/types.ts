/**
 * Common interfaces for the multi-agent accounting system
 */

/**
 * Context for processing agent requests
 */
export interface AgentContext {
  userId?: string;
  query: string;
  conversationId?: string;
  previousMessages?: Array<{role: string, content: string}>;
  documentContext?: any;
  token?: string;
  messageCount?: number;
}

/**
 * Standard response format from all agents
 */
export interface AgentResponse {
  success: boolean;
  message: string;
  data?: any;
}

/**
 * Base interface for specialized accounting agents
 */
export interface Agent {
  id: string;
  name: string;
  description: string;
  
  /**
   * Determine if this agent can handle the given query
   */
  canHandle(query: string): Promise<boolean>;
  
  /**
   * Process a request specialized to this agent
   */
  processRequest(context: AgentContext): Promise<AgentResponse>;
}

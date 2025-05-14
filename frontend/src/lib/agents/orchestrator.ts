import { Agent, AgentContext, AgentResponse, AgentRegistry } from "@/types/agents";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { logAuditEvent } from "@/lib/auditLogger";
import { classifyUserIntent } from "@/lib/intentClassifier";

/**
 * AccountingOrchestrator handles routing user queries to specialized accounting agents
 * It serves as the entry point to the multi-agent system
 */
export class AccountingOrchestrator {
  private agents: Record<string, Agent> = {};
  private anthropic: Anthropic;
  // Track last agent used per conversation
  private lastAgentUsed: Record<string, string> = {};

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }

  /**
   * Register a specialized agent with the orchestrator
   */
  registerAgent(agent: Agent): void {
    this.agents[agent.id] = agent;
    console.log(`[Orchestrator] Registered agent: ${agent.id} - ${agent.name}`);
  }

  /**
   * Process a user request by determining which specialized agent should handle it
   */
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    console.log(`[Orchestrator] Processing request: ${context.query}`);
    
    try {
      // Check if we should maintain conversation with previous agent
      const conversationId = context.conversationId || `user-${context.userId}-${Date.now()}`;
      const lastAgentId = this.lastAgentUsed[conversationId];
      let targetAgent;
      
      // Check if conversation is in progress with previously used agent
      if (lastAgentId && this.agents[lastAgentId] && conversationId) {
        const lastAgent = this.agents[lastAgentId];
        const normalizedQuery = context.query.toLowerCase().trim();
        
        // Special handling for very short responses in ongoing conversations
        // These are likely confirmations or simple follow-ups to a previous agent's question
        const isShortResponse = normalizedQuery.length < 10;
        const isSimpleResponse = ['yes', 'no', 'okay', 'sure', 'confirm', 'cancel', 'proceed'].includes(normalizedQuery);
        
        if (isShortResponse || isSimpleResponse) {
          console.log(`[Orchestrator] Prioritizing conversation continuity for short response: ${normalizedQuery}`);
          targetAgent = lastAgent;
        } else {
          // Check if last agent might handle this as a follow-up
          const canHandle = await lastAgent.canHandle(context.query);
          
          if (canHandle) {
            console.log(`[Orchestrator] Continuing with previous agent: ${lastAgentId}`);
            targetAgent = lastAgent;
          } else {
            // If last agent can't handle it, determine a new target agent
            targetAgent = await this.determineTargetAgent(context.query);
          }
        }
      } else {
        // New conversation or no last agent, determine target
        targetAgent = await this.determineTargetAgent(context.query);
      }
      
      if (targetAgent) {
        console.log(`[Orchestrator] Routing to specialized agent: ${targetAgent.id}`);
        
        // Store this agent for future messages in this conversation
        this.lastAgentUsed[conversationId] = targetAgent.id;
        
        // Log the routing decision
        await logAuditEvent({
          user_id: context.userId,
          action_type: "ROUTE_QUERY",
          entity_type: "AGENT",
          entity_id: targetAgent.id,
          context: { query: context.query, agentId: "orchestrator" },
          status: "SUCCESS",
          timestamp: new Date().toISOString()
        });
        
        // 2. Pass the query to the specialized agent
        return await targetAgent.processRequest(context);
      }
      
      // 3. If no specialized agent can handle it, use Claude as fallback
      console.log("[Orchestrator] No specialized agent found, using Claude fallback");
      return await this.processFallbackWithClaude(context);
    } catch (error) {
      console.error("[Orchestrator] Error processing request:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "QUERY",
        entity_id: "fallback",
        context: { query: context.query, agentId: "orchestrator" },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: "Sorry, I encountered an error while processing your request."
      };
    }
  }

  /**
   * Determine which specialized agent should handle the query
   * Uses AI-based intent classification to route to the appropriate agent
   */
  private async determineTargetAgent(query: string): Promise<Agent | undefined> {
    console.log(`[Orchestrator] Determining target agent for query: "${query}"`);
    
    try {
      // Only proceed if we have registered agents
      if (Object.keys(this.agents).length === 0) {
        console.log(`[Orchestrator] No agents registered, cannot determine target agent.`);
        return undefined;
      }
      
      // Use AI-based intent classification 
      const classification = await classifyUserIntent(query);
      console.log(`[Orchestrator] Query classified as: ${classification.intent} (confidence: ${classification.confidence})`);
      
      // Map intents to agent IDs
      let targetAgentId: string | undefined = undefined;
      
      switch (classification.intent) {
        case 'ap_bill':
          targetAgentId = 'ap_agent';
          break;
        case 'ar_invoice':
          targetAgentId = 'invoice-agent';
          break;
        case 'gl_query':
          targetAgentId = 'gl_agent';
          break;
        case 'reconciliation':
          targetAgentId = 'reconciliation_agent';
          break;
        default:
          // For unknown queries, as a fallback, we'll check if any agent claims it can handle the query
          for (const agentId in this.agents) {
            const agent = this.agents[agentId];
            const canHandle = await agent.canHandle(query);
            
            if (canHandle) {
              console.log(`[Orchestrator] ${agentId} claims it can handle the query.`);
              return agent;
            }
          }
      }
      
      // Return the target agent if we found one
      if (targetAgentId && this.agents[targetAgentId]) {
        console.log(`[Orchestrator] Selected agent ${targetAgentId} based on intent classification.`);
        return this.agents[targetAgentId];
      }
      
      // If we get here, no agent was selected
      console.log(`[Orchestrator] No suitable agent found for query.`);
      return undefined;
    } catch (error) {
      console.error("[Orchestrator] Error determining target agent:", error);
      return undefined;
    }
  }

  /**
   * Process a request using Claude as a fallback when no specialized agent is available
   * This maintains compatibility with the existing system
   */
  private async processFallbackWithClaude(context: AgentContext): Promise<AgentResponse> {
    try {
      // Format previous messages for Claude if available
      const messages: MessageParam[] = [];
      
      if (context.previousMessages && context.previousMessages.length > 0) {
        context.previousMessages.forEach(msg => {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        });
      }
      
      // Add current query
      messages.push({
        role: "user",
        content: context.query
      });
      
      // Create a system prompt that includes any document context
      let systemPrompt = "You are Claude, an AI assistant specializing in accounting and financial tasks.";
      
      if (context.documentContext) {
        systemPrompt += "\n\nCurrently, you are working with the following document context:\n";
        systemPrompt += JSON.stringify(context.documentContext);
      }
      
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages
      });
      
      return {
        success: true,
        message: typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '',
      };
    } catch (error) {
      console.error("[Orchestrator] Claude fallback error:", error);
      return {
        success: false,
        message: "I'm having trouble processing your request right now. Please try again later."
      };
    }
  }
}

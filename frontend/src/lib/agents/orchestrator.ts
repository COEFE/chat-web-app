import { Agent, AgentContext, AgentResponse, AgentRegistry } from "@/types/agents";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { logAuditEvent } from "@/lib/auditLogger";

/**
 * AccountingOrchestrator handles routing user queries to specialized accounting agents
 * It serves as the entry point to the multi-agent system
 */
export class AccountingOrchestrator {
  private agents: Record<string, Agent> = {};
  private anthropic: Anthropic;

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
      // 1. Determine which specialized agent should handle this query
      const targetAgent = await this.determineTargetAgent(context.query);
      
      if (targetAgent) {
        console.log(`[Orchestrator] Routing to specialized agent: ${targetAgent.id}`);
        
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
   * Uses Claude to analyze the query and recommend the most appropriate agent
   */
  private async determineTargetAgent(query: string): Promise<Agent | undefined> {
    // First check if any registered agent claims it can handle this query
    for (const agentId in this.agents) {
      const agent = this.agents[agentId];
      const canHandle = await agent.canHandle(query);
      
      if (canHandle) {
        return agent;
      }
    }
    
    // If no agent directly claims the query, use Claude to determine the best agent
    try {
      // Only ask Claude to route if we have registered agents
      if (Object.keys(this.agents).length === 0) {
        return undefined;
      }
      
      const agentDescriptions = Object.values(this.agents).map(
        agent => `${agent.id}: ${agent.description}`
      ).join("\n");
      
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 150,
        temperature: 0.2,
        system: `You are an expert accounting query classifier that determines which specialized agent should handle a user query.
        Your task is to select the most appropriate agent from the following options:
        
        ${agentDescriptions}
        
        Analyze the user's query and respond ONLY with the ID of the most appropriate agent, with no additional text.
        If no agent is appropriate, respond with "none".`,
        messages: [{ role: "user", content: query }]
      });
      
      const suggestedAgentId = typeof response.content[0] === 'object' && 'text' in response.content[0] && typeof response.content[0].text === 'string' ? response.content[0].text.trim().toLowerCase() : 'none';
      console.log(`[Orchestrator] Claude suggested agent: ${suggestedAgentId}`);
      
      if (suggestedAgentId !== "none" && this.agents[suggestedAgentId]) {
        return this.agents[suggestedAgentId];
      }
      
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

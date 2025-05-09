import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { findRelevantGLCodes, mightBeAboutGLCodes } from "@/lib/glUtils";
import { logAgentAction } from "@/lib/auditLogger";
import Anthropic from "@anthropic-ai/sdk";

/**
 * GLAgent specializes in handling General Ledger related queries
 * It leverages existing GL functionality to provide accurate GL information
 */
export class GLAgent implements Agent {
  id = "gl_agent";
  name = "General Ledger Agent";
  description = "Handles queries about GL codes, journal entries, and ledger information";
  
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
    // Reuse the existing GL detection logic
    return mightBeAboutGLCodes(query);
  }

  /**
   * Process GL-related requests
   */
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    console.log(`[GLAgent] Processing request: ${context.query}`);
    
    try {
      // 1. Log the agent action
      await logAgentAction({
        userId: context.userId,
        agentId: this.id,
        actionType: "PROCESS_QUERY",
        entityType: "GL_QUERY",
        entityId: context.conversationId || "unknown",
        context: { query: context.query },
        status: "ATTEMPT"
      });
      
      // 2. Gather relevant GL code information using existing functionality
      const relevantCodes = await findRelevantGLCodes(context.query, 7);
      
      // 3. Format GL codes as context for Claude
      let glCodeContext = "";
      if (relevantCodes.length > 0) {
        glCodeContext = `
Here is information about General Ledger (GL) codes that might help answer the query:
${relevantCodes.map(code => `- ${code.content}`).join('\n')}

Please use this GL code information to help answer the user's question.
`;
      }
      
      // 4. Format previous messages for Claude if available
      const messages = [];
      
      if (context.previousMessages && context.previousMessages.length > 0) {
        // Format previous messages for Claude
        for (const msg of context.previousMessages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        }
      }
      
      // 5. Add current query
      messages.push({
        role: "user",
        content: context.query
      });
      
      // 6. Create a system prompt with GL expertise
      const systemPrompt = `You are a General Ledger accounting expert. You specialize in:
- Understanding and explaining GL codes
- Helping with journal entries
- Guiding users on proper accounting treatments
- Clarifying accounting principles related to the general ledger

${glCodeContext}`;
      
      // 7. Get response from Claude with GL expertise
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages
      });
      
      // 8. Log successful completion
      await logAgentAction({
        userId: context.userId,
        agentId: this.id,
        actionType: "PROCESS_QUERY",
        entityType: "GL_QUERY",
        entityId: context.conversationId || "unknown",
        context: { 
          query: context.query,
          relevantCodesCount: relevantCodes.length
        },
        status: "SUCCESS"
      });
      
      return {
        success: true,
        message: response.content[0].text,
        data: {
          relevantGLCodes: relevantCodes
        }
      };
    } catch (error) {
      console.error("[GLAgent] Error processing request:", error);
      
      // Log the error
      await logAgentAction({
        userId: context.userId,
        agentId: this.id,
        actionType: "PROCESS_QUERY",
        entityType: "GL_QUERY",
        entityId: context.conversationId || "unknown",
        context: { query: context.query },
        status: "FAILURE",
        errorDetails: error instanceof Error ? error.message : String(error)
      });
      
      return {
        success: false,
        message: "I encountered an error while processing your GL request. Please try again."
      };
    }
  }
}

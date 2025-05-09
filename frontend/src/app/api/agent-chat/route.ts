import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';
import { AccountingOrchestrator } from '@/lib/agents/orchestrator';
import { GLAgent } from '@/lib/agents/glAgent';
import { logAgentAction } from '@/lib/auditLogger';

// Create and configure the orchestrator with available agents
// Note: This is a simple approach for now - in production, consider a more robust singleton pattern
const orchestrator = new AccountingOrchestrator();
const glAgent = new GLAgent();
orchestrator.registerAgent(glAgent);

/**
 * API Route: /api/agent-chat
 * Handles multi-agent chat requests through the orchestrator
 */
export async function POST(req: NextRequest) {
  console.log("--- /api/agent-chat POST request received ---");

  // 1. Authenticate the user
  const authorizationHeader = req.headers.get("Authorization");
  let userId: string;
  try {
    if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: "Unauthorized: Missing or invalid Authorization header" }, 
        { status: 401 }
      );
    }
    
    const idToken = authorizationHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    userId = decodedToken.uid;
    console.log("User authenticated:", userId);
  } catch (error) {
    console.error("Authentication error:", error);
    return NextResponse.json(
      { error: "Unauthorized: Invalid token" }, 
      { status: 401 }
    );
  }

  // 2. Parse the request body
  let body;
  try {
    body = await req.json();
  } catch (error) {
    console.error("Error parsing request body:", error);
    return NextResponse.json(
      { error: "Invalid request body" }, 
      { status: 400 }
    );
  }

  // 3. Validate the request
  const { query, messages, conversationId, documentContext } = body;
  
  if (!query || typeof query !== 'string') {
    return NextResponse.json(
      { error: "Missing 'query' in request body" }, 
      { status: 400 }
    );
  }

  try {
    // 4. Log the incoming request
    await logAgentAction({
      userId,
      agentId: "agent_api",
      actionType: "CHAT_REQUEST",
      entityType: "CONVERSATION",
      entityId: conversationId || "new",
      context: { 
        query,
        hasDocumentContext: !!documentContext,
        messageCount: messages?.length || 0
      },
      status: "ATTEMPT"
    });

    // 5. Process the request through the orchestrator
    const result = await orchestrator.processRequest({
      userId,
      query,
      conversationId,
      previousMessages: messages || [],
      documentContext
    });

    // 6. Log successful completion
    await logAgentAction({
      userId,
      agentId: "agent_api",
      actionType: "CHAT_RESPONSE",
      entityType: "CONVERSATION",
      entityId: conversationId || "new",
      context: { 
        success: result.success,
        messageLength: result.message.length
      },
      status: "SUCCESS"
    });

    // 7. Return the response
    return NextResponse.json({
      message: result.message,
      success: result.success,
      data: result.data
    });
  } catch (error) {
    console.error("Error processing agent chat request:", error);
    
    // Log the error
    await logAgentAction({
      userId,
      agentId: "agent_api",
      actionType: "CHAT_RESPONSE",
      entityType: "CONVERSATION",
      entityId: conversationId || "new",
      context: { query },
      status: "FAILURE",
      errorDetails: error instanceof Error ? error.message : String(error)
    });
    
    return NextResponse.json(
      { error: "Failed to process chat request" }, 
      { status: 500 }
    );
  }
}

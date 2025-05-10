import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';
import { AccountingOrchestrator } from '@/lib/agents/orchestrator';
import { GLAgent } from '@/lib/agents/glAgent';
import { APAgent } from '@/lib/agents/apAgent';
import { InvoiceAgent } from '@/lib/agents/invoiceAgent';
import { ReconciliationAgent } from '@/lib/agents/reconciliationAgent';
import { logAuditEvent } from '@/lib/auditLogger';

// Create and configure the orchestrator with available agents
// Note: This is a simple approach for now - in production, consider a more robust singleton pattern
const orchestrator = new AccountingOrchestrator();

// Register the GL Agent
const glAgent = new GLAgent();
orchestrator.registerAgent(glAgent);

// Register the AP Agent
const apAgent = new APAgent();
orchestrator.registerAgent(apAgent);

// Register the Invoice Agent
const invoiceAgent = new InvoiceAgent();
orchestrator.registerAgent(invoiceAgent);

// Register the Reconciliation Agent
const reconciliationAgent = new ReconciliationAgent();
orchestrator.registerAgent(reconciliationAgent);

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
    await logAuditEvent({
      user_id: userId,
      action_type: "CHAT_REQUEST",
      entity_type: "CONVERSATION",
      entity_id: conversationId || "new",
      context: { 
        query,
        hasDocumentContext: !!documentContext,
        messageCount: messages?.length || 0,
        agentId: "agent_api"
      },
      status: "ATTEMPT",
      timestamp: new Date().toISOString()
    });

    // 5. Process the request through the orchestrator
    const result = await orchestrator.processRequest({
      userId,
      query,
      conversationId,
      previousMessages: messages || [],
      documentContext,
      token: authorizationHeader.split('Bearer ')[1] // Pass the token for API calls that need auth
    });

    // 6. Log successful completion
    await logAuditEvent({
      user_id: userId,
      action_type: "CHAT_RESPONSE",
      entity_type: "CONVERSATION",
      entity_id: conversationId || "new",
      context: { 
        success: result.success,
        messageLength: result.message.length,
        agentId: "agent_api"
      },
      status: "SUCCESS",
      timestamp: new Date().toISOString()
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
    await logAuditEvent({
      user_id: userId,
      action_type: "CHAT_RESPONSE",
      entity_type: "CONVERSATION",
      entity_id: conversationId || "new",
      context: { query, agentId: "agent_api" },
      status: "FAILURE",
      error_details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { error: "Failed to process chat request" }, 
      { status: 500 }
    );
  }
}

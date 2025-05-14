import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { APAgent } from '@/lib/agents/apAgent';
import { AgentContext } from '@/types/agents';
import { checkStatementStatus } from '@/lib/accounting/statementUtils';

/**
 * API endpoint to test the AP Agent's memory system
 * This endpoint allows testing the agent's ability to remember and recognize statements
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      return error;
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse the request body
    const body = await request.json();
    const { statementNumber, query } = body;

    // Validate required fields
    if (!statementNumber) {
      return NextResponse.json(
        { error: 'Statement number is required' },
        { status: 400 }
      );
    }

    // First check if the statement exists in our tracking system
    const statementStatus = await checkStatementStatus(statementNumber, userId);
    
    // Create an AP agent instance
    const apAgent = new APAgent();
    
    // Create a context for the agent
    const context: AgentContext = {
      query: query || `Check if statement ${statementNumber} has been processed before`,
      userId,
      conversationId: 'test-conversation'
    };

    // Process the request through the AP agent
    const response = await apAgent.processRequest(context);

    // Return the agent's response
    return NextResponse.json({
      success: true,
      message: response.message,
      isProcessed: statementStatus.isProcessed,
      accountId: statementStatus.accountId,
      accountName: statementStatus.accountName
    });
  } catch (error) {
    console.error('Error testing AP agent memory:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'An unexpected error occurred' 
      },
      { status: 500 }
    );
  }
}

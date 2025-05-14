import { NextRequest, NextResponse } from 'next/server';
import { runAgentCommunicationTest } from '@/lib/tests/testAgentCommunication';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * API endpoint to test agent communication
 * This endpoint runs a test of the AP agent requesting GL account creation
 */
export async function GET(req: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(req);
    
    // If authentication failed, return the error
    if (error) {
      return error;
    }
    
    // If no userId, return unauthorized
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Run the agent communication test
    const result = await runAgentCommunicationTest(userId);
    
    // Return the result
    return NextResponse.json({ success: true, message: result });
  } catch (error) {
    console.error('Error in agent communication test API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

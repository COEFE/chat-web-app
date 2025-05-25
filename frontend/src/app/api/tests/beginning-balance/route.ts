import { NextRequest, NextResponse } from 'next/server';
import { CreditCardAgent } from '../../../../lib/agents/creditCardAgent';
import { AgentContext } from '@/types/agents';

/**
 * Test endpoint for beginning balance integration
 * This endpoint allows testing the enhanced credit card statement processing
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, userId, documentContext } = body;

    if (!query || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: query and userId' },
        { status: 400 }
      );
    }

    console.log('[TestBeginningBalance] Starting test with:', {
      userId,
      hasDocumentContext: !!documentContext,
      queryLength: query.length
    });

    // Create agent context
    const context: AgentContext = {
      userId: userId,
      query: 'Test beginning balance integration',
      conversationId: `test-session-${Date.now()}`
    };

    // Create credit card agent
    const creditCardAgent = new CreditCardAgent();

    // Test the enhanced processing method
    const result = await (creditCardAgent as any).processStatementWithBeginningBalance(
      context,
      query,
      documentContext
    );

    console.log('[TestBeginningBalance] Processing result:', {
      success: result.success,
      accountId: result.accountId,
      accountName: result.accountName,
      beginningBalanceRecorded: result.beginningBalanceRecorded,
      beginningBalanceMessage: result.beginningBalanceMessage
    });

    return NextResponse.json({
      success: true,
      message: 'Beginning balance test completed',
      result: {
        accountCreated: result.success,
        accountId: result.accountId,
        accountName: result.accountName,
        beginningBalanceRecorded: result.beginningBalanceRecorded,
        beginningBalanceMessage: result.beginningBalanceMessage,
        processingMessage: result.message
      }
    });

  } catch (error) {
    console.error('[TestBeginningBalance] Error:', error);
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check if the beginning balance integration is available
 */
export async function GET() {
  try {
    // Check if the credit card agent has the enhanced methods
    const creditCardAgent = new CreditCardAgent();
    const hasEnhancedMethod = typeof (creditCardAgent as any).processStatementWithBeginningBalance === 'function';
    const hasCheckMethod = typeof (creditCardAgent as any).shouldUseBeginningBalanceProcessing === 'function';

    return NextResponse.json({
      success: true,
      message: 'Beginning balance integration status',
      status: {
        enhancedProcessingAvailable: hasEnhancedMethod,
        checkMethodAvailable: hasCheckMethod,
        integrationReady: hasEnhancedMethod && hasCheckMethod
      }
    });

  } catch (error) {
    console.error('[TestBeginningBalance] Error checking status:', error);
    return NextResponse.json(
      { 
        error: 'Error checking integration status',
        details: error instanceof Error ? error.message : 'Unknown error',
        success: false
      },
      { status: 500 }
    );
  }
}

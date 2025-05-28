import { NextRequest, NextResponse } from 'next/server';
import { ChatBotAgent } from '@/lib/agents/chatBotAgent';
import { AgentContext } from '@/types/agents';
import { getAuth } from '@/lib/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const { query, idToken } = await request.json();

    if (!query || !idToken) {
      return NextResponse.json(
        { error: 'Query and idToken are required' },
        { status: 400 }
      );
    }

    // Verify the Firebase ID token
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const userEmail = decodedToken.email || '';

    // Create agent context
    const context: AgentContext = {
      userId,
      query,
    };

    // Initialize and use the chatbot agent
    const chatBotAgent = new ChatBotAgent();
    const response = await chatBotAgent.handle(query, context);

    return NextResponse.json({
      success: response.success,
      message: response.message,
      data: response.data,
    });

  } catch (error) {
    console.error('Assistant API error:', error);
    
    return NextResponse.json(
      { 
        success: false,
        message: 'I encountered an error while processing your request. Please try again.',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Assistant API is running',
    endpoints: {
      POST: '/api/assistant - Send a query to the AI assistant'
    }
  });
}

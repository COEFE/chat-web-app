import { auth } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

// Initialize AI client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface AccountingAnalysisResponse {
  accountId: number | null;
  confidence: number;
  reasoning: string;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AccountingAnalysisResponse>> {
  try {
    // Authenticate the user
    const user = await auth(request);
    if (!user || !user.uid) {
      console.error('[API accounting-analysis] Authentication failed: No user UID.');
      return NextResponse.json({ 
        accountId: null, 
        confidence: 0, 
        reasoning: 'Unauthorized', 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Parse the request body
    const body = await request.json();
    const { systemPrompt, userPrompt } = body;

    if (!systemPrompt || !userPrompt) {
      return NextResponse.json({ 
        accountId: null, 
        confidence: 0, 
        reasoning: 'Missing required parameters', 
        error: 'Bad Request' 
      }, { status: 400 });
    }

    console.log(`[API accounting-analysis] Processing request for user: ${user.uid}`);
    
    try {
      // Call Claude to analyze the accounting data
      const response = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      
      // Extract the response text from Claude
      let aiResponseText = '';
      if (response.content && response.content.length > 0 && 'text' in response.content[0]) {
        aiResponseText = response.content[0].text || '';
      }
      
      console.log(`[API accounting-analysis] Claude response: "${aiResponseText.substring(0, 100)}..."`);
      
      // Parse the JSON response from Claude
      try {
        // The response should be a JSON object with accountId, confidence, and reasoning
        const parsedResponse = JSON.parse(aiResponseText);
        
        // Validate the response structure
        if (typeof parsedResponse.accountId !== 'number' && parsedResponse.accountId !== null) {
          throw new Error('Invalid accountId in response');
        }
        
        if (typeof parsedResponse.confidence !== 'number' || parsedResponse.confidence < 0 || parsedResponse.confidence > 100) {
          parsedResponse.confidence = 0; // Default to 0 if invalid
        }
        
        if (typeof parsedResponse.reasoning !== 'string') {
          parsedResponse.reasoning = 'No reasoning provided';
        }
        
        return NextResponse.json(parsedResponse);
      } catch (parseError) {
        console.error('[API accounting-analysis] Error parsing Claude response:', parseError);
        
        // If we can't parse the JSON, try to extract an account ID from the text
        const idMatch = aiResponseText.match(/accountId["\s:]+(\d+)/i);
        const accountId = idMatch ? parseInt(idMatch[1], 10) : null;
        
        return NextResponse.json({
          accountId,
          confidence: 50, // Medium confidence for extracted ID
          reasoning: 'Extracted from AI response text'
        });
      }
    } catch (aiError) {
      console.error('[API accounting-analysis] Error calling Claude:', aiError);
      return NextResponse.json({ 
        accountId: null, 
        confidence: 0, 
        reasoning: 'AI processing error', 
        error: aiError instanceof Error ? aiError.message : String(aiError) 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[API accounting-analysis] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ 
      accountId: null, 
      confidence: 0, 
      reasoning: errorMessage, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface LastFourDigitsExtractionResult {
  lastFourDigits: string | null;
  confidence: 'high' | 'medium' | 'low';
  extractionMethod: string;
}

export async function extractLastFourDigitsWithAI(
  statementData: any
): Promise<LastFourDigitsExtractionResult> {
  try {
    const prompt = `You are an expert at extracting credit card information from financial statements. 

Your task is to identify the last four digits of the credit card account from the provided statement data.

Statement Data:
${JSON.stringify(statementData, null, 2)}

Instructions:
1. Look for credit card account numbers, statement numbers, or any masked card numbers
2. Credit card numbers are often displayed as: XXXX-XXXX-XXXX-1234, ****-****-****-5678, or similar formats
3. For American Express, numbers might be in format: XXXX-XXXXX1-92009 (where the last 4 digits would be 2009, not 9009)
4. Statement numbers might contain the last four digits
5. Account identifiers might include the last four digits

Respond with ONLY a JSON object in this exact format:
{
  "lastFourDigits": "1234",
  "confidence": "high",
  "extractionMethod": "Found in masked account number XXXX-XXXX-XXXX-1234"
}

Rules:
- lastFourDigits must be exactly 4 digits or null if not found
- confidence must be "high", "medium", or "low"
- extractionMethod should briefly explain where/how you found the digits
- If multiple potential last four digits are found, choose the most likely one for the primary credit card account`;

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      temperature: 0.1,
      system: "You are an expert financial data extraction AI. You extract credit card last four digits with high accuracy. Respond only with valid JSON.",
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    try {
      const result = JSON.parse(responseText);
      
      // Validate the response
      if (result.lastFourDigits && !/^\d{4}$/.test(result.lastFourDigits)) {
        console.warn('[AI Last Four Extractor] Invalid last four digits format:', result.lastFourDigits);
        return {
          lastFourDigits: null,
          confidence: 'low',
          extractionMethod: 'AI extraction failed validation'
        };
      }
      
      console.log('[AI Last Four Extractor] Successfully extracted:', result);
      return result;
      
    } catch (parseError) {
      console.error('[AI Last Four Extractor] Failed to parse AI response:', responseText);
      return {
        lastFourDigits: null,
        confidence: 'low',
        extractionMethod: 'AI response parsing failed'
      };
    }
    
  } catch (error) {
    console.error('[AI Last Four Extractor] AI extraction failed:', error);
    return {
      lastFourDigits: null,
      confidence: 'low',
      extractionMethod: 'AI service error'
    };
  }
}

// Fallback function using simple regex patterns
export function extractLastFourDigitsFallback(statementData: any): LastFourDigitsExtractionResult {
  if (!statementData) {
    return {
      lastFourDigits: null,
      confidence: 'low',
      extractionMethod: 'No statement data provided'
    };
  }

  // If already provided
  if (statementData.lastFourDigits && /^\d{4}$/.test(statementData.lastFourDigits)) {
    return {
      lastFourDigits: statementData.lastFourDigits,
      confidence: 'high',
      extractionMethod: 'Directly provided in statement data'
    };
  }

  const statementStr = JSON.stringify(statementData);
  
  // Look for masked card numbers like XXXX-XXXX-XXXX-1234
  const maskedCardMatch = statementStr.match(/X{4}[^0-9]*X{4}[^0-9]*X{4}[^0-9]*(\d{4})/i);
  if (maskedCardMatch) {
    return {
      lastFourDigits: maskedCardMatch[1],
      confidence: 'high',
      extractionMethod: 'Found in masked card number pattern'
    };
  }

  // Look for patterns like ****1234
  const starCardMatch = statementStr.match(/\*{4,}(\d{4})/);
  if (starCardMatch) {
    return {
      lastFourDigits: starCardMatch[1],
      confidence: 'medium',
      extractionMethod: 'Found in starred card number pattern'
    };
  }

  // Generic 4-digit pattern (lowest confidence)
  const genericMatch = statementStr.match(/\b(\d{4})\b/);
  if (genericMatch) {
    return {
      lastFourDigits: genericMatch[1],
      confidence: 'low',
      extractionMethod: 'Found generic 4-digit number'
    };
  }

  return {
    lastFourDigits: null,
    confidence: 'low',
    extractionMethod: 'No patterns matched'
  };
}

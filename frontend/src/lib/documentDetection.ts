/**
 * Document detection utilities for AI-powered document classification
 */
import Anthropic from '@anthropic-ai/sdk';

/**
 * Determines if a query is asking about document content rather than requesting processing
 * Uses Claude AI to analyze the query intent
 * 
 * @param query - The user's query text
 * @returns Promise<boolean> - True if the query is asking about document content
 */
export async function isDocumentContentQuery(query: string): Promise<boolean> {
  // For empty queries, assume it's not a content question
  if (!query || query.trim().length === 0) {
    return false;
  }
  
  try {
    // Configure Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    });
    
    // Use Claude to determine if this is a content question
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307", // Use faster model for this simple classification
      max_tokens: 10, // We only need a yes/no response
      system: `You are an AI query intent classifier. Your task is to determine if a user query 
        is asking about document content rather than requesting processing.
        
        Examples of content questions:
        - "What's in this document?"
        - "Can you tell me what this document contains?"
        - "What information is in this file?"
        - "Summarize this document for me"
        - "What does this statement show?"
        - "What kind of document is this?"
        
        Examples of processing requests:
        - "Process this statement"
        - "Record these transactions"
        - "Create invoices from this file"
        - "Import this data"
        - "Pay these bills"
        
        Respond with only "true" if the query is asking about document content/information,
        or "false" if the query is requesting document processing/action.`,
      messages: [
        {
          role: "user",
          content: query
        }
      ]
    });
    
    // Parse the response
    if (response.content && response.content.length > 0) {
      const firstContent = response.content[0];
      const responseText = 'text' in firstContent ? firstContent.text.toLowerCase().trim() : '';
      console.log(`[Document Detection] AI content question detection result: ${responseText}`);
      
      return responseText === "true";
    }
    
    return false;
  } catch (error) {
    console.error("[Document Detection] Error in AI content query detection:", error);
    
    // Fallback to simple heuristic in case of API failure
    const contentKeywords = ['what', 'describe', 'tell me about', 'summarize', 'analyze', 'show me', 'what\'s in'];
    return contentKeywords.some(keyword => query.toLowerCase().includes(keyword));
  }
}

/**
 * Detects if a PDF document is a credit card statement using Claude AI
 * 
 * @param pdfBase64 - Base64 encoded PDF content
 * @param fileName - Name of the PDF file
 * @returns Promise<boolean> - True if the document is a credit card statement
 */
export async function detectCreditCardStatement(pdfBase64: string, fileName: string): Promise<boolean> {
  try {
    // Configure Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    });
    
    // Create a system prompt for Claude to detect if this is a credit card statement
    const systemPrompt = `You are an AI assistant that specializes in identifying document types.
      Your task is to determine if the provided PDF document is a credit card statement.
      Analyze the document structure, content, and formatting.
      
      Look for typical credit card statement elements like:
      - Account/card number (often partially masked)
      - Statement period/date
      - Payment due date
      - Minimum payment due
      - Previous balance
      - New charges/payments
      - Transaction history with merchant names, dates and amounts
      - Credit limit information
      
      Only respond with "true" if you are confident this is a credit card statement, or "false" otherwise.`;
    
    // Prepare content blocks for Claude
    const contentBlocks: any[] = [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdfBase64
        }
      }
    ];
    
    // Call Claude API
    const aiResponse = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 10, // We only need a short response
      system: systemPrompt,
      messages: [{
        role: "user",
        content: contentBlocks
      }]
    });
    
    // Extract response text
    let responseText = '';
    if (aiResponse.content && aiResponse.content.length > 0) {
      const firstContent = aiResponse.content[0];
      responseText = 'text' in firstContent ? firstContent.text.toLowerCase().trim() : '';
    }
    
    console.log(`[Document Detection] AI detection result for ${fileName}: "${responseText}"`);
    
    // Return true if Claude says this is a credit card statement
    return responseText === 'true';
  } catch (error) {
    console.error("[Document Detection] Error in AI detection of credit card statement:", error);
    // Fall back to false if AI fails
    return false;
  }
}

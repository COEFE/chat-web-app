/**
 * Enhanced Credit Card Agent Methods
 * This file contains the enhanced methods that should replace the existing ones in creditCardAgent.ts
 * 
 * INTEGRATION INSTRUCTIONS:
 * 1. Add the imports to the top of creditCardAgent.ts
 * 2. Replace the processRequest method with the enhanced version below
 * 3. Replace the canHandle method with the enhanced version below
 */

// NEW IMPORTS TO ADD TO creditCardAgent.ts:
/*
import { 
  extractTransactionWithAI, 
  isDirectTransactionRequest 
} from "./creditCardTransactionExtractor";
import { handleDirectTransactionRecording } from "./creditCardDirectTransactionHandler";
import { isCreditCardQuery } from "./creditCardDetection";
*/

import { AgentContext, AgentResponse } from "@/types/agents";
import { 
  extractTransactionWithAI, 
  isDirectTransactionRequest 
} from "./creditCardTransactionExtractor";
import { handleDirectTransactionRecording } from "./creditCardDirectTransactionHandler";
import { isCreditCardQuery } from "./creditCardDetection";

/**
 * ENHANCED processRequest method - replace the existing one in CreditCardAgent class
 */
export async function enhancedProcessRequest(
  this: any, // 'this' will be the CreditCardAgent instance
  context: AgentContext
): Promise<AgentResponse> {
  try {
    const query = context.query.trim();
    console.log(`[CreditCardAgent] Processing query: ${query}`);

    // Step 1: Check if this is a direct transaction request using AI
    console.log(`[CreditCardAgent] Checking if query requests transaction processing: "${query.toLowerCase()}"`);
    
    const directTransactionCheck = await isDirectTransactionRequest(query, this.anthropic);
    
    console.log(`[CreditCardAgent] Direct transaction check result:`, directTransactionCheck);
    
    if (directTransactionCheck.isDirectTransaction && directTransactionCheck.confidence > 0.6) {
      console.log(`[CreditCardAgent] Detected direct transaction request with ${directTransactionCheck.confidence} confidence: ${directTransactionCheck.reasoning}`);
      return await handleDirectTransactionRecording(context, query);
    }

    // Step 2: Check if we have a PDF document context (from agent-chat route)
    if (
      context.documentContext &&
      context.documentContext.type === "pdf" &&
      context.documentContext.content
    ) {
      console.log(
        `[CreditCardAgent] Processing PDF document: ${context.documentContext.name}`
      );

      // Extract the PDF content and use it as the query
      const enhancedQuery = `Credit card statement from PDF: ${context.documentContext.name}\n\n${query}`;

      // Process the statement with the enhanced query
      return this.processStatement(context, enhancedQuery);
    }

    // Step 3: Check if this is a credit card statement using existing method
    if (this.isCreditCardStatement(query)) {
      console.log(`[CreditCardAgent] Detected credit card statement query, processing with existing method`);
      return this.processStatement(context, query);
    }

    // Step 4: Default response if no specific intent is matched
    return {
      success: false,
      message:
        "I'm the Credit Card Agent and can help you process credit card statements or record individual transactions like refunds and chargebacks. Please provide a credit card statement or transaction details for me to analyze.",
      data: { sources: [] },
    };
  } catch (error) {
    console.error("[CreditCardAgent] Error processing request:", error);
    return {
      success: false,
      message: "An error occurred while processing your request.",
      data: { sources: [] },
    };
  }
}

/**
 * ENHANCED canHandle method - replace the existing one in CreditCardAgent class
 */
export async function enhancedCanHandle(
  this: any, // 'this' will be the CreditCardAgent instance
  query: string
): Promise<boolean> {
  try {
    console.log(`[CreditCardAgent] Enhanced canHandle checking query: "${query}"`);
    
    // Use AI-enhanced detection that includes refunds, transactions, and statements
    const isDirectTransaction = await isDirectTransactionRequest(query, this.anthropic);
    const isCreditCardRelated = isCreditCardQuery(query);
    const isStatement = this.isCreditCardStatement(query);
    
    console.log(`[CreditCardAgent] canHandle analysis:`, {
      isDirectTransaction: isDirectTransaction.isDirectTransaction,
      confidence: isDirectTransaction.confidence,
      isCreditCardRelated,
      isStatement,
      reasoning: isDirectTransaction.reasoning
    });
    
    const canHandle = isDirectTransaction.isDirectTransaction || 
                     isCreditCardRelated || 
                     isStatement;
    
    console.log(`[CreditCardAgent] canHandle result: ${canHandle}`);
    return canHandle;
  } catch (error) {
    console.error(`[CreditCardAgent] Error in enhanced canHandle:`, error);
    // Fallback to existing method
    return this.isCreditCardStatement(query);
  }
}

/**
 * Quick integration function - call this to apply the enhancements
 */
export function applyCreditCardAgentEnhancements(creditCardAgentInstance: any) {
  // Replace the methods
  creditCardAgentInstance.processRequest = enhancedProcessRequest.bind(creditCardAgentInstance);
  creditCardAgentInstance.canHandle = enhancedCanHandle.bind(creditCardAgentInstance);
  
  console.log(`[CreditCardAgent] Applied AI-powered enhancements for direct transaction recording`);
}

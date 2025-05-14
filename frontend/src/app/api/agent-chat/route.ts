import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';
import { AccountingOrchestrator } from '@/lib/agents/orchestrator';
import { GLAgent } from '@/lib/agents/glAgent';
import { APAgent } from '@/lib/agents/apAgent';
import { InvoiceAgent } from '@/lib/agents/invoiceAgent';
import { ReconciliationAgent } from '@/lib/agents/reconciliationAgent';
import { logAuditEvent } from '@/lib/auditLogger';
import Anthropic from '@anthropic-ai/sdk';
import { isExcelFile, parseExcelToText } from '@/lib/excelParser';
import { processVendorBillsFromExcel } from '@/lib/excelDataProcessor';
import { AgentMessage } from '@/types/agents';

// Interface for file attachments
interface FileAttachment {
  name: string;
  type: string;
  base64Data: string;
  size: number;
}

// Extend AgentMessage with attachments
interface ExtendedAgentMessage extends AgentMessage {
  attachments?: FileAttachment[];
}

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
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }
    
    const idToken = authorizationHeader.split('Bearer ')[1];
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    userId = decodedToken.uid;
    
    console.log(`User authenticated: ${userId}`);
  } catch (authError) {
    console.error("Authentication error:", authError);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 401 }
    );
  }

  // 2. Parse the request body
  let query: string;
  let conversationId: string;
  let messages: ExtendedAgentMessage[] | undefined;
  let documentContext: any;
  let attachments: FileAttachment[] | undefined;

  try {
    // Parse JSON request body
    const body = await req.json();
    
    // Extract fields
    query = body.query || '';
    conversationId = body.conversationId || `user-${userId}-${Date.now()}`;
    messages = Array.isArray(body.messages) ? body.messages : [];
    documentContext = body.documentContext || null;
    attachments = body.attachments;
    
    if (!query.trim() && !attachments?.length) {
      return NextResponse.json(
        { error: "Query cannot be empty if no attachments are provided" },
        { status: 400 }
      );
    }
  } catch (parseError) {
    console.error("Error parsing request body:", parseError);
    return NextResponse.json(
      { error: "Invalid request format" },
      { status: 400 }
    );
  }
  
  // Log the user's query for future reference
  console.log('[Agent-Chat API] Processing user query:', query);
  
  // For context enhancement, we'll use the messages history provided in the request
  // This simplifies the implementation while still providing conversation context
  let similarConversations = '';
  try {
    console.log('[Agent-Chat API] Using message history for context');
    
    // Use the most recent messages (up to 3) for context
    if (messages && messages.length > 0) {
      const recentMessages = messages.slice(-3);
      console.log(`[Agent-Chat API] Using ${recentMessages.length} recent messages for context`);
      
      similarConversations = recentMessages.map((msg: ExtendedAgentMessage) => {
        const rolePrefix = msg.role === 'user' ? 'User' : 'Assistant';
        return `${rolePrefix}: ${msg.content}`;
      }).join('\n\n');
    }
  } catch (error) {
    console.error('[Agent-Chat API] Error processing message history:', error);
    // Non-critical - continue execution even if processing fails
  }

  try {
    // Log audit event
    await logAuditEvent({
      user_id: userId,
      action_type: 'CHAT_REQUEST',
      entity_type: 'CONVERSATION',
      entity_id: conversationId,
      context: {
        query,
        hasDocumentContext: !!documentContext,
        messageCount: messages?.length || 0,
        agentId: 'agent_api'
      },
      status: 'ATTEMPT',
      timestamp: new Date().toISOString()
    });

    // 5. Process the request through the orchestrator
    // If there are PDF attachments, process them directly with Claude instead of using the orchestrator
    // Make sure messages are valid AgentMessage objects
    let enhancedMessages: AgentMessage[] = (messages || []).map(msg => {
      const { attachments, ...agentMsg } = msg;
      return agentMsg;
    });
    
    // If we have similar conversations, modify the user query to include the context
    if (similarConversations && similarConversations.length > 0) {
      console.log(`[Agent-Chat API] Enhancing user query with similar conversations context`);
      
      // For now, just prepend to the last message
      if (enhancedMessages.length > 0) {
        const lastMessageIndex = enhancedMessages.length - 1;
        if (enhancedMessages[lastMessageIndex].role === 'user') {
          // Add context to user's message
          enhancedMessages[lastMessageIndex].content = 
            `${enhancedMessages[lastMessageIndex].content}\n\n` +
            `Consider these relevant past messages for context:\n${similarConversations}`;
        }
      }
    }
    
    // Check if the query is about creating vendors or bills from Excel data
    const isVendorBillCreationRequest = (context: { query: string }): boolean => {
      const query = context.query.toLowerCase();
      const hasActionKeywords = (
        query.includes('create') || 
        query.includes('add') || 
        query.includes('import') || 
        query.includes('upload') || 
        query.includes('process') ||
        query.includes('generate')
      );
      
      const hasEntityKeywords = (
        query.includes('vendor') || 
        query.includes('supplier') || 
        query.includes('bill') || 
        query.includes('invoice')
      );
      
      const hasValidAttachment = !!(attachments && 
        attachments.length > 0 && 
        isExcelFile(attachments[0].name, attachments[0].type));
      
      return hasActionKeywords && hasEntityKeywords && hasValidAttachment;
    };
    
    // Handle the request - determine if we should use direct Claude API for PDF processing
    let result: {
      success: boolean;
      message: string;
      agentId?: string;
      sourceDocuments?: any;
      data?: any;
    };
    
    // Check if this is a request to process vendor/bill data from Excel
    const isVendorBillRequest = isVendorBillCreationRequest({ query }) === true;
    
    if (isVendorBillRequest && attachments && attachments.length > 0 && isExcelFile(attachments[0].name, attachments[0].type)) {
      console.log(`[Agent-Chat API] Processing vendor/bill creation from Excel file: ${attachments[0].name}`);
      
      try {
        // Process the Excel file to create vendors and bills
        const processingResult = await processVendorBillsFromExcel(
          attachments[0].base64Data,
          attachments[0].name,
          userId
        );
        
        // Format a detailed response
        const vendorsList = processingResult.createdVendors.map(v => `- ${v.name} (ID: ${v.id})`).join('\n');
        const billsList = processingResult.createdBills.map(b => `- Bill #${b.bill_number} for $${b.total_amount} (ID: ${b.id})`).join('\n');
        const errorsList = processingResult.errors.length > 0 ? `\n\nWarnings/Errors:\n${processingResult.errors.map(e => `- ${e}`).join('\n')}` : '';
        
        const responseMessage = `## Excel Processing Results\n\n${processingResult.message}\n\n` +
          (processingResult.createdVendors.length > 0 ? `### Created Vendors:\n${vendorsList}\n\n` : '') +
          (processingResult.createdBills.length > 0 ? `### Created Bills:\n${billsList}\n\n` : '') +
          errorsList +
          `\n\nThe data has been successfully imported into your accounting system. You can view and edit the created items in the Accounts Payable section.`;
        
        // Return the result without going through Claude
        result = {
          success: processingResult.success,
          message: responseMessage,
          agentId: "excel_processor",
          data: {
            createdVendors: processingResult.createdVendors,
            createdBills: processingResult.createdBills
          }
        };
      } catch (error) {
        console.error("[Agent-Chat API] Error processing Excel data for vendors/bills:", error);
        result = {
          success: false,
          message: `Failed to process the Excel file for vendor/bill creation: ${error instanceof Error ? error.message : String(error)}\n\nPlease check the file format and try again.`,
          agentId: "excel_processor"
        };
      }
    }
    else if (attachments && attachments.length > 0) {
      console.log(`[Agent-Chat API] Processing request with ${attachments.length} attachments`);
      
      // Use Claude's API directly for PDF document processing
      try {
        // Configure Anthropic client
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY || "",
        });
        
        // Prepare content blocks for Claude
        const contentBlocks: any[] = [];
        
        // Add the user's query as a text block
        if (query && query.trim()) {
          contentBlocks.push({
            type: "text",
            text: query
          });
        }
        
        // Add content blocks for each attachment
        for (const attachment of attachments) {
          // Log attachment info for troubleshooting
          console.log(`[Agent-Chat API] Processing attachment: ${attachment.name}, type: ${attachment.type}`);
          
          // Get file extension for reference
          const ext = attachment.name.split('.').pop()?.toLowerCase();
          
          // Handle different file types accordingly
          if (ext === 'pdf' || attachment.type === 'application/pdf') {
            // PDF files can be processed directly as documents
            console.log(`[Agent-Chat API] Processing as PDF document: ${attachment.name}`);
            contentBlocks.push({
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: attachment.base64Data
              }
            });
          } else if (isExcelFile(attachment.name, attachment.type)) {
            // Process Excel files - convert to text format for Claude
            console.log(`[Agent-Chat API] Processing Excel file: ${attachment.name}`);
            
            try {
              // Parse the Excel file into a text representation
              const excelText = await parseExcelToText(attachment.base64Data, attachment.name);
              
              // Add the parsed Excel content as text
              contentBlocks.push({
                type: "text",
                text: excelText
              });
              
              console.log(`[Agent-Chat API] Successfully parsed Excel file: ${attachment.name}`);
            } catch (error) {
              console.error(`[Agent-Chat API] Error parsing Excel file:`, error);
              
              // Add error message as fallback
              contentBlocks.push({
                type: "text",
                text: `## Excel File Processing Error\n\nThere was an error processing the Excel file "${attachment.name}". ` +
                     `Please upload the file again or try with a different format.\n\nError details: ${error instanceof Error ? error.message : 'Unknown error'}`
              });
            }
          } else if (attachment.type.startsWith('image/')) {
            // For images, we can use document vision
            console.log(`[Agent-Chat API] Processing as image: ${attachment.name}`);
            contentBlocks.push({
              type: "document",
              source: {
                type: "base64",
                media_type: attachment.type,
                data: attachment.base64Data
              }
            });
            contentBlocks.push({
              type: "text",
              text: `This is an image file (${attachment.name}). I've uploaded this for you to analyze.`
            });
          } else {
            // For other files (Word docs, etc.), use a simple text description approach
            let fileDescription = '';
            if (ext === 'docx' || ext === 'doc') {
              fileDescription = `## Word Document: ${attachment.name}\n\nThis is a Word document that I've uploaded for analysis.`;
            } else {
              fileDescription = `## Document: ${attachment.name} (${ext?.toUpperCase() || 'unknown format'})\n\nI've uploaded this file for your analysis.`;
            }
            
            console.log(`[Agent-Chat API] Processing as text: ${attachment.name}`);
            contentBlocks.push({
              type: "text",
              text: fileDescription + "\n\nPlease analyze this file based on its name and any context I provide about it."
            });
          }
        }
        
        // Create a system prompt for Claude
        const systemPrompt = `You are an AI accounting assistant with expertise in analyzing financial documents.
          Answer the user's question about the uploaded document(s) as thoroughly as possible.
          If you cannot read or analyze the document properly, explain the issue clearly and note
          the limitation instead of making assumptions. End your response with specific actions or insights based on 
          the document contents.
          
          Context about previous messages and similar conversations: ${similarConversations}`;
        
        const aiResponse = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 4000,
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
          responseText = 'text' in firstContent ? firstContent.text : JSON.stringify(firstContent);
        }
        
        // Format the result to match the orchestrator's output
        result = {
          success: true,
          message: responseText,
          agentId: "pdf_analysis", // Identify this as a PDF analysis response
          sourceDocuments: null
        };
      } catch (error) {
        console.error("[Agent-Chat API] Error processing PDF with Claude:", error);
        // Fall back to the orchestrator if Claude direct API fails
        result = await orchestrator.processRequest({
          userId,
          query, // Use the original query without modification
          conversationId: conversationId, // Use consistent conversationId
          previousMessages: enhancedMessages, // Use enhanced messages with similar conversations as context
          documentContext,
          token: authorizationHeader.split('Bearer ')[1] // Pass the token for API calls that need auth
        });
      }
    } else {
      // No PDF attachments, use the regular orchestrator flow
      result = await orchestrator.processRequest({
        userId,
        query, // Use the original query without modification
        conversationId: conversationId, // Use consistent conversationId
        previousMessages: enhancedMessages, // Use enhanced messages with similar conversations as context
        documentContext,
        token: authorizationHeader.split('Bearer ')[1] // Pass the token for API calls that need auth
      });
    }

    // Log audit event for successful response
    await logAuditEvent({
      user_id: userId,
      action_type: 'CHAT_RESPONSE',
      entity_type: 'CONVERSATION',
      entity_id: conversationId,
      context: {
        success: true,
        messageLength: result.message.length,
        agentId: result.agentId || 'agent_api',
      },
      status: 'SUCCESS',
      timestamp: new Date().toISOString()
    });

    // Return the final response
    return NextResponse.json({
      message: result.message,
      success: result.success,
      data: result.data,
      conversationId: conversationId // Ensure the client has a consistent conversation ID
    });
  } catch (error) {
    console.error("Error processing agent chat request:", error);
    
    // Log audit event for failed response
    await logAuditEvent({
      user_id: userId,
      action_type: 'CHAT_RESPONSE',
      entity_type: 'CONVERSATION', 
      entity_id: conversationId,
      context: {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      status: 'FAILURE',
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      { error: "Failed to process chat request" }, 
      { status: 500 }
    );
  }
}

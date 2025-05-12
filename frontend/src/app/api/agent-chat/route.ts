import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';
import { AccountingOrchestrator } from '@/lib/agents/orchestrator';
import { GLAgent } from '@/lib/agents/glAgent';
import { APAgent } from '@/lib/agents/apAgent';
import { InvoiceAgent } from '@/lib/agents/invoiceAgent';
import { ReconciliationAgent } from '@/lib/agents/reconciliationAgent';
import { logAuditEvent } from '@/lib/auditLogger';
import { storeChatMessageWithEmbedding, ChatEmbedding, findSimilarChatMessages } from '@/lib/chatEmbeddings';
import Anthropic from '@anthropic-ai/sdk';
import { isExcelFile, parseExcelToText } from '@/lib/excelParser';

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
  const { query, messages, conversationId, documentContext, attachments } = body;
  
  // Allow empty query if attachments are present (user might just upload a document)
  if ((!query || typeof query !== 'string') && (!attachments || !attachments.length)) {
    return NextResponse.json(
      { error: "Missing 'query' or attachments in request body" }, 
      { status: 400 }
    );
  }
  
  // Validate PDF attachments if any
  if (attachments && attachments.length > 0) {
    for (const attachment of attachments) {
      // Accepted file types for Claude
      const acceptedTypes = [
        'application/pdf',                    // PDF
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', // Images
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',      // XLSX
        'text/plain', 'text/csv', 'application/rtf'                              // Text formats
      ];
      
      // Validate file type
      if (!acceptedTypes.includes(attachment.type)) {
        return NextResponse.json(
          { error: 'Unsupported file type. Please upload PDF, Word, Excel, or common image formats.' },
          { status: 400 }
        );
      }
      
      // Check PDF size (Claude limit is 32MB)
      const base64Data = attachment.base64Data;
      if (base64Data) {
        // Estimate file size: base64 string is ~33% larger than the actual file
        const estimatedSizeInBytes = Math.ceil((base64Data.length * 3) / 4);
        if (estimatedSizeInBytes > 32 * 1024 * 1024) { // 32MB in bytes
          return NextResponse.json(
            { error: `PDF attachment exceeds 32MB limit: ${(estimatedSizeInBytes / (1024 * 1024)).toFixed(2)}MB` },
            { status: 400 }
          );
        }
      }
    }
  }
  
  // Store user query in vector database for future reference
  const chatId = conversationId || `user-${userId}-${Date.now()}`;
  let userMessageId: string | undefined;
  try {
    console.log(`[Agent-Chat API] Storing user query in vector database`);
    const chatEmbedding: ChatEmbedding = {
      user_id: userId,
      conversation_id: chatId,
      message_id: `query-${Date.now()}`,
      role: 'user',
      content: query
    };
    
    const storedEmbedding = await storeChatMessageWithEmbedding(chatEmbedding);
    if (storedEmbedding) {
      userMessageId = storedEmbedding.message_id;
      console.log(`[Agent-Chat API] Successfully stored user query in vector database with ID ${storedEmbedding.id}`);
    } else {
      console.warn(`[Agent-Chat API] Unable to store user query in vector database`);
    }
  } catch (vectorErr) {
    console.error('[Agent-Chat API] Error storing user query in vector database:', vectorErr);
    // Continue even if vector storage fails
  }
  
  // Retrieve similar past conversations to enhance context
  let similarConversations = '';
  try {
    console.log(`[Agent-Chat API] Retrieving similar past conversations for enhanced context`);
    const similarMessages = await findSimilarChatMessages(query, userId, 3, 0.7);
    
    if (similarMessages.length > 0) {
      console.log(`[Agent-Chat API] Found ${similarMessages.length} similar past messages for context`);
      similarConversations = '\n\n### Recent Related Conversations:\n';
      
      // Group by conversation
      const conversationMap = new Map<string, ChatEmbedding[]>();
      similarMessages.forEach(msg => {
        if (!conversationMap.has(msg.conversation_id)) {
          conversationMap.set(msg.conversation_id, []);
        }
        conversationMap.get(msg.conversation_id)?.push(msg);
      });
      
      // Format conversations
      conversationMap.forEach((messages, conversationId) => {
        // Sort messages by created_at
        messages.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
        
        similarConversations += `\nConversation ${conversationId.substring(0, 8)}:\n`;
        messages.forEach(msg => {
          similarConversations += `${msg.role === 'user' ? 'User' : 'Agent'}: ${msg.content.substring(0, 300)}${msg.content.length > 300 ? '...' : ''}\n`;
        });
      });
    } else {
      console.log(`[Agent-Chat API] No similar past conversations found`);
    }
  } catch (vectorErr) {
    console.error('[Agent-Chat API] Error retrieving similar messages from vector database:', vectorErr);
    // Continue without similar messages if there's an error
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
    let enhancedMessages = [...(messages || [])];
    
    // If we have similar conversations, modify the user query to include the context
    // We can't use system messages with Anthropic in the messages array
    if (similarConversations && similarConversations.length > 0) {
      console.log(`[Agent-Chat API] Enhancing user query with similar conversations context`);
      
      // Get the most recent user message or create one if there are no messages
      const lastUserMessageIndex = enhancedMessages.length > 0 ? 
        enhancedMessages.findLastIndex(msg => msg.role === 'user') : -1;
      
      if (lastUserMessageIndex >= 0) {
        // Add context to the user's existing message
        const originalMessage = enhancedMessages[lastUserMessageIndex].content;
        enhancedMessages[lastUserMessageIndex].content = 
          `${originalMessage}\n\n(For reference, here are some similar past conversations that might be relevant: ${similarConversations})`;
      }
    } else {
      console.log(`[Agent-Chat API] No similar conversations to add as context`);
    }
    
    let result;

    // If there are PDF attachments, handle them directly with Claude's API
    if (attachments && attachments.length > 0) {
      console.log(`[Agent-Chat API] Processing request with ${attachments.length} PDF attachments`);  
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
      });
      
      // Prepare content blocks for Claude
      const contentBlocks: any[] = [];
      
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
      
      // Add the text message if it exists
      if (query) {
        contentBlocks.push({
          type: "text",
          text: query
        });
      }

      try {
        // Call Claude directly with the PDF attachments
        const systemPrompt = `You are an expert accounting assistant specialized in analyzing financial documents, invoices, 
          receipts, and other accounting materials. When presented with documents, analyze them carefully and provide 
          clear, accurate information about their contents. Focus on identifying key financial information, dates, amounts, 
          parties involved, and any accounting-relevant details. If you're uncertain about any information, acknowledge 
          the limitation instead of making assumptions. End your response with specific actions or insights based on 
          the document contents.
          
          Context about previous messages and similar conversations: ${Array.isArray(similarConversations) ? similarConversations.join('\n') : (similarConversations || 'None available')}`;
        
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
          conversationId: chatId, // Use consistent chatId
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
        conversationId: chatId, // Use consistent chatId
        previousMessages: enhancedMessages, // Use enhanced messages with similar conversations as context
        documentContext,
        token: authorizationHeader.split('Bearer ')[1] // Pass the token for API calls that need auth
      });
    }

    // 6. Store agent response in vector database
    try {
      console.log(`[Agent-Chat API] Storing agent response in vector database`);
      const agentEmbedding: ChatEmbedding = {
        user_id: userId,
        conversation_id: chatId,
        message_id: `response-${Date.now()}`,
        role: 'assistant',
        content: result.message
      };
      
      const storedEmbedding = await storeChatMessageWithEmbedding(agentEmbedding);
      if (storedEmbedding) {
        console.log(`[Agent-Chat API] Successfully stored agent response in vector database with ID ${storedEmbedding.id}`);
      } else {
        console.warn(`[Agent-Chat API] Unable to store agent response in vector database`);
      }
    } catch (vectorErr) {
      console.error('[Agent-Chat API] Error storing agent response in vector database:', vectorErr);
      // Continue even if vector storage fails
    }
    
    // 7. Log successful completion
    await logAuditEvent({
      user_id: userId,
      action_type: "CHAT_RESPONSE",
      entity_type: "CONVERSATION",
      entity_id: chatId,
      context: { 
        success: result.success,
        messageLength: result.message.length,
        agentId: "agent_api"
      },
      status: "SUCCESS",
      timestamp: new Date().toISOString()
    });

    // 8. Return the response
    return NextResponse.json({
      message: result.message,
      success: result.success,
      data: result.data,
      conversationId: chatId // Ensure the client has a consistent conversation ID
    });
  } catch (error) {
    console.error("Error processing agent chat request:", error);
    
    // Log the error
    await logAuditEvent({
      user_id: userId,
      action_type: "CHAT_RESPONSE",
      entity_type: "CONVERSATION",
      entity_id: chatId,
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

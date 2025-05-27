import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebaseAdminConfig';
import { AccountingOrchestrator } from '@/lib/agents/orchestrator';
import { GLAgent } from '@/lib/agents/glAgent';
import { APAgent } from '@/lib/agents/apAgent';
import { InvoiceAgent } from '@/lib/agents/invoiceAgent';
import { ReconciliationAgent } from '@/lib/agents/reconciliationAgent';
import { CreditCardAgent } from '@/lib/agents/creditCardAgent';
import { ReceiptAgent } from '@/lib/agents/ReceiptAgent';
import { logAuditEvent } from '@/lib/auditLogger';
import Anthropic from '@anthropic-ai/sdk';
import { isExcelFile, parseExcelToText } from '@/lib/excelParser';
import { processVendorBillsFromExcel } from '@/lib/excelDataProcessor';
import { AgentMessage, DocumentContext, AgentResponse } from '@/types/agents';
import { detectCreditCardStatement, isDocumentContentQuery } from '@/lib/documentDetection';

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

// Register the Credit Card Agent
const creditCardAgent = new CreditCardAgent();
orchestrator.registerAgent(creditCardAgent);

// Register the Receipt Agent
const receiptAgent = new ReceiptAgent();
orchestrator.registerAgent(receiptAgent);

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
    conversationId = body.conversationId || `conv-${Date.now()}`;
    messages = body.messages;
    documentContext = body.documentContext;
    attachments = body.attachments;
    
    console.log(`[Agent-Chat API] Request details:`);
    console.log(`[Agent-Chat API] - Query: "${query}"`);
    console.log(`[Agent-Chat API] - ConversationId: ${conversationId}`);
    console.log(`[Agent-Chat API] - Has attachments: ${!!attachments && attachments.length > 0}`);
    if (attachments && attachments.length > 0) {
      console.log(`[Agent-Chat API] - Attachment details: ${attachments[0].name} (${attachments[0].type})`);
    }
    console.log(`[Agent-Chat API] - Has documentContext: ${!!documentContext}`);
    if (documentContext) {
      console.log(`[Agent-Chat API] - DocumentContext type: ${documentContext.type}`);
    }
    
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
    let result: AgentResponse;
    
    // Check if this is a request to process vendor/bill data from Excel
    const isVendorBillRequest = isVendorBillCreationRequest({ query }) === true;
    
    // Check if this is a request with a PDF attachment
    const hasPdfAttachment = !!(attachments && 
      attachments.length > 0 && 
      (attachments[0].type === 'application/pdf' || attachments[0].name.toLowerCase().endsWith('.pdf')));
    
    // Process the request based on attachment type and content
    if (isVendorBillRequest && attachments && attachments.length > 0 && isExcelFile(attachments[0].name, attachments[0].type)) {
      // Handle Excel file for vendor/bill processing
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
    else if (hasPdfAttachment && attachments && attachments.length > 0) {
      // Handle PDF attachments with potential AI-powered credit card statement detection
      console.log(`[Agent-Chat API] Processing PDF attachment: ${attachments[0].name}`);
      
      // Check if this is a content question rather than a processing request using AI
      const isContentQuestion = await isDocumentContentQuery(query);
      console.log(`[Agent-Chat API] AI query analysis - is content question: ${isContentQuestion}`);
      
      if (isContentQuestion) {
        // For content questions, we'll use Claude to analyze the document directly
        try {
          console.log(`[Agent-Chat API] Handling as document content question: "${query}"`);
          
          // Configure Anthropic client for document analysis
          const anthropic = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY || "",
          });
          
          // Prepare content blocks for Claude
          const contentBlocks: any[] = [];
          
          // Add the user's query as a text block
          contentBlocks.push({
            type: "text",
            text: `I've uploaded a document and want to understand its contents. ${query}`
          });
          
          // Add the PDF document as a content block
          contentBlocks.push({
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: attachments[0].base64Data
            }
          });
          
          // Call Claude API with the document for content analysis
          const aiResponse = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 4000,
            system: `You are an AI assistant specializing in document analysis.
              The user has uploaded a document and wants to know about its contents.
              Analyze the document thoroughly and answer their question about what's in it.
              If it's a credit card statement, describe the key details (issuer, balance, transactions) but don't process it.
              Be informative, detailed and helpful in explaining what the document contains.`,
            messages: [{
              role: "user",
              content: contentBlocks
            }]
          });
          
          // Extract response text
          let responseText = '';
          if (aiResponse.content && aiResponse.content.length > 0) {
            const firstContent = aiResponse.content[0];
            responseText = 'text' in firstContent ? firstContent.text : '';
          }
          
          // Return the content analysis
          result = {
            success: true,
            message: responseText,
            agentId: "document_analyzer"
          };
          
          return NextResponse.json(result);
        } catch (error) {
          console.error("[Agent-Chat API] Error analyzing document content:", error);
          // Fall through to regular processing if content analysis fails
        }
      }
      
      try {
        // Use AI to detect if this is a credit card statement
        const isCreditCardStatement = await detectCreditCardStatement(
          attachments[0].base64Data,
          attachments[0].name
        );
        
        if (isCreditCardStatement) {
          console.log(`[Agent-Chat API] AI detected credit card statement in PDF: ${attachments[0].name}`);
          
          // Since this is confirmed to be a credit card statement, route directly to the CreditCardAgent
          // instead of going through the orchestrator which might route to AP agent first
          
          // Get the CreditCardAgent directly
          const creditCardAgent = orchestrator.getAgentById('credit_card_agent');
          
          if (creditCardAgent) {
            console.log(`[Agent-Chat API] Routing credit card statement directly to CreditCardAgent`);
            
            // Extract text content from PDF for the CreditCardAgent
            let pdfContent = `This is a credit card statement from the attached PDF file: ${attachments[0].name}\n\n`;
            
            // If the user is asking a specific question about the statement, include it
            // Otherwise use the default processing message
            if (query && !query.toLowerCase().includes('process') && !query.toLowerCase().includes('analyze')) {
              pdfContent += `The user is asking: "${query}"`;
            } else {
              pdfContent += `Please process this statement and record any transactions.`;
            }
            
            // Process directly with CreditCardAgent
            // IMPORTANT: Structure the context exactly like the working test implementation
            result = await creditCardAgent.processRequest({
              userId,
              query: pdfContent, // Use the PDF content as the query
              conversationId: conversationId,
              previousMessages: enhancedMessages,
              documentContext: {
                type: attachments[0].type, // Use actual MIME type like 'image/jpeg'
                name: attachments[0].name,
                content: attachments[0].base64Data,
                metadata: {
                  mimeType: attachments[0].type
                }
              },
              additionalContext: {
                forceTransactionProcessing: true,
                // Match the exact structure from the working test implementation
                // This is key to ensuring the extracted data is properly passed to the next step
                statementInfo: null, // Will be filled by the agent during extraction
                transactions: [], // Will be filled by the agent during extraction
                documentContext: {
                  extractedData: {
                    statementInfo: null // This will be filled by the agent during extraction
                  }
                }
              },
              token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
            });
            
            // Return the result immediately - we've handled the credit card statement directly
            return NextResponse.json(result);
          } else {
            // If CreditCardAgent is not available for some reason, log the error
            console.error(`[Agent-Chat API] Could not find CreditCardAgent to process statement`);
          }
          
          // If we reach here, we either couldn't find the CreditCardAgent or there was an error
          // Fall back to using the orchestrator for this credit card statement
          console.log(`[Agent-Chat API] Falling back to orchestrator for credit card statement processing`);
          
          // Extract text content from PDF for the CreditCardAgent
          const pdfContent = `This is a credit card statement from the attached PDF file: ${attachments[0].name}\n\n` +
                         `Please process this statement and record any transactions.`;
                         
          // Route through the orchestrator
          result = await orchestrator.processRequest({
            userId,
            query: pdfContent,
            conversationId,
            previousMessages: enhancedMessages,
            documentContext: {
              type: attachments[0].type, // Use actual MIME type like 'image/jpeg'
              name: attachments[0].name,
              content: attachments[0].base64Data,
              metadata: {
                mimeType: attachments[0].type
              }
            },
            token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
          });
          
          return NextResponse.json(result);
        }
        
        // If not a credit card statement, continue with general PDF processing
        console.log(`[Agent-Chat API] Processing general PDF document: ${attachments[0].name}`);
      } catch (error) {
        console.error("[Agent-Chat API] Error during credit card statement AI detection:", error);
        // Continue with normal processing if AI detection fails
      }
      
      // Process the PDF with Claude's general document processing capabilities
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
        
        // Add the PDF document as a content block
        contentBlocks.push({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: attachments[0].base64Data
          }
        });
        
        // Call Claude API with the document
        const aiResponse = await anthropic.messages.create({
          model: "claude-3-5-sonnet-20240620",
          max_tokens: 4000,
          system: `You are Claude, an AI assistant specialized in accounting and finance. 
            You're helping a user understand their financial documents. 
            Analyze the provided document thoroughly and answer the user's query.
            If the document appears to be a credit card statement, inform the user that you can help them process it.
            Be detailed, accurate, and helpful in your response.`,
          messages: [{
            role: "user",
            content: contentBlocks
          }]
        });
        
        // Extract response text
        let responseText = '';
        if (aiResponse.content && aiResponse.content.length > 0) {
          const firstContent = aiResponse.content[0];
          responseText = 'text' in firstContent ? firstContent.text : '';
        }
        
        // Return the result
        result = {
          success: true,
          message: responseText,
          agentId: "document_processor"
        };
        
        return NextResponse.json(result);
      } catch (error) {
        console.error("[Agent-Chat API] Error processing PDF document:", error);
        
        result = {
          success: false,
          message: `Failed to process the PDF document: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or contact support if the issue persists.`,
          agentId: "document_processor"
        };
        
        return NextResponse.json(result);
      }
    } else if (attachments && attachments.length > 0) {
      // Check if this is a receipt processing request
      const isReceiptRequest = query.toLowerCase().includes('receipt') || 
                              query.toLowerCase().includes('process') ||
                              query.toLowerCase().includes('analyze') ||
                              query.toLowerCase().includes('extract');
      
      // If it's a receipt-related query with image attachment, route to orchestrator
      if (isReceiptRequest && attachments.some(att => att.type.startsWith('image/'))) {
        console.log(`[Agent-Chat API] Receipt query with image detected, routing to orchestrator`);
        result = await orchestrator.processRequest({
          userId,
          query,
          conversationId,
          previousMessages: enhancedMessages,
          documentContext: {
            type: attachments[0].type, // Use actual MIME type like 'image/jpeg'
            name: attachments[0].name,
            content: attachments[0].base64Data,
            metadata: {
              mimeType: attachments[0].type
            }
          },
          token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
        });
        
        return NextResponse.json(result);
      }
      
      // Process other attachments with Claude's API
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
        
        // Process each attachment
        for (const attachment of attachments) {
          // Log attachment info for troubleshooting
          console.log(`[Agent-Chat API] Processing attachment: ${attachment.name}, type: ${attachment.type}`);
          
          // Get file extension for reference
          const ext = attachment.name.split('.').pop()?.toLowerCase();
          
          // Handle different file types accordingly
          if (ext === 'pdf' || attachment.type === 'application/pdf') {
            // PDF files can be processed directly as documents
            console.log(`[Agent-Chat API] Processing PDF document: ${attachment.name}`);
            
            // First check if this is a credit card statement using AI
            try {
              const isCreditCardStatement = await detectCreditCardStatement(
                attachment.base64Data,
                attachment.name
              );
              
              if (isCreditCardStatement) {
                console.log(`[Agent-Chat API] AI detected credit card statement in PDF: ${attachment.name}`);
                
                // Extract text content from PDF for the CreditCardAgent
                const pdfContent = `This is a credit card statement from the attached PDF file: ${attachment.name}\n\n` +
                                `Please process this statement and record any transactions.`;
                
                // Route to the CreditCardAgent via the orchestrator
                result = await orchestrator.processRequest({
                  userId,
                  query: pdfContent, // Use the PDF content as the query
                  conversationId: conversationId,
                  previousMessages: enhancedMessages,
                  documentContext: {
                    type: attachments[0].type, // Use actual MIME type like 'image/jpeg'
                    name: attachment.name,
                    content: attachment.base64Data
                  },
                  token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
                });
                
                // Return the result directly
                return NextResponse.json(result);
              }
              
              // If not a credit card statement, continue with general PDF processing
              console.log(`[Agent-Chat API] Processing as general PDF document: ${attachment.name}`);
            } catch (error) {
              console.error("[Agent-Chat API] Error during credit card statement AI detection:", error);
              // Continue with normal processing if AI detection fails
            }
            
            // Process as normal PDF document if not a credit card statement
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
              type: "image",
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
          agentId: "document_analyzer", // Identify this as a document analysis response
          sourceDocuments: null
        };
        
        return NextResponse.json(result);
      } catch (error) {
        console.error("[Agent-Chat API] Error processing attachments with Claude:", error);
        
        // Fall back to the orchestrator if Claude direct API fails
        try {
          result = await orchestrator.processRequest({
            userId,
            query, // Use the original query without modification
            conversationId: conversationId, // Use consistent conversationId
            previousMessages: enhancedMessages, // Use enhanced messages with similar conversations as context
            documentContext,
            token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
          });
          
          return NextResponse.json(result);
        } catch (orchestratorError) {
          console.error("[Agent-Chat API] Error with orchestrator fallback:", orchestratorError);
          
          result = {
            success: false,
            message: `Failed to process your request: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or contact support if the issue persists.`,
            agentId: "error_handler"
          };
          
          return NextResponse.json(result);
        }
      }
    } else {
      // No PDF attachments, use the regular orchestrator flow
      result = await orchestrator.processRequest({
        userId,
        query, // Use the original query without modification
        conversationId, // Use consistent conversationId
        previousMessages: enhancedMessages, // Use enhanced messages with similar conversations as context
        documentContext,
        token: authorizationHeader ? authorizationHeader.split('Bearer ')[1] : ''
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
    
    // Return an error message
    return NextResponse.json(
      { error: "An error occurred while processing your request", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

import { Agent, AgentContext, AgentResponse } from "@/types/agents";
import { findRelevantGLCodes, mightBeAboutGLCodes } from "@/lib/glUtils";
import { logAuditEvent } from "@/lib/auditLogger";
import { 
  AIJournalEntry, 
  createJournalFromAI, 
  extractJournalEntryFromText, 
  getAccounts, 
  isJournalCreationQuery,
  isJournalPostingQuery, 
  isJournalSummaryQuery,
  isJournalAttachmentQuery,
  isDeleteAttachmentQuery,
  isJournalEditQuery,
  isJournalReversalQuery,
  extractJournalIdFromEditQuery,
  extractJournalIdFromReversalQuery,
  extractJournalEditDetails,
  updateJournalEntry
} from "@/lib/journalUtils";
import Anthropic from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { sql } from "@vercel/postgres";
import axios from "axios";
import FormData from "form-data";

/**
 * GLAgent specializes in handling General Ledger related queries
 * It leverages existing GL functionality to provide accurate GL information
 */
export class GLAgent implements Agent {
  id = "gl_agent";
  name = "General Ledger Agent";
  description = "Handles queries about GL codes, journal entries, and ledger information";
  
  private anthropic: Anthropic;
  private canCreateJournals = true; // Flag to enable/disable journal creation

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
  }

  /**
   * Determine if this agent can handle the given query
   */
  async canHandle(query: string): Promise<boolean> {
    // 1. Check if this is a request about creating GL accounts
    if (query.toLowerCase().includes('create gl account') || query.toLowerCase().includes('add gl account')) {
      console.log("[GLAgent] Detected GL account creation query");
      return true;
    }
    
    // 2. Check if this is a request to delete an attachment from a journal (check BEFORE attachment upload query)
    if (isDeleteAttachmentQuery(query)) {
      console.log("[GLAgent] Detected attachment deletion query");
      return true;
    }
    
    // 3. Check if this is a journal attachment upload request (check this AFTER deletion check but BEFORE journal creation)
    if (isJournalAttachmentQuery(query)) {
      console.log("[GLAgent] Detected journal attachment upload query");
      return true;
    }
    
    // 3. Check if this is a journal posting request
    if (isJournalPostingQuery(query)) {
      console.log("[GLAgent] Detected journal posting query");
      return true;
    }
    
    // 4. Check if this is a journal summary request
    if (isJournalSummaryQuery(query)) {
      console.log("[GLAgent] Detected journal summary query");
      return true;
    }
    
    // 5. Check if this is a journal edit request
    if (isJournalEditQuery(query)) {
      console.log("[GLAgent] Detected journal edit query");
      return true;
    }
    
    // 5. Check if this is a request to create a journal entry (check this AFTER attachment query)
    if (this.canCreateJournals && isJournalCreationQuery(query)) {
      console.log("[GLAgent] Detected journal creation query");
      return true;
    }
    
    // Reuse the existing GL detection logic
    return mightBeAboutGLCodes(query);
  }

  /**
   * Process GL-related requests
   */
  async processRequest(context: AgentContext): Promise<AgentResponse> {
    console.log(`[GLAgent] Processing request: ${context.query}`);
    
    try {
      // 1. Log the start of processing
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "GL_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "ATTEMPT",
        timestamp: new Date().toISOString()
      });
      
      // 2. Check for GL account creation
      if (context.query.toLowerCase().includes('create gl account') || context.query.toLowerCase().includes('add gl account')) {
        // Not implemented here, future enhancement
        return {
          success: true,
          message: "Creating GL accounts isn't supported yet through the chat interface. Please use the Chart of Accounts section in the dashboard."
        };
      }
      
      // 3. Check if this is an attachment deletion request (check FIRST)
      if (isDeleteAttachmentQuery(context.query)) {
        return await this.handleAttachmentDeletion(context);
      }
      
      // 4. Check if this is an attachment upload request (check AFTER deletion)
      if (isJournalAttachmentQuery(context.query)) {
        return await this.handleJournalAttachment(context);
      }
      
      // 4. Check if this is a journal posting request
      if (isJournalPostingQuery(context.query)) {
        return await this.handleJournalPosting(context);
      }
      
      // 5. Check if this is a journal edit request
      if (isJournalEditQuery(context.query)) {
        return await this.handleJournalEdit(context);
      }
      
      // 5.1 Check if this is a journal reversal request
      if (isJournalReversalQuery(context.query)) {
        return await this.handleJournalReversal(context);
      }
      
      // 5. Check if this is a journal summary request
      if (isJournalSummaryQuery(context.query)) {
        return await this.handleJournalSummary(context);
      }
      
      // 6. Check if this is a journal creation request (check this AFTER attachment query)
      if (this.canCreateJournals && isJournalCreationQuery(context.query)) {
        return await this.handleJournalCreation(context);
      }
      
      // 4. Gather relevant GL code information using existing functionality
      const relevantCodes = await findRelevantGLCodes(context.query, 7);
      
      // 5. Format GL codes as context for Claude
      let glCodeContext = "";
      if (relevantCodes.length > 0) {
        glCodeContext = `
Here is information about General Ledger (GL) codes that might help answer the query:
${relevantCodes.map(code => `- ${code.content}`).join('\n')}

Please use this GL code information to help answer the user's question.
`;
      }
      
      // 6. Get active accounts for context
      const accounts = await getAccounts();
      let accountsContext = "";
      
      if (accounts.length > 0) {
        // Only include a sample of accounts to avoid context overload
        const accountSample = accounts.slice(0, 10);
        accountsContext = `
Here are some of the available GL accounts that can be used in journal entries:
${accountSample.map(acct => `- ${acct.code}: ${acct.name} (${acct.account_type})`).join('\n')}

There are ${accounts.length} accounts in total. The above is just a sample.
`;
      }
      
      // 7. Format previous messages for Claude if available
      const messages: MessageParam[] = [];
      
      if (context.previousMessages && context.previousMessages.length > 0) {
        // Format previous messages for Claude
        for (const msg of context.previousMessages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role as "user" | "assistant",
              content: [
                {
                  type: "text",
                  text: msg.content
                }
              ]
            });
          }
        }
      }
      
      // 8. Add current query
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: context.query
          }
        ]
      });
      
      // 9. Create a system prompt with GL expertise
      const systemPrompt = `You are a General Ledger accounting expert. You specialize in:
- Understanding and explaining GL codes
- Creating and explaining journal entries
- Guiding users on proper accounting treatments
- Clarifying accounting principles related to the general ledger

${glCodeContext}${accountsContext}

You can help create journal entries for the accounting system. If the user wants to create a journal entry, format your response with a JSON structure to define the journal entry like this:

\`\`\`json
{
  "memo": "Description of the journal entry",
  "transaction_date": "YYYY-MM-DD",
  "journal_type": "GJ",
  "reference_number": "REF123",
  "lines": [
    {
      "account_code_or_name": "Account Name or Code",
      "description": "Line item description",
      "debit": 100.00,
      "credit": 0
    },
    {
      "account_code_or_name": "Another Account",
      "description": "Another line item",
      "debit": 0,
      "credit": 100.00
    }
  ]
}
\`\`\`

Make sure the journal entry is valid - debits must equal credits. Every line must have either a debit or a credit value (not both).`;
      
      // 10. Get response from Claude with GL expertise
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages
      });
      
      // 8. Log successful completion
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "GL_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { 
          query: context.query,
          relevantCodesCount: relevantCodes.length,
          agentId: this.id
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        message: typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text || '' : '',
        data: {
          relevantGLCodes: relevantCodes
        }
      };
    } catch (error) {
      console.error("[GLAgent] Error processing request:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "PROCESS_QUERY",
        entity_type: "GL_QUERY",
        entity_id: context.conversationId || "unknown",
        context: { query: context.query, agentId: this.id },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: "I encountered an error while processing your GL request. Please try again."
      };
    }
  }
  
  /**
   * Handle journal summary requests from the user
   */
  /**
   * Handle journal posting requests from the user
   * Marks unposted journal entries as posted
   */
  private async handleJournalPosting(context: AgentContext): Promise<AgentResponse> {
    try {
      // Check if the request is for a specific journal ID
      const idMatch = context.query.match(/\b(id|number|#)\s*(\d+)\b/i);
      let journalIds: number[] = [];
      
      if (idMatch && idMatch[2]) {
        // Handle posting a specific journal by ID
        const specificId = parseInt(idMatch[2]);
        console.log(`[GLAgent] Attempting to post specific journal ID: ${specificId}`);
        
        // Check if this journal exists and is unposted
        const journalCheck = await sql`
          SELECT id, is_posted FROM journals 
          WHERE id = ${specificId} AND is_deleted = false
        `;
        
        if (journalCheck.rows.length === 0) {
          return {
            success: false,
            message: `I couldn't find journal entry with ID ${specificId}. It may not exist or has been deleted.`
          };
        }
        
        if (journalCheck.rows[0].is_posted) {
          return {
            success: false,
            message: `Journal entry with ID ${specificId} is already posted.`
          };
        }
        
        // Use only this specific ID
        journalIds = [specificId];
      } else {
        // Handle posting all unposted journals
        const unpostedJournals = await sql`
          SELECT id FROM journals 
          WHERE is_posted = false AND is_deleted = false
          ORDER BY date DESC
        `;
        
        // Check if there are any unposted journals
        if (unpostedJournals.rows.length === 0) {
          return {
            success: true,
            message: "There are no unposted journal entries to post at this time."
          };
        }
        
        // Use all unposted journal IDs
        journalIds = unpostedJournals.rows.map(row => row.id);
      }

      const postedDate = new Date().toISOString();
      let postedCount = 0;

      // Update each journal to mark it as posted
      for (const journalId of journalIds) {
        try {
          // Mark the journal as posted
          await sql`
            UPDATE journals 
            SET is_posted = true
            WHERE id = ${journalId}
          `;
          
          // Log the journal posting action
          await logAuditEvent({
            user_id: context.userId,
            action_type: "POST_JOURNAL",
            entity_type: "JOURNAL",
            entity_id: journalId.toString(),
            context: { postedDate, agentId: this.id },
            status: "SUCCESS",
            timestamp: new Date().toISOString()
          });

          postedCount++;
        } catch (error) {
          console.error(`[GLAgent] Error posting journal ID ${journalId}:`, error);
        }
      }

      // Format response based on results
      let message = "";
      if (postedCount === 0) {
        message = "I was unable to post any journal entries. There may be an issue with the database or permissions.";
      } else if (postedCount < journalIds.length) {
        message = `I successfully posted ${postedCount} out of ${journalIds.length} unposted journal entries. Some entries could not be posted due to errors.`;
      } else {
        message = `Success! I've posted all ${postedCount} unposted journal entries. They will now appear in the posted transactions section.`;
      }

      return {
        success: postedCount > 0,
        message
      };
    } catch (error) {
      console.error("[GLAgent] Error posting journals:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "POST_JOURNALS",
        entity_type: "JOURNALS",
        entity_id: "batch",
        context: { query: context.query, agentId: this.id },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: "I encountered an error while trying to post the journal entries. Please try again later or post them manually through the Transactions page."
      };
    }
  }

  /**
   * Handle journal reversal requests
   */
  private async handleJournalReversal(context: AgentContext): Promise<AgentResponse> {
    console.log("[GLAgent] Handling journal reversal request:", context.query);
    
    try {
      // Extract journal ID from the query
      const journalId = extractJournalIdFromReversalQuery(context.query);
      console.log(`[GLAgent] Extracted journalId for reversal: ${journalId}`);
      
      if (!journalId) {
        return {
          success: false,
          message: "I couldn't determine which journal entry you want to reverse. Please specify the journal number clearly."
        };
      }
      
      // 1. Verify the source journal exists and is posted
      const { rows: journalRows } = await sql`
        SELECT * FROM journals 
        WHERE id = ${journalId} 
        AND is_posted = true 
        AND is_deleted = false
      `;
      
      if (journalRows.length === 0) {
        return {
          success: false,
          message: `Journal #${journalId} doesn't exist, isn't posted, or has been deleted. Only posted journals can be reversed.`
        };
      }
      
      const originalJournal = journalRows[0];
      
      // 2. Get original journal lines
      const { rows: lineRows } = await sql`
        SELECT jl.*, a.code as account_code, a.name as account_name 
        FROM journal_lines jl
        JOIN accounts a ON jl.account_id = a.id
        WHERE jl.journal_id = ${journalId}
        ORDER BY jl.id
      `;
      
      if (lineRows.length === 0) {
        return {
          success: false,
          message: `Journal #${journalId} has no line items to reverse.`
        };
      }
      
      // 3. Create a new journal entry with reversed debits/credits
      const today = new Date().toISOString().split('T')[0];
      const reversalMemo = `Reversal of Journal #${journalId}: ${originalJournal.memo}`;
      
      // 3a. Insert the new journal header with reversal relationship
      const { rows: newJournalRows } = await sql`
        INSERT INTO journals (
          memo, 
          transaction_date, 
          created_by, 
          created_at,
          source,
          reference_number,
          reversal_of_journal_id
        ) VALUES (
          ${reversalMemo}, 
          ${today}, 
          ${context.userId}, 
          NOW(),
          'AI Assistant',
          ${`REV-${journalId}`},
          ${journalId}
        )
        RETURNING id
      `;
      
      const newJournalId = newJournalRows[0].id;
      
      // 3b. Insert reversed line items
      for (const line of lineRows) {
        await sql`
          INSERT INTO journal_lines (
            journal_id,
            account_id,
            description,
            debit,
            credit
          ) VALUES (
            ${newJournalId},
            ${line.account_id},
            ${`Reversal of ${line.description || 'entry'}`},
            ${line.credit}, -- Swap debit and credit
            ${line.debit}   -- Swap debit and credit
          )
        `;
      }
      
      // 3c. Update the original journal with reversed_by_journal_id
      await sql`
        UPDATE journals
        SET reversed_by_journal_id = ${newJournalId}
        WHERE id = ${journalId}
      `;
      
      // Log success
      await logAuditEvent({
        user_id: context.userId,
        action_type: 'JOURNAL_REVERSAL_CREATE',
        entity_type: 'JOURNAL',
        entity_id: newJournalId.toString(),
        context: { 
          original_journal_id: journalId,
          query: context.query 
        },
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      }).catch(err => console.error('Error logging audit event:', err));
      
      return {
        success: true,
        message: `I've created a reversal journal entry (#${newJournalId}) for Journal #${journalId}. The reversal has identical accounts but with debits and credits swapped to offset the original entry. The new journal is in draft status, ready for your review.`
      };
      
    } catch (error) {
      console.error('Error reversing journal:', error);
      
      // Log failure
      await logAuditEvent({
        user_id: context.userId,
        action_type: 'JOURNAL_REVERSAL_CREATE',
        entity_type: 'JOURNAL',
        entity_id: (typeof error === 'object' && error !== null && 'journalId' in error) ? 
          String(error.journalId) : 'unknown',
        context: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          query: context.query 
        },
        status: 'FAILURE',
        timestamp: new Date().toISOString()
      }).catch(err => console.error('Error logging audit event:', err));
      
      return {
        success: false,
        message: `I couldn't reverse the journal: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Handle editing of a journal entry
   */
  private async handleJournalEdit(context: AgentContext): Promise<AgentResponse> {
    console.log("[GLAgent] Handling journal edit request:", context.query);
    console.log("[GLAgent] isJournalEditQuery check:", isJournalEditQuery(context.query));
    
    try {
      // Extract journal ID from the query
      const journalId = extractJournalIdFromEditQuery(context.query);
      console.log(`[GLAgent] Extracted journalId: ${journalId}`);
      
      if (!journalId) {
        return {
          success: false,
          message: "I couldn't determine which journal entry you want to edit. Please specify the journal number."
        };
      }
      
      // Check if journal exists and is in draft status
      const { rows: journalRows } = await sql`
        SELECT id, is_posted, is_deleted FROM journals WHERE id = ${journalId}
      `;
      
      if (journalRows.length === 0) {
        return {
          success: false,
          message: `Journal #${journalId} does not exist.`
        };
      }
      
      const journal = journalRows[0];
      
      if (journal.is_deleted) {
        return {
          success: false,
          message: `Journal #${journalId} has been deleted and cannot be edited.`
        };
      }
      
      if (journal.is_posted) {
        return {
          success: false,
          message: `Journal #${journalId} has already been posted and cannot be edited. Only draft journals can be modified.`
        };
      }
      
      // Extract what changes the user wants to make
      const editDetails = extractJournalEditDetails(context.query);
      console.log(`[GLAgent] Journal ${journalId} edit details:`, JSON.stringify(editDetails));
      
      // Before preparing updates, check the current journal state
      const { rows: currentJournalDetails } = await sql`
        SELECT 
          (SELECT SUM(debit) FROM journal_lines WHERE journal_id = ${journalId}) as total_debit,
          (SELECT SUM(credit) FROM journal_lines WHERE journal_id = ${journalId}) as total_credit
      `;
      
      const currentDebit = parseFloat(currentJournalDetails[0]?.total_debit || '0');
      const currentCredit = parseFloat(currentJournalDetails[0]?.total_credit || '0');
      
      console.log(`[GLAgent] Journal ${journalId} current totals - Debit: ${currentDebit}, Credit: ${currentCredit}`);
      
      // Prepare updates object
      const updates: Parameters<typeof updateJournalEntry>[1] = {};
      
      // Handle different update types
      if (editDetails.field === 'memo') {
        updates.memo = String(editDetails.value);
      } else if (editDetails.field === 'date') {
        updates.date = String(editDetails.value);
      } else if (['amount', 'debit', 'credit'].includes(editDetails.field || '')) {
        // For amount updates, we need to figure out which line to update
        // For now, let's assume we're updating the first line
        const lineUpdates = [];
        
        // Get journal lines to determine what kind of update to make
        const { rows: lines } = await sql`
          SELECT id, debit, credit 
          FROM journal_lines 
          WHERE journal_id = ${journalId}
          ORDER BY id
        `;
        
        if (lines.length === 0) {
          return {
            success: false,
            message: `Journal #${journalId} has no lines to update.`
          };
        }
        
        if (editDetails.field === 'amount') {
          // If we're updating 'amount', we need to maintain balance by updating both sides equally
          const amount = Number(editDetails.value || 0);
          
          if (amount <= 0) {
            return {
              success: false,
              message: `Invalid amount: ${amount}. Please provide a positive amount.`
            };
          }
          
          // First, gather information about debit and credit lines
          const debitLines = [];
          const creditLines = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (parseFloat(line.debit) > 0) {
              debitLines.push(line);
            } else if (parseFloat(line.credit) > 0) {
              creditLines.push(line);
            }
          }
          
          console.log(`[GLAgent] Found ${debitLines.length} debit lines and ${creditLines.length} credit lines`);
          
          // Check if we can handle this journal structure
          if (debitLines.length === 0 || creditLines.length === 0) {
            return {
              success: false,
              message: `Journal #${journalId} has an unusual structure with no debit or credit lines.`
            };
          }
          
          // Special case: dealing with a journal that's already balanced
          if (currentDebit === currentCredit) {
            // Easy case - just update both sides to the same amount
            if (debitLines.length === 1 && creditLines.length === 1) {
              lineUpdates.push({
                lineId: debitLines[0].id,
                field: 'debit' as const,
                value: amount
              });
              
              lineUpdates.push({
                lineId: creditLines[0].id,
                field: 'credit' as const,
                value: amount
              });
              
              console.log(`[GLAgent] Updating both debit and credit lines to ${amount} to maintain balance`);
            } else {
              // For complex balanced journals, maintain the original ratio
              return {
                success: false,
                message: `This journal has multiple lines and can't be updated with a simple value change. Please specify which specific line you want to modify.`
              };
            }
          } 
          // Special case: dealing with a journal that has imbalance between debit and credit (unusual but possible in draft state)
          else {
            // For journal #72 which appears to have debit $2000 and credit $3000
            if (context.query.toLowerCase().includes('change the value') && 
                context.query.toLowerCase().includes('debit and credit')) {
              // User specifically asked to change both debit and credit to same value
              if (debitLines.length === 1 && creditLines.length === 1) {
                lineUpdates.push({
                  lineId: debitLines[0].id,
                  field: 'debit' as const,
                  value: amount
                });
                
                lineUpdates.push({
                  lineId: creditLines[0].id,
                  field: 'credit' as const,
                  value: amount
                });
                
                // Add a warning about balancing
                console.log(`[GLAgent] Warning: Setting both sides to ${amount} will${currentDebit !== currentCredit ? ' fix the existing imbalance' : ' maintain balance'}`);
              } else {
                return {
                  success: false,
                  message: `This journal has multiple lines and can't be updated with a simple value change. Please specify which specific line you want to modify.`
                };
              }
            } else {
              // For a journal that's imbalanced, maintain that same imbalance
              // Calculate the ratio between debit and credit
              const ratio = currentCredit / currentDebit;
              
              if (debitLines.length === 1 && creditLines.length === 1) {
                // Update debit to requested amount
                lineUpdates.push({
                  lineId: debitLines[0].id,
                  field: 'debit' as const,
                  value: amount
                });
                
                // Update credit proportionally to maintain the same ratio
                const newCreditAmount = amount * ratio;
                lineUpdates.push({
                  lineId: creditLines[0].id,
                  field: 'credit' as const,
                  value: newCreditAmount
                });
                
                console.log(`[GLAgent] Updating debit to ${amount} and credit to ${newCreditAmount} to maintain original ratio`);
              } else {
                return {
                  success: false,
                  message: `This journal has a complex structure with multiple lines and is currently imbalanced. Please specify exactly which values to set for both debit and credit sides.`
                };
              }
            }
          }
        } else if (editDetails.field === 'debit') {
          // Update the debit line
          const debitLines = lines.filter(line => parseFloat(line.debit) > 0);
          if (debitLines.length > 0) {
            lineUpdates.push({
              lineId: debitLines[0].id,
              field: 'debit' as const, // Explicitly type as const
              value: Number(editDetails.value || 0)
            });
          }
        } else if (editDetails.field === 'credit') {
          // Update the credit line
          const creditLines = lines.filter(line => parseFloat(line.credit) > 0);
          if (creditLines.length > 0) {
            lineUpdates.push({
              lineId: creditLines[0].id,
              field: 'credit' as const, // Explicitly type as const
              value: Number(editDetails.value || 0)
            });
          }
        }
        
        // If we have line updates, add them to the updates object
        if (lineUpdates.length > 0) {
          updates.lineUpdates = lineUpdates;
        } else if (editDetails.value) {
          // If we couldn't determine specific line updates but have a value,
          // try to update any non-zero values
          updates.lineUpdates = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (parseFloat(line.debit) > 0 || parseFloat(line.credit) > 0) {
              updates.lineUpdates.push({
                lineId: line.id,
                field: (parseFloat(line.debit) > 0 ? 'debit' : 'credit') as 'debit' | 'credit', // Cast to union type
                value: Number(editDetails.value)
              });
              break; // Just update the first matching line
            }
          }
        }
      }
      
      // If we don't have any updates, inform the user
      if (!updates.memo && !updates.date && (!updates.lineUpdates || updates.lineUpdates.length === 0)) {
        return {
          success: false,
          message: `I understand you want to edit journal #${journalId}, but I couldn't determine what changes you want to make. Please specify what you want to update (e.g., "change the value to $1000", "update the memo to 'new description'", etc.).`
        };
      }
      
      // Update the journal entry
      const result = await updateJournalEntry(journalId, updates);
      
      if (result.success) {
        return {
          success: true,
          message: result.message
        };
      } else {
        return {
          success: false,
          message: result.message
        };
      }
    } catch (error) {
      console.error("[GLAgent] Error handling journal edit:", error);
      
      // Extract and format the error message in a user-friendly way
      let errorMessage = "An unknown error occurred";
      
      if (error instanceof Error) {
        const errorText = error.message;
        
        // Handle common database errors
        if (errorText.includes('does not exist')) {
          const match = errorText.match(/column\s+"([^"]+)"\s+does not exist/);
          if (match) {
            errorMessage = `Database schema issue: Column '${match[1]}' doesn't exist in the database.`;
          } else {
            errorMessage = `A database object doesn't exist: ${errorText}`;
          }
        } else if (errorText.includes('already exists')) {
          errorMessage = `Cannot create duplicate record: ${errorText}`;
        } else if (errorText.includes('violates foreign key constraint')) {
          errorMessage = `Cannot update the journal because it would break a database relationship.`;
        } else if (errorText.includes('violates not-null constraint')) {
          errorMessage = `Required data is missing for this update.`;
        } else {
          errorMessage = errorText;
        }
      } else {
        errorMessage = String(error);
      }
      
      return {
        success: false,
        message: `I encountered an error while trying to edit the journal: ${errorMessage}`
      };
    }
  }
  
  private async handleJournalSummary(context: AgentContext): Promise<AgentResponse> {
    try {
      // Use direct SQL queries with correct column names based on database schema
      const result = await sql`
        SELECT 
          COUNT(*) as total_count,
          SUM(COALESCE(
            (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id), 
            0
          )) as total_debits,
          SUM(COALESCE(
            (SELECT SUM(credit) FROM journal_lines WHERE journal_id = j.id), 
            0
          )) as total_credits,
          MIN(j.date) as earliest_date,
          MAX(j.date) as latest_date,
          COUNT(DISTINCT journal_type) as journal_type_count,
          ARRAY_AGG(DISTINCT journal_type) as journal_types,
          ARRAY_AGG(j.id) as journal_ids
        FROM journals j
        WHERE j.is_posted = false AND j.is_deleted = false
      `;
      
      // Get the latest 5 unposted journals for a preview
      const recentJournals = await sql`
        SELECT 
          j.id, 
          j.memo, 
          j.date as transaction_date, 
          j.journal_type,
          (SELECT COUNT(*) FROM journal_lines WHERE journal_id = j.id) as line_count,
          (SELECT SUM(debit) FROM journal_lines WHERE journal_id = j.id) as total_debit
        FROM journals j
        WHERE j.is_posted = false AND j.is_deleted = false
        ORDER BY j.date DESC, j.id DESC
        LIMIT 5
      `;
      
      // Define interface for journal summary items
      interface JournalSummaryItem {
        id: number;
        memo: string;
        transaction_date: string;
        journal_type: string;
        line_count: number;
        total_debit?: number;
      }
      
      // Prepare the summary data
      const summaryData = {
        summary: {
          totalCount: parseInt(result.rows[0]?.total_count) || 0,
          totalDebits: parseFloat(result.rows[0]?.total_debits) || 0,
          totalCredits: parseFloat(result.rows[0]?.total_credits) || 0,
          earliestDate: result.rows[0]?.earliest_date,
          latestDate: result.rows[0]?.latest_date,
          journalTypes: result.rows[0]?.journal_types || [],
          averageAmount: parseInt(result.rows[0]?.total_count) > 0 
            ? (parseFloat(result.rows[0]?.total_debits) / parseInt(result.rows[0]?.total_count)).toFixed(2) 
            : '0.00',
          journalIds: result.rows[0]?.journal_ids || []
        },
        recentUnpostedJournals: recentJournals.rows
      };
      
      // Format a clear, readable summary for the user
      let message = `# Unposted Journal Entries Summary\n\n`;
      
      if (summaryData.summary.totalCount === 0) {
        message += "You have no unposted journal entries at this time.";
      } else {
        // Add summary statistics
        message += `## Overview\n`;
        message += `- **Total Unposted Entries:** ${summaryData.summary.totalCount}\n`;
        message += `- **Total Value:** $${summaryData.summary.totalDebits.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        message += `- **Date Range:** ${new Date(summaryData.summary.earliestDate).toLocaleDateString()} to ${new Date(summaryData.summary.latestDate).toLocaleDateString()}\n`;
        message += `- **Average Amount:** $${parseFloat(summaryData.summary.averageAmount).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}\n`;
        
        // Add journal types if present
        if (summaryData.summary.journalTypes && summaryData.summary.journalTypes.length > 0) {
          message += `- **Journal Types:** ${summaryData.summary.journalTypes.join(', ')}\n\n`;
        }
        
        // Define interface for journal summary items
        interface JournalSummaryItem {
          id: number;
          memo: string;
          transaction_date: string;
          journal_type: string;
          line_count: number;
          total_debit?: number;
        }
        
        // Add recent journals table
        if (summaryData.recentUnpostedJournals && summaryData.recentUnpostedJournals.length > 0) {
          message += `## Recent Unposted Journals\n`;
          message += `| ID | Date | Memo | Amount | Lines |\n`;
          message += `| --- | --- | --- | --- | --- |\n`;
          
          summaryData.recentUnpostedJournals.forEach((journal: any) => {
            const date = new Date(journal.transaction_date).toLocaleDateString();
            const amount = journal.total_debit ? `$${parseFloat(journal.total_debit.toString()).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A';
            message += `| ${journal.id} | ${date} | ${journal.memo || 'No description'} | ${amount} | ${journal.line_count} |\n`;
          });
          
          message += `\n\nTo post these journals, go to the Transactions page and select the journals you wish to post.`;
        }
      }
      
      // Log the successful summary fetch
      await logAuditEvent({
        user_id: context.userId,
        action_type: "FETCH_JOURNAL_SUMMARY",
        entity_type: "JOURNAL_SUMMARY",
        entity_id: "unposted",
        context: { 
          query: context.query,
          journalCount: summaryData.summary.totalCount,
          agentId: this.id 
        },
        status: "SUCCESS",
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        message: message
      };
    } catch (error) {
      console.error("[GLAgent] Error retrieving journal summary:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "FETCH_JOURNAL_SUMMARY",
        entity_type: "JOURNAL_SUMMARY",
        entity_id: "unposted",
        context: { query: context.query, agentId: this.id },
        status: "FAILURE",
        error_details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });
      
      return {
        success: false,
        message: "I encountered an error while retrieving your unposted journal entries. Please try again later or check the journal entries through the Transactions page."
      };
    }
  }

  /**
   * Handle journal creation requests from the user
   */
  private async handleJournalCreation(context: AgentContext): Promise<AgentResponse> {
    try {
      // 1. First, get the system prompt with account info
      const accounts = await getAccounts();
      let accountsContext = "";
      
      if (accounts.length > 0) {
        // Provide a more comprehensive list for journal creation
        accountsContext = `\nAvailable GL accounts for journal entries:\n`;
        accounts.forEach(acct => {
          accountsContext += `- ${acct.code}: ${acct.name} (${acct.account_type})\n`;
        });
      }
      
      // 2. Prepare the system prompt for journal creation
      const systemPrompt = `You are a General Ledger accounting expert. You specialize in creating accurate journal entries.

The user wants to create a journal entry. Your task is to:
1. Understand what transaction they want to record
2. Create a properly balanced journal entry (debits = credits)
3. Use the correct GL accounts from the list below
4. Format the journal entry as a JSON object

${accountsContext}

IMPORTANT RULES:
- EVERY journal entry MUST balance perfectly (total debits = total credits)
- For each account line, specify EITHER a debit OR a credit (not both)
- Sum all debits and sum all credits to verify they are EXACTLY equal
- Revenue accounts normally have credit balances
- Expense accounts normally have debit balances
- Asset accounts normally have debit balances
- Liability accounts normally have credit balances

Response format: You must include a valid JSON structure with the journal entry details like this:

\`\`\`json
{
  "memo": "Description of the journal entry",
  "transaction_date": "YYYY-MM-DD",
  "journal_type": "GJ",
  "reference_number": "REF123",
  "lines": [
    {
      "account_code_or_name": "Account Code or Name",
      "description": "Line item description",
      "debit": 100.00,
      "credit": 0
    },
    {
      "account_code_or_name": "Another Account",
      "description": "Another line item",
      "debit": 0,
      "credit": 100.00
    }
  ]
}
\`\`\`

Make sure:
- The journal entry balances (total debits = total credits)
- Each line has either a debit OR credit value (set the other to 0)
- Use the exact account names/codes from the list above
- Include today's date if no date is specified
- Use "GJ" as the journal type if none is specified
- Create a clear memo describing the transaction

First explain the journal entry you're creating with a clear explanation of why each account is debited or credited, then provide the JSON.`;
      
      // 3. Format previous messages for Claude
      const messages: MessageParam[] = [];
      
      if (context.previousMessages && context.previousMessages.length > 0) {
        for (const msg of context.previousMessages) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({
              role: msg.role as "user" | "assistant",
              content: [
                {
                  type: "text",
                  text: msg.content
                }
              ]
            });
          }
        }
      }
      
      // 4. Add current query
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: context.query
          }
        ]
      });
      
      // 5. Get response from Claude with journal creation expertise
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages
      });
      
      // 6. Process the response to extract the journal entry JSON
      let aiResponse = '';
      if (response.content && response.content.length > 0) {
        const firstContent = response.content[0];
        aiResponse = 'text' in firstContent ? firstContent.text : JSON.stringify(firstContent);
      }
      
      // 7. Try to extract a journal entry from the response
      const journalEntry = extractJournalEntryFromText(aiResponse);
      
      if (journalEntry) {
        // We found a journal entry in the AI response, try to create it
        const result = await createJournalFromAI(journalEntry, context.userId);
        
        if (result.success) {
          // Journal created successfully
          const successMsg = `${aiResponse}\n\n**Journal entry created successfully with ID: ${result.journalId}**`;
          
          // Log the successful journal creation
          await logAuditEvent({
            user_id: context.userId,
            action_type: "CREATE_JOURNAL",
            entity_type: "JOURNAL",
            entity_id: result.journalId?.toString() || "unknown",
            context: { journalId: result.journalId, memo: journalEntry.memo, agentId: this.id },
            status: "SUCCESS",
            timestamp: new Date().toISOString()
          });
          
          return { success: true, message: successMsg };
        } else {
          // Journal creation failed
          const errorMsg = `${aiResponse}\n\n**Error creating journal entry: ${result.message}**`;
          
          // Log the failed journal creation
          await logAuditEvent({
            user_id: context.userId,
            action_type: "CREATE_JOURNAL",
            entity_type: "JOURNAL",
            entity_id: "unknown",
            context: { error: result.message, agentId: this.id },
            status: "FAILURE",
            timestamp: new Date().toISOString()
          });
          
          return { success: false, message: errorMsg };
        }
      } else {
        // No journal entry found in the response, just return the AI response
        return { success: true, message: aiResponse };
      }
    } catch (error) {
      console.error("[GLAgent] Error in journal creation:", error);
      
      // Log the error
      await logAuditEvent({
        user_id: context.userId,
        action_type: "CREATE_JOURNAL",
        entity_type: "JOURNAL",
        entity_id: "unknown",
        context: { error: error instanceof Error ? error.message : String(error), agentId: this.id },
        status: "FAILURE",
        timestamp: new Date().toISOString()
      });
      
      return { 
        success: false, 
        message: `I apologize, but I encountered an error while trying to create the journal entry: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Handle deleting an attachment from a journal entry
   */
  private async handleAttachmentDeletion(context: AgentContext): Promise<AgentResponse> {
    console.log("[GLAgent] Handling attachment deletion:", context.query);
    
    try {
      // Extract journal ID from the query
      const journalIdMatch = context.query.match(/journal\s*(id|#)?\s*(\d+)/i);
      let journalId: number | null = null;
      
      if (journalIdMatch && journalIdMatch[2]) {
        journalId = parseInt(journalIdMatch[2], 10);
        console.log("[GLAgent] Extracted journal ID:", journalId);
      }

      if (!journalId) {
        return {
          success: false,
          message: "I need to know which journal entry you want to delete the attachment from. Please provide the journal number."
        };
      }

      // Check if journal exists
      const { rows: journalRows } = await sql`
        SELECT id, is_posted, is_deleted FROM journals WHERE id = ${journalId}
      `;

      if (journalRows.length === 0) {
        return {
          success: false,
          message: `Journal #${journalId} does not exist.`
        };
      }

      if (journalRows[0].is_posted) {
        return {
          success: false,
          message: `Journal #${journalId} is already posted. You cannot delete attachments from posted journal entries.`
        };
      }

      if (journalRows[0].is_deleted) {
        return {
          success: false,
          message: `Journal #${journalId} has been deleted. You cannot delete attachments from deleted journal entries.`
        };
      }

      // Get attachment information
      console.log(`[GLAgent] Querying attachments for journal ${journalId}`);
      const { rows: attachmentRows } = await sql`
        SELECT id, file_name FROM journal_attachments WHERE journal_id = ${journalId}
      `;
      console.log(`[GLAgent] Found ${attachmentRows.length} attachments:`, attachmentRows);

      if (attachmentRows.length === 0) {
        return {
          success: false,
          message: `Journal #${journalId} has no attachments to delete.`
        };
      }

      // Extract an attachment ID if mentioned in the query
      const attachmentIdMatch = context.query.match(/attachment\s*(id|#)?\s*(\d+)/i);
      let attachmentId: number | null = null;
      
      if (attachmentIdMatch && attachmentIdMatch[2]) {
        attachmentId = parseInt(attachmentIdMatch[2], 10);
        console.log(`[GLAgent] Extracted attachment ID from query: ${attachmentId}`);
      } else {
        console.log('[GLAgent] No specific attachment ID mentioned in query');
      }

      // If a specific attachment ID was mentioned, verify it exists
      if (attachmentId) {
        const matchingAttachment = attachmentRows.find(a => a.id === attachmentId);
        console.log(`[GLAgent] Looking for attachment ID ${attachmentId}, found:`, matchingAttachment);
        
        if (!matchingAttachment) {
          return {
            success: false,
            message: `Attachment #${attachmentId} does not exist in journal #${journalId}.`
          };
        }

        // Delete the specific attachment
        try {
          // Get file path if available
          const { rows: filePathRows } = await sql`
            SELECT file_path, file_url FROM journal_attachments 
            WHERE id = ${attachmentId} AND journal_id = ${journalId}
          `;

          // Delete from database first
          await sql`
            DELETE FROM journal_attachments 
            WHERE id = ${attachmentId} AND journal_id = ${journalId}
          `;

          // Try to delete from storage if file_path exists
          if (filePathRows.length > 0 && filePathRows[0].file_path) {
            try {
              const { getStorage } = require('firebase/storage');
              const storage = getStorage();
              const { ref, deleteObject } = require('firebase/storage');
              const fileRef = ref(storage, filePathRows[0].file_path);
              await deleteObject(fileRef);
            } catch (storageError) {
              console.error("Error deleting file from storage:", storageError);
              // Continue even if file deletion fails
            }
          }

          return {
            success: true,
            message: `Successfully deleted attachment #${attachmentId} from journal #${journalId}.`
          };
        } catch (error) {
          console.error("Error deleting attachment:", error);
          return {
            success: false,
            message: `Error deleting attachment #${attachmentId}: ${error instanceof Error ? error.message : String(error)}`
          };
        }
      } else {
        console.log('[GLAgent] No specific attachment ID was provided');
        
        // If there's only one attachment, delete it automatically
        if (attachmentRows.length === 1) {
          console.log('[GLAgent] Only one attachment found, deleting it automatically');
          const onlyAttachment = attachmentRows[0];
          const attachmentId = onlyAttachment.id;
          
          try {
            // Get file path if available
            console.log(`[GLAgent] Getting file path for attachment ${attachmentId}`);
            const { rows: filePathRows } = await sql`
              SELECT file_path, file_url FROM journal_attachments 
              WHERE id = ${attachmentId} AND journal_id = ${journalId}
            `;
            console.log('[GLAgent] File info:', filePathRows[0]);
            
            // Delete from database first
            console.log('[GLAgent] Deleting from database...');
            await sql`
              DELETE FROM journal_attachments 
              WHERE id = ${attachmentId} AND journal_id = ${journalId}
            `;
            console.log('[GLAgent] Deleted from database successfully');
            
            // Try to delete from storage if file_path exists
            if (filePathRows.length > 0 && filePathRows[0].file_path) {
              try {
                console.log('[GLAgent] Attempting to delete from storage:', filePathRows[0].file_path);
                const { initializeApp } = require('firebase/app');
                const { getStorage, ref, deleteObject } = require('firebase/storage');
                
                // Get the storage reference
                const storage = getStorage();
                const fileRef = ref(storage, filePathRows[0].file_path);
                await deleteObject(fileRef);
                console.log('[GLAgent] Successfully deleted from storage');
              } catch (storageError) {
                console.error("[GLAgent] Error deleting file from storage:", storageError);
                // Continue even if file deletion fails
              }
            }
            
            return {
              success: true,
              message: `Successfully deleted the attachment "${onlyAttachment.file_name}" from journal #${journalId}.`
            };
          } catch (error) {
            console.error("[GLAgent] Error deleting attachment:", error);
            return {
              success: false,
              message: `Error deleting attachment: ${error instanceof Error ? error.message : String(error)}`
            };
          }
        }
        
        // Multiple attachments - list them for the user to choose
        console.log('[GLAgent] Multiple attachments found, listing them for user');
        const attachmentList = attachmentRows.map(a => `- ID #${a.id}: ${a.file_name}`).join('\n');
        
        return {
          success: true,
          message: `Journal #${journalId} has ${attachmentRows.length} attachment(s). Please specify which one you want to delete:\n\n${attachmentList}\n\nYou can say something like "Delete attachment #${attachmentRows[0].id} from journal ${journalId}".`
        };
      }
    } catch (error) {
      console.error("[GLAgent] Attachment deletion error:", error);
      return { 
        success: false, 
        message: "Sorry, I couldn't process your request to delete the attachment. Please try again or use the user interface to remove it." 
      };
    }
  }

  /**
   * Handle uploading an attachment to a journal entry
   */
  private async handleJournalAttachment(context: AgentContext): Promise<AgentResponse> {
    try {
      // Extract journal ID from query
      const idMatch = context.query.match(/journal.*?(?:id|#)?\s*(\d+)/i);
      if (!idMatch) {
        return { success: false, message: "I couldn't find a journal ID in your request. Please specify the journal number." };
      }
      const journalId = parseInt(idMatch[1], 10);

      // Ensure we have a file in the document context
      const docCtx = context.documentContext || {};
      const fileUrl: string | undefined = docCtx.fileUrl || docCtx.url;
      const fileName: string | undefined = docCtx.fileName || docCtx.name;

      if (!fileUrl) {
        return { success: false, message: "Please provide the file you want to attach (e.g., upload it in the chat) so I can attach it to the journal entry." };
      }

      // Download the file
      const fileResponse = await axios.get<ArrayBuffer>(fileUrl, { responseType: "arraybuffer" });
      const buffer = Buffer.from(fileResponse.data);

      const formData = new FormData();
      formData.append("file", buffer, fileName || `attachment_${Date.now()}`);

      // Axios requires absolute URLs, not relative paths
      // For server-side code, we need to use the internal API directly instead of making HTTP requests
      const sql = (await import('@vercel/postgres')).sql;
      
      // Get the file metadata
      const contentType = fileName ? fileName.split('.').pop() || 'unknown' : 'unknown';
      const fileSize = buffer.length;
      
      try {
        // Check if journal exists
        const { rows: journalRows } = await sql`
          SELECT is_posted, is_deleted FROM journals WHERE id = ${journalId}
        `;
        
        if (journalRows.length === 0) {
          return { success: false, message: `Journal entry #${journalId} not found.` };
        }
        
        if (journalRows[0].is_posted) {
          return { success: false, message: `Cannot add attachments to posted journal entry #${journalId}.` };
        }
        
        if (journalRows[0].is_deleted) {
          return { success: false, message: `Cannot add attachments to deleted journal entry #${journalId}.` };
        }
        
        // Upload to Firebase Storage
        const { getAdminStorage } = await import('@/lib/firebaseAdminConfig');
        const storage = getAdminStorage();
        
        // Determine bucket name
        const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
        const bucket = storage.bucket(bucketName);
        
        const timestamp = Date.now();
        const storagePath = `journals/${context.userId}/${journalId}/${fileName || `attachment_${timestamp}`}`;
        const fileRef = bucket.file(storagePath);
        
        await fileRef.save(buffer, {
          metadata: {
            contentType: contentType,
            metadata: {
              userId: context.userId,
              journalId: journalId,
              originalName: fileName || `attachment_${timestamp}`,
            },
          },
        });
        
        // Generate signed URL for access
        const [signedUrl] = await fileRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
        });
        
        // Store attachment metadata in database
        // Check if this is an older schema or newer schema
        try {
          // Try with file_path (older schema)
          const result = await sql`
            INSERT INTO journal_attachments (
              journal_id,
              file_name,
              file_url,
              file_path,
              file_type,
              file_size,
              uploaded_by,
              uploaded_at
            ) VALUES (
              ${journalId},
              ${fileName || `attachment_${timestamp}`},
              ${signedUrl},
              ${storagePath},
              ${contentType},
              ${fileSize},
              ${context.userId},
              CURRENT_TIMESTAMP
            ) RETURNING id
          `;
          return {
            success: true,
            message: `Attachment uploaded successfully to journal #${journalId}.`,
            data: { attachmentId: result.rows[0]?.id }
          };
        } catch (schemaError: any) {
          // Fallback to schema without file_path
          if (schemaError.message && schemaError.message.includes("file_path")) {
            console.log("[GLAgent] Falling back to insert without file_path column");
            const result = await sql`
              INSERT INTO journal_attachments (
                journal_id,
                file_name,
                file_url,
                file_type,
                file_size,
                uploaded_by,
                uploaded_at
              ) VALUES (
                ${journalId},
                ${fileName || `attachment_${timestamp}`},
                ${signedUrl},
                ${contentType},
                ${fileSize},
                ${context.userId},
                CURRENT_TIMESTAMP
              ) RETURNING id
            `;
            return {
              success: true,
              message: `Attachment uploaded successfully to journal #${journalId}.`,
              data: { attachmentId: result.rows[0]?.id }
            };
          } else {
            throw schemaError;
          }
        }
      } catch (innerError) {
        console.error("[GLAgent] Storage or database error:", innerError);
        return { 
          success: false, 
          message: `Error uploading attachment to journal #${journalId}: ${innerError instanceof Error ? innerError.message : String(innerError)}`
        };
      }

      // This code is no longer needed as we're handling the response in the try-catch block above
    } catch (error: any) {
      console.error("[GLAgent] Attachment upload error:", error);
      return { success: false, message: "Sorry, I couldn't upload the attachment." };
    }
  }
}

import { Agent, AgentContext } from "@/types/agents";
import { ReceiptExtractor } from "./ReceiptExtractor";
import {
  sendAgentMessage,
  waitForAgentResponse,
  MessagePriority,
} from "@/lib/agentCommunication";
import {
  storeReceiptEmbedding,
  updateReceiptStatus,
} from "@/lib/receiptEmbeddings";
import * as billQueries from "@/lib/accounting/billQueries";
import * as vendorQueries from "@/lib/accounting/vendorQueries";
import { Anthropic } from "@anthropic-ai/sdk";
import { sql } from "@vercel/postgres";
import { saveReceiptAsBillAttachment } from "@/lib/billAttachments";
import { saveReceiptAsJournalAttachment } from "@/lib/journalAttachments";

export class ReceiptAgent implements Agent {
  public id = "receipt_agent";
  public name = "Receipt Agent";
  public description =
    "Processes receipt images and extracts transaction information";

  private receiptExtractor: ReceiptExtractor;
  private anthropic: Anthropic;

  constructor() {
    // Initialize Anthropic client
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.receiptExtractor = new ReceiptExtractor(this.anthropic);
  }

  /**
   * Determine if this agent can handle the given query
   */
  public async canHandle(query: string): Promise<boolean> {
    // Check if query is about receipt processing
    const receiptKeywords = [
      "receipt",
      "expense",
      "vendor",
      "purchase",
      "transaction",
      "process receipt",
      "analyze receipt",
      "extract receipt",
      "bill",
      "invoice",
      "vendor bill",
    ];

    if (typeof query !== "string") {
      console.error("[ReceiptAgent] Query is not a string:", query);
      return false;
    }

    const lowercaseQuery = query.toLowerCase();
    return receiptKeywords.some((keyword) => lowercaseQuery.includes(keyword));
  }

  /**
   * Process a receipt request
   */
  public async processRequest(context: AgentContext): Promise<any> {
    try {
      const result = await this.processReceipt(context, context.query);

      return {
        success: result.success,
        message: result.message,
        data: result,
      };
    } catch (error) {
      console.error(`[ReceiptAgent] Error processing request:`, error);
      return {
        success: false,
        message: `Error processing receipt: ${(error as Error).message}`,
        data: null,
      };
    }
  }

  /**
   * Main method to process a receipt image
   * Following the exact pattern from CreditCardAgent.processStatementWithBeginningBalance
   */
  public async processReceipt(
    context: AgentContext,
    query: string
  ): Promise<any> {
    try {
      // Check if we have a document context with image data
      if (!context.documentContext) {
        return {
          success: false,
          message:
            "No document context provided. Please upload a receipt image.",
        };
      }

      // Validate that we have image data
      if (
        context.documentContext.type &&
        !context.documentContext.type.startsWith("image/")
      ) {
        return {
          success: false,
          message:
            "Document must be an image file. Supported formats: JPG, PNG, WebP, GIF",
        };
      }

      // Extract user context from query if provided
      // Query format: "Process this receipt for: [user context]" or just "process receipt"
      let userReceiptContext = '';
      const contextMatch = query.match(/Process this receipt for:\s*(.+)/i);
      if (contextMatch && contextMatch[1]) {
        userReceiptContext = contextMatch[1].trim();
        console.log(`[ReceiptAgent] User provided context: "${userReceiptContext}"`);
      }

      let receiptInfo: any = { success: false };

      // Check if we already have extracted data in additionalContext.documentContext
      if (context.additionalContext?.documentContext?.extractedData) {
        // If we have cached extraction data, use it directly
        if (context.additionalContext.documentContext.extractedData.query) {
          receiptInfo =
            context.additionalContext.documentContext.extractedData.receiptInfo;
        }
      }

      // If we don't have extracted data yet, extract it
      if (!receiptInfo.success) {
        // Extract receipt information using the enhanced extractor
        const extractionResult = await this.receiptExtractor.extractReceiptInfo(
          query,
          context.documentContext.content,
          context.documentContext
        );

        if (extractionResult.success && extractionResult.receiptInfo) {
          receiptInfo = {
            success: true,
            message: extractionResult.message,
            vendorName: extractionResult.receiptInfo.vendorName,
            receiptDate: extractionResult.receiptInfo.receiptDate,
            lastFourDigits: extractionResult.receiptInfo.lastFourDigits,
            lineItems: extractionResult.receiptInfo.lineItems,
            totalAmount: extractionResult.receiptInfo.totalAmount,
            subTotal: extractionResult.receiptInfo.subTotal,
            taxAmount: extractionResult.receiptInfo.taxAmount,
            tipAmount: extractionResult.receiptInfo.tipAmount,
            paymentMethod: extractionResult.receiptInfo.paymentMethod,
            currency: extractionResult.receiptInfo.currency || "USD",
          };

          // Store extraction data in additionalContext for caching (following CreditCardAgent pattern)
          if (!context.additionalContext) {
            context.additionalContext = {};
          }
          if (!context.additionalContext.documentContext) {
            context.additionalContext.documentContext = {
              extractedData: {},
            };
          }
          if (!context.additionalContext.documentContext.extractedData) {
            context.additionalContext.documentContext.extractedData = {
              query: query,
              receiptInfo: receiptInfo,
            };
          } else {
            context.additionalContext.documentContext.extractedData.receiptInfo =
              receiptInfo;
          }

          // Also store in documentContext for backward compatibility
          if (
            context.documentContext &&
            !context.documentContext.extractedData
          ) {
            context.documentContext.extractedData = {
              query: query,
              receiptInfo: receiptInfo,
            };
          }
        } else {
          console.error(
            `[ReceiptAgent] Receipt extraction failed:`,
            extractionResult.message
          );
          return {
            success: false,
            message:
              extractionResult.message ||
              "Failed to extract receipt information",
          };
        }
      }

      // Validate that we have the minimum required information
      if (
        !receiptInfo.vendorName ||
        !receiptInfo.lineItems ||
        receiptInfo.lineItems.length === 0
      ) {
        return {
          success: false,
          message:
            "Could not extract essential receipt information. Please ensure the image is clear and contains a valid receipt.",
        };
      }

      // Store receipt in vector database
      // Create receipt content for embedding
      const receiptContent = this.createReceiptContentForEmbedding(receiptInfo);

      const storedReceipt = await storeReceiptEmbedding({
        user_id: context.userId,
        vendor_name: receiptInfo.vendorName,
        receipt_date:
          receiptInfo.receiptDate || new Date().toISOString().split("T")[0],
        total_amount: receiptInfo.totalAmount || 0,
        last_four_digits: receiptInfo.lastFourDigits,
        line_items: receiptInfo.lineItems,
        receipt_image_url: context.documentContext.name || undefined,
        receipt_content: receiptContent,
        processed_status: "pending",
      });

      if (!storedReceipt) {
        console.error(
          `[ReceiptAgent] Failed to store receipt in vector database`
        );
        return {
          success: false,
          message:
            "Receipt extracted successfully but failed to store in database",
        };
      }

      // Process line items and create bills
      let billsCreated = 0;
      let processedItems = [];

      // First, find or create the vendor
      let vendorId = null;
      try {
        // Try to find existing vendor first
        const existingVendors = await vendorQueries.getVendors(
          1,
          50,
          receiptInfo.vendorName,
          false,
          context.userId
        );

        if (existingVendors.vendors.length > 0) {
          vendorId = existingVendors.vendors[0].id;
        } else {
          // Create new vendor
          const newVendor = await vendorQueries.createVendor(
            {
              name: receiptInfo.vendorName,
            },
            context.userId
          );
          vendorId = newVendor.id;
        }
      } catch (vendorError) {
        console.error(`[ReceiptAgent] Error creating vendor:`, vendorError);
        throw new Error(
          `Failed to create vendor: ${(vendorError as Error).message}`
        );
      }

      // Create a single bill for all line items
      try {
        if (!vendorId) {
          throw new Error("Vendor ID is required but was not created");
        }

        // Prepare bill line items with GL accounts
        const billLineItems = [];
        const accountCache = new Map<string, number>(); // Cache to avoid redundant AI calls

        for (const item of receiptInfo.lineItems) {
          // Create GL account if needed
          let glAccountId = null;
          if (item.categoryGuess) {
            try {
              // Check cache first to avoid redundant AI calls
              if (accountCache.has(item.categoryGuess)) {
                glAccountId = accountCache.get(item.categoryGuess);
                console.log(
                  `[ReceiptAgent] Using cached account for category: ${item.categoryGuess} (ID: ${glAccountId})`
                );
              } else {
                // Only call AI if not in cache
                glAccountId = await this.findOrCreateExpenseAccount(
                  context,
                  item.categoryGuess
                );
                accountCache.set(item.categoryGuess, glAccountId);
              }
            } catch (error) {
              console.error(
                `[ReceiptAgent] Error finding/creating expense account:`,
                error
              );
              // As a last resort, try to find ANY expense account
              const fallbackResult = await sql`
                SELECT id FROM accounts 
                WHERE account_type = 'expense' 
                AND user_id = ${context.userId || null}
                LIMIT 1
              `;

              if (fallbackResult.rows.length > 0) {
                glAccountId = fallbackResult.rows[0].id;
              } else {
                throw new Error(
                  "No expense account available and could not create one"
                );
              }
            }
          }

          billLineItems.push({
            description: item.description,
            quantity: item.quantity || 1,
            unit_price: item.amount.toString(),
            line_total: item.amount.toString(),
            glAccountId: glAccountId,
            category: item.categoryGuess,
          });
        }

        // Create bill lines array with proper expense account handling
        const billLines = [];

        for (const item of billLineItems) {
          let expenseAccountId = item.glAccountId;

          // If no GL account was created, find or create a default expense account
          if (!expenseAccountId) {
            try {
              expenseAccountId = await this.findOrCreateExpenseAccount(
                context,
                item.category || "Miscellaneous Expense"
              );
            } catch (error) {
              console.error(
                `[ReceiptAgent] Error finding/creating expense account:`,
                error
              );
              // As a last resort, try to find ANY expense account
              const fallbackResult = await sql`
                SELECT id FROM accounts 
                WHERE account_type = 'expense' 
                AND user_id = ${context.userId || null}
                LIMIT 1
              `;

              if (fallbackResult.rows.length > 0) {
                expenseAccountId = fallbackResult.rows[0].id;
              } else {
                throw new Error(
                  "No expense account available and could not create one"
                );
              }
            }
          }

          billLines.push({
            account_id: expenseAccountId.toString(),
            description: item.description,
            quantity: item.quantity.toString(),
            unit_price: item.unit_price,
            line_total: item.line_total,
            category: item.category,
          });
        }

        // Add tax as a separate line item if tax amount exists
        if (receiptInfo.taxAmount && receiptInfo.taxAmount > 0) {
          console.log(
            `[ReceiptAgent] Adding tax line item: $${receiptInfo.taxAmount}`
          );

          // Find or create tax expense account
          let taxAccountId;
          try {
            taxAccountId = await this.findOrCreateExpenseAccount(
              context,
              "Tax Expense"
            );
          } catch (error) {
            console.error(
              `[ReceiptAgent] Error finding/creating tax expense account:`,
              error
            );
            // Fallback to any expense account
            const fallbackResult = await sql`
              SELECT id FROM accounts 
              WHERE account_type = 'expense' 
              AND user_id = ${context.userId || null}
              LIMIT 1
            `;

            if (fallbackResult.rows.length > 0) {
              taxAccountId = fallbackResult.rows[0].id;
            } else {
              throw new Error("No expense account available for tax");
            }
          }

          billLines.push({
            account_id: taxAccountId.toString(),
            description: "Sales Tax",
            quantity: "1",
            unit_price: receiptInfo.taxAmount.toString(),
            line_total: receiptInfo.taxAmount.toString(),
            category: "Tax Expense",
          });
        }

        // Add tip as a separate line item if tip amount exists
        if (receiptInfo.tipAmount && receiptInfo.tipAmount > 0) {
          console.log(
            `[ReceiptAgent] Adding tip line item: $${receiptInfo.tipAmount}`
          );

          // Find or create tip expense account (usually categorized as Meals & Entertainment)
          let tipAccountId;
          try {
            tipAccountId = await this.findOrCreateExpenseAccount(
              context,
              "Meals & Entertainment"
            );
          } catch (error) {
            console.error(
              `[ReceiptAgent] Error finding/creating tip expense account:`,
              error
            );
            // Fallback to any expense account
            const fallbackResult = await sql`
              SELECT id FROM accounts 
              WHERE account_type = 'expense' 
              AND user_id = ${context.userId || null}
              LIMIT 1
            `;

            if (fallbackResult.rows.length > 0) {
              tipAccountId = fallbackResult.rows[0].id;
            } else {
              throw new Error("No expense account available for tip");
            }
          }

          billLines.push({
            account_id: tipAccountId.toString(),
            description: "Tip/Gratuity",
            quantity: "1",
            unit_price: receiptInfo.tipAmount.toString(),
            line_total: receiptInfo.tipAmount.toString(),
            category: "Meals & Entertainment",
          });
        }

        // Generate AI service explanation
        const serviceExplanation = await this.generateServiceExplanation(
          receiptInfo.vendorName,
          receiptInfo.lineItems
        );

        // Generate intelligent AI-powered bill number
        const intelligentBillNumber = await this.generateIntelligentBillNumber(
          receiptInfo,
          storedReceipt.id.toString()
        );

        // Determine journal type using AI
        const journalType = await this.generateIntelligentJournalType(
          receiptInfo,
          `Receipt from ${receiptInfo.vendorName} on ${receiptInfo.receiptDate}`
        );

        // Create the bill (initially as "Open", payment will update status to "Paid")
        const bill = {
          vendor_id: vendorId,
          bill_number: intelligentBillNumber,
          bill_date: receiptInfo.receiptDate,
          due_date: receiptInfo.receiptDate, // Same day for receipts
          total_amount: parseFloat(receiptInfo.totalAmount.toString()),
          paid_amount: 0, // Start with 0, payment will update this
          status: "Open", // Start as Open, payment will update to Paid
          description: userReceiptContext 
            ? userReceiptContext 
            : `Receipt from ${receiptInfo.vendorName} - ${receiptInfo.receiptDate}`,
          ap_account_id: await this.findOrCreatePayableAccount(
            context,
            receiptInfo
          ),
          journal_type: journalType,
          user_receipt_context: userReceiptContext, // Pass user context for journal description
        };

        const newBill = await billQueries.createBill(
          bill,
          billLines,
          context.userId
        );

        if (newBill && newBill.id) {
          // Save the receipt image as an attachment to the bill
          try {
            if (context.documentContext?.content) {
              const fileName = context.documentContext.name || "receipt.jpg";
              const fileType = context.documentContext.type || "image/jpeg";

              console.log(
                `[ReceiptAgent] Saving receipt image as attachment for bill ${newBill.id}`
              );

              const attachmentResult = await saveReceiptAsBillAttachment({
                billId: newBill.id,
                userId: context.userId,
                receiptImageData: context.documentContext.content,
                fileName: fileName,
                fileType: fileType,
              });

              if (attachmentResult.success) {
                console.log(
                  `[ReceiptAgent] Successfully saved receipt image as attachment ${attachmentResult.attachmentId} for bill ${newBill.id}`
                );
              } else {
                console.error(
                  `[ReceiptAgent] Failed to save receipt image as attachment: ${attachmentResult.error}`
                );
                // Don't fail the entire process if attachment saving fails
              }

              // Also save the receipt as a journal attachment if a journal was created
              if (newBill.journal_id) {
                try {
                  console.log(
                    `[ReceiptAgent] Saving receipt image as attachment for journal ${newBill.journal_id}`
                  );

                  const journalAttachmentResult =
                    await saveReceiptAsJournalAttachment({
                      journalId: newBill.journal_id,
                      userId: context.userId,
                      receiptImageData: context.documentContext.content,
                      fileName: fileName,
                      fileType: fileType,
                    });

                  if (journalAttachmentResult.success) {
                    console.log(
                      `[ReceiptAgent] Successfully saved receipt image as attachment ${journalAttachmentResult.attachmentId} for journal ${newBill.journal_id}`
                    );
                  } else {
                    console.error(
                      `[ReceiptAgent] Failed to save receipt image as journal attachment: ${journalAttachmentResult.error}`
                    );
                    // Don't fail the entire process if journal attachment saving fails
                  }
                } catch (journalAttachmentError) {
                  console.error(
                    `[ReceiptAgent] Error saving receipt image as journal attachment:`,
                    journalAttachmentError
                  );
                  // Don't fail the entire process if journal attachment saving fails
                }
              } else {
                console.log(
                  `[ReceiptAgent] No journal ID available, skipping journal attachment for bill ${newBill.id}`
                );
              }
            } else {
              console.warn(
                `[ReceiptAgent] No receipt image data available to save as attachment for bill ${newBill.id}`
              );
            }
          } catch (attachmentError) {
            console.error(
              `[ReceiptAgent] Error saving receipt image as attachment:`,
              attachmentError
            );
            // Don't fail the entire process if attachment saving fails
          }

          // Create a payment record since receipts represent already completed transactions
          try {
            const payment = {
              bill_id: newBill.id,
              payment_date: receiptInfo.receiptDate,
              amount_paid: parseFloat(receiptInfo.totalAmount.toString()),
              payment_account_id: await this.findOrCreatePaymentAccount(
                context,
                receiptInfo
              ),
              payment_method: receiptInfo.paymentMethod,
              reference_number: receiptInfo.lastFourDigits
                ? `****${receiptInfo.lastFourDigits}`
                : undefined,
            };

            await billQueries.createBillPayment(payment, context.userId);
            console.log(
              `[ReceiptAgent] Created payment record for receipt bill ${newBill.id}`
            );
          } catch (paymentError) {
            console.error(
              `[ReceiptAgent] Error creating payment record:`,
              paymentError
            );
            // Don't fail the entire process if payment creation fails
          }

          billsCreated = 1;
          processedItems = billLineItems.map((item) => ({
            item: item,
            glAccountResult: { success: true },
            billResult: { success: true, billId: newBill.id },
          }));
        } else {
          throw new Error("Bill creation returned null or missing ID");
        }
      } catch (billError) {
        console.error(`[ReceiptAgent] Error creating bill:`, billError);
        throw new Error(
          `Failed to create bill: ${(billError as Error).message}`
        );
      }

      // Update receipt status based on processing result
      const finalStatus = billsCreated > 0 ? "processed" : "error";
      await updateReceiptStatus(storedReceipt.id, finalStatus, context.userId);

      return {
        success: true,
        message: `Receipt processed successfully! ${billsCreated} bill entries created.`,
        receiptId: storedReceipt.id,
        receiptInfo: receiptInfo,
        processingResult: {
          success: billsCreated > 0,
          billsCreated: billsCreated,
          processedItems: processedItems,
          message: `Processed ${processedItems.length} line items, created ${billsCreated} bill entries`,
        },
        extractionData: receiptInfo,
      };
    } catch (error) {
      console.error(`[ReceiptAgent] Error processing receipt:`, error);
      return {
        success: false,
        message: `An error occurred while processing the receipt: ${
          (error as Error).message
        }`,
      };
    }
  }

  /**
   * Create text content for embedding from receipt info
   */
  private createReceiptContentForEmbedding(receiptInfo: any): string {
    const parts = [
      `Vendor: ${receiptInfo.vendorName}`,
      `Date: ${receiptInfo.receiptDate}`,
      `Total: $${receiptInfo.totalAmount}`,
    ];

    if (receiptInfo.lastFourDigits) {
      parts.push(`Card: ****${receiptInfo.lastFourDigits}`);
    }

    if (receiptInfo.lineItems && receiptInfo.lineItems.length > 0) {
      parts.push("Items:");
      receiptInfo.lineItems.forEach((item: any) => {
        parts.push(
          `- ${item.description}: $${item.amount}${
            item.categoryGuess ? ` (${item.categoryGuess})` : ""
          }`
        );
      });
    }

    return parts.join("\n");
  }

  /**
   * Use AI to determine the payment type and appropriate account type
   * @param paymentMethod The payment method string from the receipt
   * @returns Promise with payment type and account type
   */
  private async analyzePaymentMethod(paymentMethod: string): Promise<{
    paymentType: "credit_card" | "debit_card" | "cash" | "check" | "other";
    accountType: "credit_card" | "checking" | "cash" | "accounts_payable";
    accountName: string;
  }> {
    if (!paymentMethod || paymentMethod === "unknown") {
      return {
        paymentType: "other",
        accountType: "accounts_payable",
        accountName: "Accounts Payable",
      };
    }

    try {
      const prompt = `Analyze this payment method and categorize it:

Payment method: "${paymentMethod}"

Respond with a JSON object containing:
{
  "paymentType": "credit_card" | "debit_card" | "cash" | "check" | "other",
  "accountType": "credit_card" | "checking" | "cash" | "accounts_payable",
  "accountName": "suggested account name"
}

Guidelines:
- Credit cards (Visa, MasterCard, AMEX, Discover, etc.) → paymentType: "credit_card", accountType: "credit_card"
- Debit cards → paymentType: "debit_card", accountType: "checking" 
- Cash payments → paymentType: "cash", accountType: "cash"
- Checks → paymentType: "check", accountType: "checking"
- Unknown/other → paymentType: "other", accountType: "accounts_payable"

For accountName:
- Credit cards: "Credit Card XXXX" (if last 4 digits available)
- Debit: "Checking Account" or "Debit Account"
- Cash: "Cash"
- Check: "Checking Account"
- Other: "Accounts Payable"`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      const parsed = await this.extractJsonWithAI(result, `{
        "paymentType": "credit_card|debit_card|cash|check|other",
        "accountType": "credit_card|checking|cash|accounts_payable",
        "accountName": "suggested account name"
      }`);
      
      return {
        paymentType: parsed.paymentType || 'other',
        accountType: parsed.accountType || 'accounts_payable',
        accountName: parsed.accountName || 'Accounts Payable'
      };
    } catch (error) {
      console.error(`[ReceiptAgent] Error in AI payment analysis:`, error);
      // Fallback logic
      const lower = paymentMethod.toLowerCase();
      if (lower.includes("cash")) {
        return {
          paymentType: "cash",
          accountType: "cash",
          accountName: "Cash",
        };
      } else if (lower.includes("debit")) {
        return {
          paymentType: "debit_card",
          accountType: "checking",
          accountName: "Checking Account",
        };
      } else if (
        ["amex", "visa", "mastercard", "discover", "credit"].some((cc) =>
          lower.includes(cc)
        )
      ) {
        return {
          paymentType: "credit_card",
          accountType: "credit_card",
          accountName: "Credit Card",
        };
      } else {
        return {
          paymentType: "other",
          accountType: "accounts_payable",
          accountName: "Accounts Payable",
        };
      }
    }
  }

  /**
   * Find or create a payable account for the receipt payment method
   * @param context The agent context
   * @param receiptInfo The receipt information
   * @returns Promise with the account ID
   */
  private async findOrCreatePayableAccount(
    context: AgentContext,
    receiptInfo: any
  ): Promise<number> {
    try {
      console.log(
        `[ReceiptAgent] Finding or creating payable account for payment method: ${receiptInfo.paymentMethod}`
      );

      // Use AI to analyze the payment method
      const paymentAnalysis = await this.analyzePaymentMethod(
        receiptInfo.paymentMethod
      );
      console.log(`[ReceiptAgent] Payment analysis:`, paymentAnalysis);

      // For credit cards, include last four digits in account name if available
      let accountName = paymentAnalysis.accountName;
      if (
        paymentAnalysis.paymentType === "credit_card" &&
        receiptInfo.lastFourDigits &&
        receiptInfo.lastFourDigits !== "unknown"
      ) {
        accountName = `Credit Card ${receiptInfo.lastFourDigits}`;
      }

      // Try to find existing account based on payment type
      let existingAccountQuery;
      if (
        paymentAnalysis.paymentType === "credit_card" &&
        receiptInfo.lastFourDigits &&
        receiptInfo.lastFourDigits !== "unknown"
      ) {
        // For credit cards, search by last four digits and payment method
        existingAccountQuery = await sql`
          SELECT id FROM accounts 
          WHERE account_type = ${this.mapToGLAccountType(
            paymentAnalysis.accountType
          )}
          AND user_id = ${context.userId || null}
          AND (
            name LIKE ${`%${receiptInfo.lastFourDigits}%`} OR
            name LIKE ${`%credit%${receiptInfo.lastFourDigits}%`} OR
            name LIKE ${`%${receiptInfo.paymentMethod}%${receiptInfo.lastFourDigits}%`} OR
            name LIKE ${`%${receiptInfo.paymentMethod}%`}
          )
          LIMIT 1
        `;
      } else {
        // For other payment types, search by account type and name
        existingAccountQuery = await sql`
          SELECT id FROM accounts 
          WHERE account_type = ${this.mapToGLAccountType(
            paymentAnalysis.accountType
          )}
          AND user_id = ${context.userId || null}
          AND name ILIKE ${`%${accountName}%`}
          LIMIT 1
        `;
      }

      if (existingAccountQuery.rows.length > 0) {
        const accountId = existingAccountQuery.rows[0].id;
        console.log(
          `[ReceiptAgent] Found existing ${paymentAnalysis.paymentType} account: ${existingAccountQuery.rows[0].name} (ID: ${accountId})`
        );
        return accountId;
      }

      // If no existing account found, create a new one
      console.log(
        `[ReceiptAgent] No existing ${paymentAnalysis.paymentType} account found, creating new one: ${accountName}`
      );

      // Generate appropriate account code based on account type
      const existingAccounts = await sql`
        SELECT id, name, account_code, notes FROM accounts 
        WHERE account_type = ${this.mapToGLAccountType(
          paymentAnalysis.accountType
        )}
        AND user_id = ${context.userId || null}
        AND is_active = true
      `;

      const accountCode = await this.generateIntelligentAccountCode(
        accountName,
        this.mapToGLAccountType(paymentAnalysis.accountType),
        existingAccounts.rows as Array<{
          id: number;
          name: string;
          notes?: string;
          account_code: string;
        }>
      );

      const insertResult = await sql`
        INSERT INTO accounts (name, account_code, account_type, notes, user_id, is_active) 
        VALUES (
          ${accountName}, 
          ${accountCode}, 
          ${this.mapToGLAccountType(paymentAnalysis.accountType)}, 
          ${`Auto-created payable account for payment method: ${receiptInfo.paymentMethod}.`}, 
          ${context.userId || null}, 
          true
        ) 
        RETURNING id
      `;

      if (insertResult.rows.length > 0) {
        const newAccountId = insertResult.rows[0].id;
        console.log(
          `[ReceiptAgent] Created payable account: ${accountName} (ID: ${newAccountId})`
        );
        return newAccountId;
      }

      // Final fallback - try to find any accounts payable account
      console.log(
        `[ReceiptAgent] Account creation failed, looking for default accounts payable account`
      );
      const defaultAPResult = await sql`
        SELECT id FROM accounts 
        WHERE account_type = 'liability' 
        AND user_id = ${context.userId || null}
        LIMIT 1
      `;

      if (defaultAPResult.rows.length > 0) {
        return defaultAPResult.rows[0].id;
      }

      // Create a default accounts payable account if none exists
      console.log(`[ReceiptAgent] Creating default accounts payable account`);
      const defaultAPInsert = await sql`
        INSERT INTO accounts (name, account_code, account_type, notes, user_id, is_active) 
        VALUES (
          'Accounts Payable', 
          '20001', 
          'liability', 
          'Default accounts payable account. Auto-created by ReceiptAgent.', 
          ${context.userId || null}, 
          true
        ) 
        RETURNING id
      `;

      if (defaultAPInsert.rows.length > 0) {
        return defaultAPInsert.rows[0].id;
      }

      throw new Error("Failed to create any payable account");
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error finding/creating payable account:`,
        error
      );
      throw error;
    }
  }

  /**
   * Map payment analysis account types to proper GL account types
   * @param accountType The account type from payment analysis
   * @returns The mapped GL account type
   */
  private mapToGLAccountType(accountType: string): string {
    switch (accountType) {
      case "credit_card":
        return "liability";
      case "checking":
        return "asset";
      case "cash":
        return "asset";
      case "accounts_payable":
        return "liability";
      default:
        return "liability";
    }
  }

  /**
   * Find or create an expense account for the given category
   * @param context The agent context
   * @param category The expense category
   * @returns Promise with the account ID
   */
  private async findOrCreateExpenseAccount(
    context: AgentContext,
    category: string
  ): Promise<number> {
    try {
      console.log(
        `[ReceiptAgent] Finding or creating expense account for category: ${category}`
      );

      // First, get all existing expense accounts for AI analysis
      const existingAccountsQuery = await sql`
        SELECT id, name, account_code, notes FROM accounts 
        WHERE account_type = 'expense' 
        AND user_id = ${context.userId || null}
        AND is_active = true
        ORDER BY name
      `;

      if (existingAccountsQuery.rows.length > 0) {
        console.log(
          `[ReceiptAgent] Found ${existingAccountsQuery.rows.length} existing expense accounts, using AI to find best match...`
        );

        // Use AI to intelligently match the category to existing accounts
        const aiMatchResult = await this.findBestAccountMatch(
          category,
          existingAccountsQuery.rows as Array<{
            id: number;
            name: string;
            notes?: string;
            account_code: string;
          }>
        );

        if (aiMatchResult.accountId) {
          console.log(
            `[ReceiptAgent] AI found matching expense account: ${aiMatchResult.accountName} (ID: ${aiMatchResult.accountId}) - Confidence: ${aiMatchResult.confidence}`
          );
          return aiMatchResult.accountId;
        } else {
          console.log(`[ReceiptAgent] AI analysis: ${aiMatchResult.reasoning}`);
        }
      } else {
        console.log(
          `[ReceiptAgent] No existing expense accounts found for user`
        );
      }

      // If no existing account found, create a new one
      console.log(
        `[ReceiptAgent] No suitable existing expense account found, creating new one: ${category}`
      );

      // Use AI to check for potential duplicate names before creating
      const duplicateCheckResult = await this.checkForDuplicateAccountName(
        category,
        existingAccountsQuery.rows as Array<{
          id: number;
          name: string;
          notes?: string;
          account_code: string;
        }>
      );

      let finalAccountName = category;
      if (duplicateCheckResult.isDuplicate) {
        finalAccountName =
          duplicateCheckResult.suggestedName || `${category} (Modified)`;
        console.log(
          `[ReceiptAgent] AI detected potential duplicate. Using suggested name: ${finalAccountName}`
        );
      }

      // Ensure finalAccountName is always a string
      finalAccountName = String(finalAccountName);

      // Generate appropriate account code based on account type
      const accountCode = await this.generateIntelligentAccountCode(
        finalAccountName,
        "expense",
        existingAccountsQuery.rows as Array<{
          id: number;
          name: string;
          notes?: string;
          account_code: string;
        }>
      );

      const insertResult = await sql`
        INSERT INTO accounts (name, account_code, account_type, notes, user_id, is_active) 
        VALUES (
          ${finalAccountName}, 
          ${accountCode}, 
          'expense', 
          ${`Auto-created expense account for category: ${category}.`}, 
          ${context.userId || null}, 
          true
        ) 
        RETURNING id
      `;

      if (insertResult.rows.length > 0) {
        const newAccountId = insertResult.rows[0].id;
        console.log(
          `[ReceiptAgent] Created expense account: ${category} (ID: ${newAccountId})`
        );
        return newAccountId;
      }

      throw new Error("Failed to create expense account");
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error finding/creating expense account:`,
        error
      );
      throw error;
    }
  }

  /**
   * Use AI to check for potential duplicate account names before creating a new account
   * @param accountName The proposed account name
   * @param existingAccounts Array of existing accounts
   * @returns Promise with the result
   */
  private async checkForDuplicateAccountName(
    accountName: string,
    existingAccounts: Array<{ id: number; name: string; notes?: string; account_code: string }>
  ): Promise<{
    isDuplicate: boolean;
    suggestedName?: string;
    reasoning: string;
  }> {
    try {
      // Prepare the account list for AI analysis
      const accountList = existingAccounts
        .map(
          (acc, index) =>
            `${index + 1}. "${acc.name}" (ID: ${acc.id})${
              acc.notes ? ` - Notes: ${acc.notes}` : ""
            }`
        )
        .join("\n");

      const prompt = `You are an expert accountant analyzing account names to prevent duplicates.

TASK: Determine if the proposed account name "${accountName}" is a duplicate of any existing account:

${accountList}

ANALYSIS CRITERIA:
- Look for exact matches (case-insensitive)
- Consider similar names with minor differences (e.g., "Office Supplies" vs "Office Supply")
- Evaluate account notes for additional context

RESPONSE FORMAT:
{
  "isDuplicate": true|false,
  "suggestedName": "[new suggested name if duplicate, or null if not]",
  "reasoning": "[brief explanation of your decision]"
}

IMPORTANT: Only suggest a duplicate if you're confident it's a match. When in doubt, return false.`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      const parsed = await this.extractJsonWithAI(result, `{
        "isDuplicate": true|false,
        "suggestedName": "alternative name if duplicate",
        "reasoning": "explanation of decision"
      }`);
      
      return {
        isDuplicate: parsed.isDuplicate || false,
        suggestedName: parsed.suggestedName || undefined,
        reasoning: parsed.reasoning || 'AI analysis failed'
      };
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error in AI duplicate account name check:`,
        error
      );
      return {
        isDuplicate: false,
        reasoning: `AI analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Use AI to find the best matching account for a given expense category
   * @param category The expense category to match
   * @param existingAccounts Array of existing expense accounts
   * @returns Promise with the best match result
   */
  private async findBestAccountMatch(
    category: string,
    existingAccounts: Array<{ id: number; name: string; notes?: string; account_code: string }>
  ): Promise<{
    accountId?: number;
    accountName?: string;
    confidence: "high" | "medium" | "low" | "none";
    reasoning: string;
  }> {
    try {
      // Prepare the account list for AI analysis
      const accountList = existingAccounts
        .map(
          (acc, index) =>
            `${index + 1}. "${acc.name}" (ID: ${acc.id})${
              acc.notes ? ` - Notes: ${acc.notes}` : ""
            }`
        )
        .join("\n");

      const prompt = `You are an expert CPA with deep GAAP (Generally Accepted Accounting Principles) knowledge analyzing expense categories to find the best matching GL account.

TASK: Determine if the expense category "${category}" matches any of these existing expense accounts:

${accountList}

GAAP ACCOUNTING PRINCIPLES FOR MATCHING:

**OPERATING EXPENSES (Proper Classification):**
- Service fees, processing fees, convenience fees → "Service Fees" or "Operating Expenses" (NOT "Bank Charges")
- Restaurant service charges → "Service Fees" or "Meals & Entertainment" 
- Credit card processing fees → "Credit Card Processing Fees" or "Service Fees" (NOT "Bank Charges")
- Transaction fees from vendors → "Transaction Fees" or "Service Fees"

**IMPORTANT GAAP DISTINCTIONS:**
❌ DO NOT match vendor service fees to "Bank Charges", "Bank Fees", or "Banking Expenses"
❌ Bank charges are fees charged BY your bank TO you (overdraft, monthly fees, wire fees)
✅ Service fees on receipts are operating expenses paid TO vendors for services
✅ Processing fees are operating expenses, not bank charges

**ANALYSIS CRITERIA:**
- Look for semantic similarity with proper GAAP classification
- Consider accounting best practices and proper expense categorization
- Account for common business expense categorizations following GAAP
- Consider synonyms and related terms within proper accounting framework
- Evaluate account notes for additional context
- Prioritize proper GAAP classification over superficial name matching

**CONFIDENCE LEVELS:**
- HIGH: Very clear match with proper GAAP classification (90%+ certainty)
- MEDIUM: Good match with minor differences but correct GAAP category (70-89% certainty)
- LOW: Possible match but uncertain about GAAP compliance (50-69% certainty)
- NONE: No suitable match found or would violate GAAP principles (<50% certainty)

**EXAMPLES:**
- "Service Fee" should match "Service Fees" or "Operating Expenses" (HIGH confidence)
- "Service Fee" should NOT match "Bank Charges" (NONE confidence - GAAP violation)
- "Processing Fee" should match "Credit Card Processing Fees" or "Service Fees" (HIGH confidence)
- "Processing Fee" should NOT match "Bank Fees" (NONE confidence - GAAP violation)

Respond with a JSON object:
{
"accountId": [account ID number or null if no match],
"accountName": "[exact account name or null if no match]",
"confidence": "high|medium|low|none",
"reasoning": "[brief explanation of your decision with GAAP justification]"
}

IMPORTANT: Only suggest a match if it follows proper GAAP classification. When in doubt or if matching would violate GAAP principles, return null to create a new properly classified account.`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      const parsed = await this.extractJsonWithAI(result, `{
        "accountId": number|null,
        "accountName": "exact account name"|null,
        "confidence": "high|medium|low|none",
        "reasoning": "brief explanation with GAAP justification"
      }`);
      
      return {
        accountId: parsed.accountId || undefined,
        accountName: parsed.accountName || undefined,
        confidence: parsed.confidence || 'none',
        reasoning: parsed.reasoning || 'AI analysis failed'
      };
    } catch (error) {
      console.error(`[ReceiptAgent] Error in AI account matching:`, error);
      return {
        confidence: "none",
        reasoning: `AI analysis failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  /**
   * Generate intelligent journal type using AI based on transaction context
   */
  private async generateIntelligentJournalType(
    receiptInfo: any,
    transactionContext: string
  ): Promise<string> {
    try {
      const prompt = `You are an expert accountant determining the appropriate journal type for a financial transaction.

TRANSACTION CONTEXT: ${transactionContext}

RECEIPT DETAILS:
- Vendor: "${receiptInfo.vendorName}"
- Date: "${receiptInfo.receiptDate}"
- Total Amount: "$${receiptInfo.totalAmount}"
- Payment Method: "${receiptInfo.paymentMethod || "N/A"}"
- Transaction Type: Receipt (already completed transaction)

AVAILABLE JOURNAL TYPES (3-character codes only):
- GJ (General Journal) - For miscellaneous transactions that don't fit into specialized journals
- AP (Accounts Payable) - For vendor bills and payment transactions
- AR (Accounts Receivable) - For customer invoices and receipt transactions
- CR (Cash Receipts) - For incoming cash and payments from various sources
- CD (Cash Disbursements) - For outgoing cash and payments for various purposes
- PR (Payroll) - For employee compensation, benefits, and tax withholdings
- FA (Fixed Assets) - For capital asset purchases, depreciation, and disposals
- ADJ (Adjusting Entries) - For period-end adjustments and corrections
- BP (Bill Payment) - For bill payment transactions
- BR (Bill Refund) - For bill refund transactions
- CCP (Credit Card Purchase) - For credit card purchases and expenses
- CCY (Credit Card Payment) - For payments made to credit card accounts
- CCR (Credit Card Refund) - For credit card refunds and returns
- BB (Beginning Balance) - For recording beginning balances when setting up accounts

ANALYSIS CRITERIA:
- Consider that this is a receipt representing an already completed transaction
- Consider the payment method used (credit card transactions should use CCP)
- Consider standard accounting practices for transaction categorization
- Consider the nature of the expense (meals, supplies, etc.)
- For receipts with credit card payments, prefer CCP (Credit Card Purchase)
- For cash transactions, prefer CR (Cash Receipts) or CD (Cash Disbursements)
- For general expenses already paid, consider CCP or CD depending on payment method

RESPONSE FORMAT: Return ONLY the 3-character journal type code (e.g., "CCP", "CR", "CD", etc.)`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      // Validate the response is a reasonable journal type
      const validTypes = [
        "GJ",
        "AP",
        "AR",
        "CR",
        "CD",
        "PR",
        "FA",
        "ADJ",
        "BP",
        "BR",
        "CCP",
        "CCY",
        "CCR",
        "BB",
      ];
      if (validTypes.includes(result)) {
        console.log(
          `[ReceiptAgent] AI selected journal type: ${result} for ${receiptInfo.vendorName} receipt`
        );
        return result;
      } else {
        console.warn(
          `[ReceiptAgent] AI returned invalid journal type: ${result}, falling back to CR`
        );
        return "CR";
      }
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error generating intelligent journal type:`,
        error
      );
      // Fallback to CR for completed transactions
      return "CR";
    }
  }

  /**
   * Generate a general explanation of service using AI based on vendor and line items
   */
  private async generateServiceExplanation(
    vendorName: string,
    lineItems: any[]
  ): Promise<string> {
    try {
      const itemDescriptions = lineItems
        .map((item) => item.description)
        .join(", ");

      const prompt = `Based on the vendor name "${vendorName}" and the items purchased: "${itemDescriptions}", generate a brief, professional explanation of the service or business purpose for this expense. 

Keep it concise (1-2 sentences) and business-appropriate. Focus on the likely business purpose or service provided.

Examples:
- For a restaurant: "Business meal and entertainment expenses"
- For an office supply store: "Office supplies and equipment for business operations"
- For a gas station: "Vehicle fuel and travel expenses"
- For a software company: "Software services and technology solutions"

Return only the explanation text, no additional formatting or quotes.`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 100,
        temperature: 0.3,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      return result || `Business expenses from ${vendorName}`;
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error generating service explanation:`,
        error
      );
      return `Business expenses from ${vendorName}`;
    }
  }

  /**
   * Generate intelligent bill number using AI based on receipt information
   */
  private async generateIntelligentBillNumber(
    receiptInfo: any,
    receiptId: string
  ): Promise<string> {
    try {
      const prompt = `You are an expert accountant generating intelligent bill numbers following standard accounting practices.

TASK: Generate a suitable bill number for a receipt with the following details:
- Vendor: "${receiptInfo.vendorName}"
- Date: "${receiptInfo.receiptDate}"
- Total: "$${receiptInfo.totalAmount}"
- Payment Method: "${receiptInfo.paymentMethod || "N/A"}"
- Last 4 Digits: "${receiptInfo.lastFourDigits || "N/A"}"
- Receipt ID: "${receiptId}"

BILL NUMBER FORMAT REQUIREMENTS:
1. Start with "RECEIPT-"
2. Include date in YYYYMMDD format (${receiptInfo.receiptDate.replace(
        /-/g,
        ""
      )})
3. Add a meaningful unique identifier from the receipt data

RESPONSE: Return ONLY the bill number (e.g., "RECEIPT-20230804-PION58")`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      // Simple validation and fallback
      if (result && result.startsWith("RECEIPT-")) {
        return result;
      } else {
        const dateFormatted = receiptInfo.receiptDate.replace(/-/g, "");
        return `RECEIPT-${dateFormatted}-${receiptId}`;
      }
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error generating intelligent bill number:`,
        error
      );
      const dateFormatted = receiptInfo.receiptDate.replace(/-/g, "");
      return `RECEIPT-${dateFormatted}-${receiptId}`;
    }
  }

  /**
   * Use AI to generate an intelligent GL account code based on the account name and type
   */
  private async generateIntelligentAccountCode(
    accountName: string,
    accountType: string,
    existingAccounts: Array<{ id: number; name: string; notes?: string; account_code: string }>
  ): Promise<string> {
    try {
      // First, check if we have existing accounts to avoid duplicates
      const existingCodes = existingAccounts.map(acc => acc.account_code);
      
      const prompt = `Generate a 5-digit GL account code for "${accountName}" (type: ${accountType})

STANDARD RANGES:
- Assets: 10000-19999
- Liabilities: 20000-29999  
- Equity: 30000-39999
- Revenue: 40000-49999
- Expenses: 50000-59999

RESPONSE: Return ONLY the 5-digit code (e.g., "52100")`;

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const result = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
      
      // Simple validation and fallback
      if (result && /^\d{5}$/.test(result)) {
        // Check if this code already exists in the database
        const { rows: existingCodeCheck } = await sql`
          SELECT id FROM accounts WHERE account_code = ${result} LIMIT 1
        `;
        
        if (existingCodeCheck.length === 0) {
          return result;
        } else {
          console.log(`[ReceiptAgent] AI generated code ${result} already exists, using fallback`);
        }
      }
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error generating intelligent account code:`,
        error
      );
    }
    
    // Robust fallback: generate a unique code based on account type
    return await this.generateFallbackAccountCode(accountType);
  }

  /**
   * Generate a fallback account code that's guaranteed to be unique
   */
  private async generateFallbackAccountCode(accountType: string): Promise<string> {
    const ranges = {
      expense: { start: 50000, end: 59999 },
      liability: { start: 20000, end: 29999 },
      asset: { start: 10000, end: 19999 },
      equity: { start: 30000, end: 39999 },
      revenue: { start: 40000, end: 49999 }
    };

    const range = ranges[accountType as keyof typeof ranges] || ranges.expense;
    
    // Try to find the next available sequential code
    for (let code = range.start; code <= range.end; code++) {
      const { rows: existingCodeCheck } = await sql`
        SELECT id FROM accounts WHERE account_code = ${code.toString()} LIMIT 1
      `;
      
      if (existingCodeCheck.length === 0) {
        return code.toString();
      }
    }
    
    // If all sequential codes are taken, use random with timestamp
    const timestamp = Date.now().toString().slice(-3);
    return `${range.start + parseInt(timestamp)}`;
  }

  /**
   * Find or create a payment account based on receipt payment information
   */
  private async findOrCreatePaymentAccount(
    context: AgentContext,
    receiptInfo: any
  ): Promise<number> {
    try {
      // Determine payment account based on payment method
      let accountName = "Cash";
      let accountType = "asset";

      if (receiptInfo.paymentMethod) {
        const paymentMethod = receiptInfo.paymentMethod.toLowerCase();
        if (
          paymentMethod.includes("credit") ||
          paymentMethod.includes("card")
        ) {
          if (receiptInfo.lastFourDigits) {
            accountName = `Credit Card ****${receiptInfo.lastFourDigits}`;
          } else {
            accountName = "Credit Card";
          }
          accountType = "liability";
        } else if (
          paymentMethod.includes("debit") ||
          paymentMethod.includes("bank")
        ) {
          accountName = "Checking Account";
          accountType = "asset";
        }
      }

      // Try to find existing account
      const existingAccountQuery = await sql`
        SELECT id FROM accounts 
        WHERE LOWER(name) = LOWER(${accountName})
        AND account_type = ${accountType}
        AND user_id = ${context.userId || null}
        AND is_active = true
        LIMIT 1
      `;

      if (existingAccountQuery.rows.length > 0) {
        return existingAccountQuery.rows[0].id;
      }

      // Create new payment account if not found
      const existingAccounts = await sql`
        SELECT id, name, account_code, notes FROM accounts 
        WHERE account_type = ${accountType}
        AND user_id = ${context.userId || null}
        AND is_active = true
      `;

      const accountCode = await this.generateIntelligentAccountCode(
        accountName,
        accountType,
        existingAccounts.rows as Array<{
          id: number;
          name: string;
          notes?: string;
          account_code: string;
        }>
      );

      const insertResult = await sql`
        INSERT INTO accounts (name, account_code, account_type, notes, user_id, is_active) 
        VALUES (
          ${accountName}, 
          ${accountCode}, 
          ${accountType}, 
          ${`Auto-created payment account for ${
            receiptInfo.paymentMethod || "receipt payments"
          }.`}, 
          ${context.userId || null}, 
          true
        ) 
        RETURNING id
      `;

      return insertResult.rows[0].id;
    } catch (error) {
      console.error(
        `[ReceiptAgent] Error finding/creating payment account:`,
        error
      );

      // Fallback: try to find any cash account
      const fallbackQuery = await sql`
        SELECT id FROM accounts 
        WHERE LOWER(name) LIKE '%cash%'
        AND account_type = 'asset'
        AND user_id = ${context.userId || null}
        AND is_active = true
        LIMIT 1
      `;

      if (fallbackQuery.rows.length > 0) {
        return fallbackQuery.rows[0].id;
      }

      throw new Error("Unable to find or create payment account");
    }
  }

  /**
   * Use AI to extract and clean JSON from potentially malformed AI responses
   */
  private async extractJsonWithAI(rawResponse: string, expectedSchema: string): Promise<any> {
    try {
      // First try direct parsing
      return JSON.parse(rawResponse);
    } catch (firstError) {
      // If direct parsing fails, use AI to extract and clean the JSON
      try {
        const prompt = `Extract and clean the JSON from this AI response. The response should match this schema: ${expectedSchema}

RESPONSE TO CLEAN:
${rawResponse}

TASK:
1. Find the JSON object in the response
2. Fix any formatting issues
3. Ensure it matches the expected schema
4. Return ONLY the valid JSON object, no explanations

EXPECTED SCHEMA: ${expectedSchema}`;

        const response = await this.anthropic.messages.create({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: 200,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        });

        const cleanedResult = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
        return JSON.parse(cleanedResult);
      } catch (aiError) {
        console.warn(`[ReceiptAgent] AI JSON extraction failed:`, aiError);
        throw new Error(`Failed to extract JSON: ${rawResponse.substring(0, 100)}...`);
      }
    }
  }
}

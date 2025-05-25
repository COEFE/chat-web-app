import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { CreditCardTransaction } from "../../types/creditCard";

/**
 * Enhanced statement information that includes starting balance
 */
export interface EnhancedStatementInfo {
  success: boolean;
  message: string;
  creditCardIssuer?: string;
  lastFourDigits?: string;
  statementNumber?: string;
  statementDate?: string;
  balance?: number; // Current/ending balance
  previousBalance?: number; // Starting balance from previous statement
  newCharges?: number; // Total new charges
  payments?: number; // Total payments made
  credits?: number; // Total credits/refunds
  dueDate?: string;
  minimumPayment?: number;
  transactions?: CreditCardTransaction[];
}

/**
 * Enhanced credit card statement extractor that specifically handles starting balances
 */
export class CreditCardStartingBalanceExtractor {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }
    this.anthropic = new Anthropic({ apiKey });
  }

  /**
   * Extract enhanced statement information including starting balance
   */
  async extractEnhancedStatementInfo(
    query: string,
    documentContext?: any
  ): Promise<EnhancedStatementInfo> {
    try {
      console.log("[CreditCardStartingBalanceExtractor] Extracting enhanced statement info with starting balance");

      // Enhanced system prompt that specifically looks for starting/previous balance
      const systemPrompt = `You are a financial assistant that extracts comprehensive credit card statement information. Your task is to carefully analyze the provided credit card statement and extract all relevant details, with special attention to balance information.

CRITICAL: Pay special attention to balance fields on the statement. Credit card statements typically show:
- Previous Balance (also called Starting Balance, Prior Balance, or Balance Forward)
- New Charges/Purchases
- Payments Made
- Credits/Refunds
- New Balance (Current Balance, Ending Balance)

Extract the following information from the statement:
1. Credit card issuer (e.g., Visa, Mastercard, American Express, Chase, Capital One)
2. Last four digits of the card - ONLY use digits that are explicitly shown in the document
3. Statement number or account number - extract EXACTLY as shown
4. Statement date (in YYYY-MM-DD format)
5. **PREVIOUS BALANCE** - This is the starting balance from the previous statement period (look for "Previous Balance", "Prior Balance", "Balance Forward", "Starting Balance")
6. **NEW CHARGES** - Total amount of new purchases/charges during this statement period
7. **PAYMENTS** - Total payments made during this statement period
8. **CREDITS** - Total credits, refunds, or other credits during this statement period
9. **NEW BALANCE** - The current/ending balance (total amount due)
10. Payment due date (in YYYY-MM-DD format)
11. Minimum payment amount
12. List of transactions with details

For American Express statements, look for sections like:
- "Previous Balance: $X,XXX.XX"
- "New Charges: $XXX.XX"
- "Payments: $X,XXX.XX"
- "Other Credits: $X.XX"
- "New Balance: $XXX.XX"

Format your response as a JSON object with the following structure:
{
  "creditCardIssuer": "string",
  "lastFourDigits": "string",
  "statementNumber": "string",
  "statementDate": "string (YYYY-MM-DD)",
  "previousBalance": number (starting balance from previous period),
  "newCharges": number (total new charges this period),
  "payments": number (total payments made this period),
  "credits": number (total credits/refunds this period),
  "balance": number (current/ending balance),
  "dueDate": "string (YYYY-MM-DD)",
  "minimumPayment": number,
  "transactions": [
    {
      "date": "string (YYYY-MM-DD)",
      "description": "string",
      "amount": number (positive for charges, negative for payments/credits),
      "category": "string" (optional)
    }
  ]
}

Important guidelines:
- **CRITICAL**: The previousBalance field is the most important new field - this represents the starting balance
- For amounts, use positive numbers for charges and negative numbers for payments/credits in transactions
- If you cannot extract certain information, use null for that field
- CRITICAL FOR BALANCE FIELDS: Look specifically for balance summary sections that show the progression from previous balance to new balance
- Extract balance information exactly as shown on the statement
- Return ONLY the JSON object without any additional text
- Only extract information that is explicitly present in the document`;

      // Prepare message content
      let messageContent: any = query;

      // If we have a PDF document context, use it for multimodal analysis
      if (
        documentContext &&
        documentContext.type === "pdf" &&
        documentContext.content
      ) {
        console.log(
          `[CreditCardStartingBalanceExtractor] Using PDF document: ${documentContext.name}`
        );

        messageContent = [
          {
            type: "text",
            text: `Analyze this credit card statement PDF and extract all relevant information, paying special attention to balance fields including the previous/starting balance. ${query}`,
          },
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: documentContext.content,
            },
          },
        ];
      }

      // Prepare messages for the API call
      const messages: MessageParam[] = [
        {
          role: "user",
          content: messageContent,
        },
      ];

      console.log("[CreditCardStartingBalanceExtractor] Calling Anthropic API for enhanced extraction");

      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages,
      });

      // Extract the response content
      const responseContent = response.content[0];
      if (responseContent.type !== "text") {
        throw new Error("Expected text response from Anthropic");
      }

      const responseText = responseContent.text.trim();
      console.log(`[CreditCardStartingBalanceExtractor] Raw AI response: ${responseText}`);

      // Parse the JSON response
      let extractedInfo: any;
      try {
        // Clean up the response to ensure it's valid JSON
        const cleanedResponse = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();

        extractedInfo = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error("[CreditCardStartingBalanceExtractor] Failed to parse AI response:", parseError);
        console.error("[CreditCardStartingBalanceExtractor] Raw response:", responseText);
        return {
          success: false,
          message: `Failed to parse AI response: ${parseError}`,
        };
      }

      // Validate and structure the response
      const result: EnhancedStatementInfo = {
        success: true,
        message: "Enhanced statement information extracted successfully",
        creditCardIssuer: extractedInfo.creditCardIssuer || undefined,
        lastFourDigits: extractedInfo.lastFourDigits || undefined,
        statementNumber: extractedInfo.statementNumber || undefined,
        statementDate: extractedInfo.statementDate || undefined,
        previousBalance: extractedInfo.previousBalance || undefined,
        newCharges: extractedInfo.newCharges || undefined,
        payments: extractedInfo.payments || undefined,
        credits: extractedInfo.credits || undefined,
        balance: extractedInfo.balance || undefined,
        dueDate: extractedInfo.dueDate || undefined,
        minimumPayment: extractedInfo.minimumPayment || undefined,
        transactions: extractedInfo.transactions || [],
      };

      console.log("[CreditCardStartingBalanceExtractor] Enhanced extraction result:");
      console.log(`- Previous Balance: $${result.previousBalance?.toFixed(2) || "Not found"}`);
      console.log(`- New Charges: $${result.newCharges?.toFixed(2) || "Not found"}`);
      console.log(`- Payments: $${result.payments?.toFixed(2) || "Not found"}`);
      console.log(`- Credits: $${result.credits?.toFixed(2) || "Not found"}`);
      console.log(`- New Balance: $${result.balance?.toFixed(2) || "Not found"}`);
      console.log(`- Transactions: ${result.transactions?.length || 0} found`);

      return result;
    } catch (error) {
      console.error("[CreditCardStartingBalanceExtractor] Error extracting enhanced statement info:", error);
      return {
        success: false,
        message: `Error extracting statement information: ${error}`,
      };
    }
  }

  /**
   * Validate that the extracted balance information is consistent
   */
  validateBalanceConsistency(statementInfo: EnhancedStatementInfo): {
    isValid: boolean;
    message: string;
    calculatedBalance?: number;
  } {
    if (!statementInfo.success) {
      return {
        isValid: false,
        message: "Statement extraction failed",
      };
    }

    const { previousBalance, newCharges, payments, credits, balance } = statementInfo;

    // If we have all the components, validate the balance calculation
    if (
      previousBalance !== undefined &&
      newCharges !== undefined &&
      payments !== undefined &&
      credits !== undefined &&
      balance !== undefined
    ) {
      // Calculate expected balance: Previous Balance + New Charges - Payments + Credits
      const calculatedBalance = previousBalance + newCharges - payments + credits;
      const difference = Math.abs(calculatedBalance - balance);
      const tolerance = 0.01; // Allow for rounding differences

      if (difference <= tolerance) {
        return {
          isValid: true,
          message: "Balance calculation is consistent",
          calculatedBalance,
        };
      } else {
        return {
          isValid: false,
          message: `Balance calculation inconsistent. Expected: $${calculatedBalance.toFixed(2)}, Actual: $${balance.toFixed(2)}, Difference: $${difference.toFixed(2)}`,
          calculatedBalance,
        };
      }
    }

    return {
      isValid: true,
      message: "Insufficient data for balance validation",
    };
  }
}

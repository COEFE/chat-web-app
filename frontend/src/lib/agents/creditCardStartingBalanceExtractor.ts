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
- Previous Balance (also called Starting Balance, Prior Balance, or Balance Forward) - THIS IS THE BALANCE FROM THE END OF THE PREVIOUS STATEMENT PERIOD
- New Charges/Purchases
- Payments Made
- Credits/Refunds
- New Balance (Current Balance, Ending Balance) - THIS IS THE TOTAL AMOUNT CURRENTLY OWED

CRITICAL FOR ALL CREDIT CARD STATEMENTS:
Look for the balance summary section that shows a progression like:
- "Previous Balance: $X,XXX.XX" (this is what you want for previousBalance)
- "New Charges/Purchases: $XXX.XX"
- "Payments: $XXX.XX" 
- "Credits/Refunds: $X.XX"
- "New Balance: $XXX.XX" (this is the current balance)

Common variations across different issuers:
- Chase: "Previous Balance", "Purchases", "Payments", "New Balance"
- Capital One: "Previous Balance", "Purchases & Adjustments", "Payments & Credits", "New Balance"
- Citi: "Previous Balance", "New Charges", "Payments/Credits", "New Balance"
- Discover: "Previous Balance", "New Purchases", "Payments", "New Balance"
- Bank of America: "Previous Balance", "Purchases", "Payments", "New Balance"
- American Express: "Previous Balance", "New Charges", "Payments", "Other Credits", "New Balance"

DO NOT confuse:
- "Previous Balance" (starting balance from last period) vs "New Balance" (current amount owed)
- "Balance Please Pay By" or "Amount Due" (current payment amount) vs "Previous Balance" (starting balance)
- "Minimum Payment Due" vs "Previous Balance" (starting balance)
- Payment coupon amounts vs the actual previous balance from the statement period
- Statement closing balance vs payment due amount

Extract the following information from the statement:
1. Credit card issuer (e.g., Visa, Mastercard, American Express, Chase, Capital One, Citi, Discover, Bank of America)
2. **LAST FOUR DIGITS OF THE CARD** - Look for these in multiple locations:
   - Account number section (usually shows as XXXX-XXXX-XXXX-1234)
   - Card number references (often partially masked like ****1234)
   - Account summary section
   - Header or footer of the statement
   - Payment coupon section
   - CRITICAL: Extract ONLY the actual 4-digit number, not any other reference numbers
   - CRITICAL: Do NOT use statement numbers, reference numbers, or any other identifiers
   - CRITICAL: The last four digits should be exactly 4 numeric digits from the actual credit card number
3. Statement number or account number - extract EXACTLY as shown
4. Statement date (in YYYY-MM-DD format)
5. **PREVIOUS BALANCE** - This is the starting balance from the previous statement period
   - Look for: "Previous Balance", "Prior Balance", "Balance Forward", "Starting Balance", "Opening Balance"
   - CRITICAL: This should be the balance that was carried over from the previous statement
   - DO NOT use "Balance Please Pay By", "Amount Due", "Minimum Payment", or payment coupon amounts
   - Look specifically in the balance summary section, not the payment section
   - This is typically the first line item in the balance calculation section
6. **NEW CHARGES** - Total amount of new purchases/charges during this statement period
   - Look for: "New Charges", "Purchases", "New Purchases", "Purchases & Adjustments"
7. **PAYMENTS** - Total payments made during this statement period
   - Look for: "Payments", "Payments & Credits", "Credits"
8. **CREDITS** - Total credits, refunds, or other credits during this statement period
   - Look for: "Credits", "Refunds", "Other Credits", "Adjustments"
9. **NEW BALANCE** - The current/ending balance (total amount due)
   - Look for: "New Balance", "Current Balance", "Ending Balance", "Statement Balance"
   - This is different from the previous balance - it's the current total owed
10. Payment due date (in YYYY-MM-DD format)
11. Minimum payment amount
12. List of transactions with details

BALANCE CALCULATION VERIFICATION:
The statement should show: Previous Balance + New Charges - Payments - Credits = New Balance
Use this formula to verify you've identified the correct balance fields.

IMPORTANT FOR LAST FOUR DIGITS:
- Look for the actual credit card number, which is usually displayed as XXXX-XXXX-XXXX-1234 or ****1234
- Do NOT confuse with account numbers, statement numbers, or reference numbers
- The last four digits should be from the physical credit card number
- If you see multiple 4-digit numbers, prioritize the one that appears with the card number or account number
- Common locations: account summary, payment information, card details section

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

      // Enhanced debugging for balance extraction
      console.log("[CreditCardStartingBalanceExtractor] BALANCE EXTRACTION DEBUG:");
      console.log(`  - Previous Balance (starting): ${extractedInfo.previousBalance}`);
      console.log(`  - New Charges: ${extractedInfo.newCharges}`);
      console.log(`  - Payments: ${extractedInfo.payments}`);
      console.log(`  - Credits: ${extractedInfo.credits}`);
      console.log(`  - New Balance (ending): ${extractedInfo.balance}`);
      console.log(`  - Minimum Payment: ${extractedInfo.minimumPayment}`);
      
      // Validate balance calculation if all values are present
      if (extractedInfo.previousBalance !== null && extractedInfo.newCharges !== null && 
          extractedInfo.payments !== null && extractedInfo.credits !== null && 
          extractedInfo.balance !== null) {
        const calculatedBalance = extractedInfo.previousBalance + extractedInfo.newCharges - extractedInfo.payments - extractedInfo.credits;
        const actualBalance = extractedInfo.balance;
        const balanceDifference = Math.abs(calculatedBalance - actualBalance);
        
        console.log(`[CreditCardStartingBalanceExtractor] BALANCE VERIFICATION:`);
        console.log(`  - Calculated: ${extractedInfo.previousBalance} + ${extractedInfo.newCharges} - ${extractedInfo.payments} - ${extractedInfo.credits} = ${calculatedBalance}`);
        console.log(`  - Actual New Balance: ${actualBalance}`);
        console.log(`  - Difference: ${balanceDifference}`);
        
        if (balanceDifference > 0.01) {
          console.warn(`[CreditCardStartingBalanceExtractor] WARNING: Balance calculation doesn't match! Difference: $${balanceDifference}`);
          console.warn(`[CreditCardStartingBalanceExtractor] This may indicate incorrect balance field extraction`);
        } else {
          console.log(`[CreditCardStartingBalanceExtractor] ✓ Balance calculation verified correctly`);
        }
      }

      // Validate last four digits
      if (result.lastFourDigits) {
        if (!/^\d{4}$/.test(result.lastFourDigits)) {
          console.error("[CreditCardStartingBalanceExtractor] Invalid last four digits:", result.lastFourDigits);
          result.lastFourDigits = undefined;
        }
      }

      console.log(`[CreditCardStartingBalanceExtractor] Extracted statement info:`, {
        creditCardIssuer: result.creditCardIssuer,
        lastFourDigits: result.lastFourDigits,
        statementNumber: result.statementNumber,
        statementDate: result.statementDate,
        previousBalance: result.previousBalance,
        balance: result.balance
      });

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

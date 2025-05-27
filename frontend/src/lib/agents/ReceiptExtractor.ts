import { Anthropic } from "@anthropic-ai/sdk";
import { MessageParam } from "@anthropic-ai/sdk/resources";

export interface ReceiptLineItem {
  description: string;
  amount: number;
  quantity?: number;
  unitPrice?: number;
  categoryGuess?: string; // AI's best guess for the GL category
}

export interface ReceiptInfo {
  vendorName?: string;
  receiptDate?: string; // YYYY-MM-DD
  lastFourDigits?: string; // Last four digits of the credit card used
  lineItems: ReceiptLineItem[];
  subTotal?: number;
  taxAmount?: number;
  tipAmount?: number;
  totalAmount?: number;
  currency?: string;
  paymentMethod?: string;
  rawText?: string; // Full text extracted from receipt (optional)
}

interface ExtractionResult {
  success: boolean;
  message?: string;
  receiptInfo?: ReceiptInfo;
}

export class ReceiptExtractor {
  private anthropic: Anthropic;

  constructor(anthropicInstance: Anthropic) {
    this.anthropic = anthropicInstance;
  }

  private getSystemPrompt(): string {
    // This prompt needs to be carefully crafted for multimodal input (image + text)
    return `You are an expert CPA with deep GAAP (Generally Accepted Accounting Principles) knowledge. Your task is to meticulously analyze the provided receipt image and extract detailed information with proper accounting classification. Structure your response as a JSON object adhering to the specified schema.

    CRITICAL INSTRUCTIONS:
    1.  **Vendor Name**: Identify the merchant or store name.
    2.  **Receipt Date**: Extract the date of the transaction in YYYY-MM-DD format. If the year is ambiguous, assume the current year or the most recent sensible year.
    3.  **Last Four Digits**: If visible, extract the last four digits of the credit card used for payment. Look for patterns like XXXX-XXXX-XXXX-1234 or ****1234.
    4.  **Line Items**: This is the most crucial part. For EACH item on the receipt:
        *   **description**: The full description of the item purchased.
        *   **amount**: The total price for that line item. If a line item shows quantity and unit price (e.g., 2 x $5.00), the amount should be the total ($10.00).
        *   **quantity** (optional): If specified, extract the quantity of the item.
        *   **unitPrice** (optional): If specified, extract the price per unit.
        *   **categoryGuess** (optional): Based on GAAP accounting principles, provide the correct expense classification. 

    GAAP ACCOUNTING CLASSIFICATION RULES FOR categoryGuess:
    
    **OPERATING EXPENSES (Most Common):**
    - "Meals & Entertainment" - Food, drinks, restaurant charges, business meals
    - "Office Supplies" - Pens, paper, office equipment, software subscriptions
    - "Professional Services" - Legal, accounting, consulting fees
    - "Utilities" - Electricity, gas, water, internet, phone
    - "Rent Expense" - Office rent, equipment rental
    - "Travel Expense" - Airfare, hotels, car rentals, mileage
    - "Fuel Expense" - Gas for vehicles
    - "Insurance Expense" - Business insurance premiums
    - "Marketing & Advertising" - Promotional materials, ads, marketing services
    - "Training & Education" - Courses, conferences, training materials
    - "Maintenance & Repairs" - Equipment repairs, building maintenance
    - "Shipping & Postage" - Delivery fees, postage, courier services
    - "Telecommunications" - Phone, internet, communication services
    - "Subscriptions & Memberships" - Software subscriptions, professional memberships
    
    **SERVICE FEES & PROCESSING FEES:**
    - "Service Fees" - Restaurant service charges, processing fees, convenience fees
    - "Credit Card Processing Fees" - Merchant processing fees (NOT bank charges)
    - "Transaction Fees" - Payment processing, transaction fees from vendors
    
    **IMPORTANT GAAP DISTINCTIONS:**
    ❌ DO NOT classify vendor service fees as "Bank Charges" or "Bank Fees"
    ❌ Bank charges are for fees charged BY your bank TO you (overdraft fees, monthly fees)
    ✅ Service fees on receipts are operating expenses paid TO vendors for services
    ✅ Credit card processing fees are operating expenses, not bank charges
    ✅ Convenience fees, service charges, and gratuity are operating expenses
    
    **EXAMPLES:**
    - "Svc Charge Operations Fee" on restaurant receipt → "Service Fees" (NOT "Bank Charges")
    - "Processing Fee" on payment → "Credit Card Processing Fees" (NOT "Bank Charges")  
    - "Convenience Fee" → "Service Fees" (NOT "Bank Charges")
    - "Gratuity" or "Tip" → "Meals & Entertainment"
    - "Delivery Fee" → "Shipping & Postage"
    5.  **SubTotal** (optional): The total amount before taxes and tip.
    6.  **Tax Amount** (optional): The total amount of sales tax.
    7.  **Tip Amount** (optional): Any gratuity or tip included.
    8.  **Total Amount**: The final amount paid. THIS MUST MATCH THE SUM OF LINE ITEMS + TAX + TIP if those are present, or be the prominent total on the receipt.
    9.  **Currency** (optional): The currency code (e.g., USD, CAD, EUR). Assume USD if not specified.
    10. **Payment Method** (optional): e.g., Visa, Mastercard, Amex, Cash, Debit.

    LINE ITEM EXTRACTION RULES:
    *   Extract EVERY distinct item. Do not summarize or group items unless they are identically listed multiple times and the receipt itself shows a summary for them.
    *   If a line item's price isn't explicitly stated but can be inferred (e.g., part of a subtotal for a section), make a reasonable inference. If no amount can be associated, you may omit the amount or use 0 and note it.
    *   **Best Guess for Line Amount**: If a line item clearly exists but its specific amount is unreadable or missing, and it's not part of a clear subtotal/total calculation, you may make a reasonable estimate based on context or typical prices for such items, but clearly indicate this is an estimate, perhaps by setting a flag or in a note (though the current schema doesn't have a note field per line item, so prioritize extracting what's visible).

    JSON OUTPUT FORMAT:
    Provide ONLY the JSON object as your response, with no additional text, commentary, or markdown formatting.
    {
      "vendorName": "string|null",
      "receiptDate": "YYYY-MM-DD|null",
      "lastFourDigits": "string|null",
      "lineItems": [
        {
          "description": "string",
          "amount": number,
          "quantity": number|null,
          "unitPrice": number|null,
          "categoryGuess": "string|null"
        }
      ],
      "subTotal": number|null,
      "taxAmount": number|null,
      "tipAmount": number|null,
      "totalAmount": number|null,
      "currency": "string|null",
      "paymentMethod": "string|null"
    }

    Handle cases where information is missing by using null for the respective fields. Ensure all monetary values are numbers, not strings.
    If the image is unclear or not a receipt, indicate this in your response, perhaps by returning mostly null fields and a low confidence score if the schema supported it (for now, just extract what you can).
    `;
  }

  private async validateBase64WithAI(base64String: string): Promise<boolean> {
    // Simple validation without regex to avoid stack overflow
    // Check basic characteristics of base64 without complex patterns
    try {
      // Basic length and character checks
      if (!base64String || base64String.length === 0) return false;
      
      // Check if it contains only valid base64 characters (without regex)
      const validChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      for (let i = 0; i < Math.min(base64String.length, 1000); i++) { // Only check first 1000 chars for efficiency
        if (!validChars.includes(base64String[i])) {
          return false;
        }
      }
      
      // If it passes basic checks, assume it's valid base64
      return true;
    } catch (error) {
      console.error("[ReceiptExtractor] Error validating base64:", error);
      return false;
    }
  }

  private async extractDataURLPrefixWithAI(base64String: string): Promise<{ mediaType: string; data: string } | null> {
    // Simple prefix extraction without complex regex
    try {
      // Check if it starts with data: prefix (first 100 chars should be enough)
      const prefix = base64String.substring(0, 100);
      if (prefix.startsWith('data:image/')) {
        const semicolonIndex = prefix.indexOf(';base64,');
        if (semicolonIndex > 0) {
          const mediaType = prefix.substring(5, semicolonIndex); // Extract between 'data:' and ';base64,'
          const data = base64String.substring(semicolonIndex + 8); // Skip ';base64,'
          return { mediaType, data };
        }
      }
      return null;
    } catch (error) {
      console.error("[ReceiptExtractor] Error extracting prefix:", error);
      return null;
    }
  }

  public async extractReceiptInfo(
    userQuery: string,
    imageUrlOrBase64: string,
    documentContext?: any // documentContext might contain { type: 'image/jpeg', name: 'receipt.jpg' } etc.
  ): Promise<ExtractionResult> {
    console.log(`[ReceiptExtractor] Extracting info from receipt. Query: ${userQuery}`);

    const systemPrompt = this.getSystemPrompt();
    const messages: MessageParam[] = [];

    // Determine if imageUrlOrBase64 is a URL or base64 data
    let imageMediaType: string;
    let imageData: string;

    if (imageUrlOrBase64.startsWith('http://') || imageUrlOrBase64.startsWith('https://')) {
      // For simplicity, assuming direct URL usage is not directly supported by Anthropic SDK's image input like this.
      // In a real scenario, you'd fetch the image data first and convert to base64.
      // This part needs to be adapted based on how images are provided and processed.
      // For now, let's assume if it's a URL, it's a placeholder for future implementation
      // or the caller is expected to convert it to base64.
      console.warn("[ReceiptExtractor] Image URL provided. Direct URL processing in this manner is a placeholder. Ensure image is base64 encoded for Claude API.");
      // This is a simplified approach. You'd need to fetch and base64 encode the image if it's a URL.
      // For now, we'll assume it's meant to be base64 if not explicitly handled.
      // Let's assume for now the caller handles conversion to base64 if it's a URL.
      // THIS IS A MAJOR SIMPLIFICATION AND LIKELY WON'T WORK AS IS FOR URLS.
      imageMediaType = documentContext?.type || 'image/jpeg'; // Guess type
      imageData = imageUrlOrBase64; // This is incorrect if it's a URL, needs to be base64 data
    } else {
      // Assume it's base64 data
      // Use efficient non-regex validation instead of AI-powered validation
      const isValidBase64 = await this.validateBase64WithAI(imageUrlOrBase64);
      if (isValidBase64) {
        imageData = imageUrlOrBase64;
        imageMediaType = documentContext?.type || 'image/jpeg'; // Default or from context
        // If imageMediaType is not provided, try to infer from base64 prefix if present (e.g. data:image/png;base64,)
        const prefixMatch = await this.extractDataURLPrefixWithAI(imageUrlOrBase64);
        if (prefixMatch) {
          imageMediaType = prefixMatch.mediaType;
          imageData = prefixMatch.data;
        }
      } else {
        return {
          success: false,
          message: "Invalid image data format. Expected base64 string or a (currently placeholder) URL."
        };
      }
    }

    // Ensure imageMediaType is one of the allowed types
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
    const validMediaType = allowedTypes.includes(imageMediaType as any) ? imageMediaType as typeof allowedTypes[number] : "image/jpeg";

    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: validMediaType,
            data: imageData,
          },
        },
        {
          type: "text",
          text: userQuery + "\n\nPlease analyze the attached receipt image and extract the information according to the schema provided in the system prompt."
        },
      ],
    });

    try {
      console.log("[ReceiptExtractor] Calling Anthropic API for receipt extraction...");
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620", // Ensure this model supports image input
        max_tokens: 4000,
        system: systemPrompt,
        messages: messages,
      });

      const responseContent = response.content[0];
      if (responseContent.type !== "text") {
        throw new Error("Expected text response from Anthropic for receipt extraction.");
      }

      const responseText = responseContent.text.trim();
      console.log(`[ReceiptExtractor] Raw AI response: ${responseText}`);

      let extractedInfoParsed: ReceiptInfo;
      try {
        const cleanedResponse = responseText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        extractedInfoParsed = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error("[ReceiptExtractor] Failed to parse AI response JSON:", parseError);
        console.error("[ReceiptExtractor] Raw response was:", responseText);
        return {
          success: false,
          message: `Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }
      
      // Basic validation
      if (!extractedInfoParsed.lineItems || !Array.isArray(extractedInfoParsed.lineItems)) {
        console.error("[ReceiptExtractor] Invalid structure: lineItems missing or not an array.");
        return {
            success: false,
            message: "Extracted data is missing 'lineItems' or it's not an array.",
        };
      }

      return {
        success: true,
        message: "Receipt information extracted successfully.",
        receiptInfo: extractedInfoParsed,
      };

    } catch (error) {
      console.error("[ReceiptExtractor] Error calling Anthropic API or processing response:", error);
      return {
        success: false,
        message: `API call failed or error processing response: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

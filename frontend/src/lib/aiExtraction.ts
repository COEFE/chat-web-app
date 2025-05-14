import Anthropic from "@anthropic-ai/sdk";

/**
 * Bill information interface
 */
export interface BillInfo {
  vendor_name?: string;
  bill_number?: string;
  amount?: number;
  due_date?: string;
  description?: string;
}

/**
 * Bill status update request interface
 */
export interface BillStatusUpdateInfo {
  isUpdateRequest: boolean;
  isBulkUpdate: boolean;
  billNumbers?: string[];
  requestedStatus?: string;
  limitToRecent?: number;
  vendorName?: string;
}

/**
 * Use AI to extract structured bill information from a user query
 */
export async function extractBillInfoWithAI(query: string): Promise<BillInfo> {
  console.log(`[AIExtraction] Extracting bill info from: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 150,
      temperature: 0.1,
      system: `You are an expert at extracting structured data from accounting-related text.
      
      Extract the following information from user's request to create a bill:
      - vendor_name: The name of the vendor/supplier (e.g., "Amazon", "Office Depot")
      - bill_number: The invoice/bill number if mentioned
      - amount: The dollar amount of the bill (number only, no currency symbols)
      - due_date: The due date if mentioned (in YYYY-MM-DD format)
      - description: Brief description of what the bill is for
      
      If a field is not present in the text, do not include it in your JSON.
      
      IMPORTANT: Always respond with valid JSON only, with no other text.
      Example:
      {
        "vendor_name": "Amazon",
        "amount": 299.99,
        "description": "office supplies"
      }`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Parse the JSON response
      const extractedInfo = JSON.parse(responseText) as BillInfo;
      console.log(`[AIExtraction] Successfully extracted bill info:`, extractedInfo);
      return extractedInfo;
    } catch (parseError) {
      console.error('[AIExtraction] Error parsing JSON from response:', parseError);
      console.error('[AIExtraction] Raw response:', responseText);
      
      // Fallback to regex extraction for critical fields if parsing fails
      const fallback: BillInfo = {};
      
      // Simple fallback extraction for amount
      const amountMatch = query.match(/\$(\d+(\.\d{1,2})?)/);
      if (amountMatch) {
        fallback.amount = parseFloat(amountMatch[1]);
      }
      
      return fallback;
    }
  } catch (error) {
    console.error('[AIExtraction] Error extracting bill info:', error);
    return {};
  }
}

/**
 * Use AI to analyze if a query is about updating bill status and extract structured information
 */
export async function analyzeBillStatusUpdateWithAI(query: string): Promise<BillStatusUpdateInfo> {
  console.log(`[AIExtraction] Analyzing bill status update request: "${query}"`);
  
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 250,
      temperature: 0.1,
      system: `You are an expert at analyzing accounting-related requests about updating bill statuses and recording bill payments.
      
      Determine if the user's query is about updating the status of one or more bills or recording payments, and extract the following information:
      
      - isUpdateRequest: Boolean indicating if this is a request to update bill status or record a payment
      - isBulkUpdate: Boolean indicating if it's a request to update multiple bills at once
      - billNumbers: Array of specific bill numbers mentioned (empty array if none mentioned)
      - requestedStatus: The target status ('Open', 'Paid', 'Void', etc.)
      - limitToRecent: If requesting recent bills, how many (integer, 0 if not specified)
      - vendorName: If the request mentions bills from a specific vendor (optional)
      
      IMPORTANT: Always respond with valid JSON only, with no additional text.
      
      Examples of requests and expected outputs:
      
      "move the last 10 vendor bills created from draft to open"
      {
        "isUpdateRequest": true,
        "isBulkUpdate": true,
        "billNumbers": [],
        "requestedStatus": "Open",
        "limitToRecent": 10
      }
      
      "please change bill #A12345 to open status"
      {
        "isUpdateRequest": true,
        "isBulkUpdate": false,
        "billNumbers": ["A12345"],
        "requestedStatus": "Open"
      }
      
      "update all Amazon bills to open"
      {
        "isUpdateRequest": true,
        "isBulkUpdate": true,
        "billNumbers": [],
        "requestedStatus": "Open",
        "vendorName": "Amazon"
      }
      
      "record the payment for all the open vendor bills"
      {
        "isUpdateRequest": true,
        "isBulkUpdate": true,
        "billNumbers": [],
        "requestedStatus": "Paid"
      }
      
      "pay all open bills"
      {
        "isUpdateRequest": true,
        "isBulkUpdate": true,
        "billNumbers": [],
        "requestedStatus": "Paid"
      }
      `,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    try {
      // Parse the JSON response
      const analysisResult = JSON.parse(responseText) as BillStatusUpdateInfo;
      console.log(`[AIExtraction] Successfully analyzed bill status update request:`, analysisResult);
      return analysisResult;
    } catch (parseError) {
      console.error('[AIExtraction] Error parsing JSON from bill status analysis response:', parseError);
      console.error('[AIExtraction] Raw response:', responseText);
      
      // Fallback to basic detection
      return fallbackBillStatusUpdateAnalysis(query);
    }
  } catch (error) {
    console.error('[AIExtraction] Error analyzing bill status update request:', error);
    return fallbackBillStatusUpdateAnalysis(query);
  }
}

/**
 * Fallback function to analyze bill status updates using regex patterns
 * This is used when the AI service is unavailable or returns an error
 */
function fallbackBillStatusUpdateAnalysis(query: string): BillStatusUpdateInfo {
  console.log(`[AIExtraction] Using fallback analysis for: "${query}"`);
  const normalized = query.toLowerCase();
  
  // Initialize result
  const result: BillStatusUpdateInfo = {
    isUpdateRequest: false,
    isBulkUpdate: false,
    billNumbers: [],
    requestedStatus: undefined,
    limitToRecent: 0
  };
  
  // Check for status update indicators
  const statusUpdateIndicators = [
    /\b(?:change|update|set|move)\b.*\b(?:status|to)\b/i,
    /\b(?:open|post)\b.*\b(?:bill|invoice)\b/i,
    /\bmark\b.*\b(?:as|to)\b.*\b(?:open|paid|void)\b/i,
    /\bmove\b.*\b(?:from|to)\b.*\b(?:draft|open|paid)\b/i,
    /\b(?:record|make)\b.*\b(?:payment|paid)\b/i,
    /\bpay\b.*\b(?:bill|invoice|vendor)\b/i
  ];
  
  // Check for bulk update indicators
  const bulkUpdateIndicators = [
    /\b(?:all|multiple|several|these)\b.*\b(?:bills|invoices)\b/i,
    /\blast\s+\d+\b/i,
    /\brecent\b/i,
    /\bmove\b.*\b(?:bills|invoices)\b/i
  ];
  
  // Extract bill numbers if present
  const billNumberPatterns = [
    /\bbill\s+#?([\w\d-]+)/i,
    /\binvoice\s+#?([\w\d-]+)/i,
    /#([\w\d-]+)/i
  ];
  
  // Extract status
  const statusPatterns = [
    { pattern: /\b(?:open|post)\b/i, status: 'Open' },
    { pattern: /\bto\s+open\b/i, status: 'Open' },
    { pattern: /\bas\s+open\b/i, status: 'Open' },
    { pattern: /\bpaid\b/i, status: 'Paid' },
    { pattern: /\bpay\b/i, status: 'Paid' },
    { pattern: /\bpayment\b/i, status: 'Paid' },
    { pattern: /\brecord\s+payment\b/i, status: 'Paid' },
    { pattern: /\bmake\s+payment\b/i, status: 'Paid' },
    { pattern: /\bvoid\b/i, status: 'Void' }
  ];
  
  // Extract recent limit
  const recentLimitMatch = normalized.match(/\blast\s+(\d+)\b/i);
  if (recentLimitMatch && recentLimitMatch[1]) {
    result.limitToRecent = parseInt(recentLimitMatch[1], 10);
  }
  
  // Check if it's an update request
  for (const pattern of statusUpdateIndicators) {
    if (pattern.test(normalized)) {
      result.isUpdateRequest = true;
      break;
    }
  }
  
  // If it's an update request, check if it's bulk
  if (result.isUpdateRequest) {
    for (const pattern of bulkUpdateIndicators) {
      if (pattern.test(normalized)) {
        result.isBulkUpdate = true;
        break;
      }
    }
    
    // Extract bill numbers for single updates
    if (!result.isBulkUpdate) {
      for (const pattern of billNumberPatterns) {
        const match = normalized.match(pattern);
        if (match && match[1]) {
          result.billNumbers?.push(match[1]);
        }
      }
    }
    
    // Extract status
    for (const { pattern, status } of statusPatterns) {
      if (pattern.test(normalized)) {
        result.requestedStatus = status;
        break;
      }
    }
  }
  
  console.log(`[AIExtraction] Fallback analysis result:`, result);
  return result;
}

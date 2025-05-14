import Anthropic from "@anthropic-ai/sdk";
import OpenAI from 'openai';
import { Account } from './accounting/accountQueries';

/**
 * Customer data structure for AI extraction
 */
export interface CustomerData {
  name: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
}

/**
 * Invoice data structure for AI extraction
 */
export interface InvoiceData {
  customer_id?: number;
  customer_name?: string; // Used when customer_id is not available
  customer_create_if_not_exists?: boolean; // Whether to create customer if not found
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_city?: string;
  customer_state?: string;
  customer_zip?: string;
  customer_country?: string;
  invoice_date?: string;
  due_date?: string;
  terms?: string;
  memo_to_customer?: string;
  ar_account_id?: number;
  ar_account_name?: string; // Used when ar_account_id is not available
  lines: {
    description: string;
    quantity: number;
    unit_price: number;
    revenue_account_id?: number;
    revenue_account_name?: string; // Used when revenue_account_id is not available
  }[];
}

/**
 * Check if a query is about creating a customer using AI
 * @param query The user's query text
 */
export async function isCustomerCreationWithAI(query: string): Promise<boolean> {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 50,
      temperature: 0,
      system: `You determine if a user query is about creating a new customer record. 
      Return only "yes" if the user is clearly asking to create a new customer, otherwise return "no".
      Look for terms like "add customer", "create customer", "new customer", "register customer", etc.`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text.trim().toLowerCase() : '';
    
    return responseText === 'yes';
  } catch (error) {
    console.error('[arAiExtraction] Error in isCustomerCreationWithAI:', error);
    return false;
  }
}

/**
 * Extract customer information from a query using AI
 * @param query The user's query text
 */
export async function extractCustomerInfoWithAI(query: string): Promise<CustomerData | null> {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 300,
      temperature: 0,
      system: `You extract customer information from a user query. The user wants to create a new customer record.
      Extract the following fields if mentioned:
      - name (required)
      - email
      - phone
      - billing_address
      - shipping_address
      
      Output only a JSON object with these fields. If a field is not mentioned, don't include it.
      The name field is required. Return null if no name is provided.`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    
    // Extract JSON from the response - it might be wrapped in ```json tags
    const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || responseText.match(/({[\s\S]*?})/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        const data = JSON.parse(jsonMatch[1]) as CustomerData;
        
        // Validate required fields
        if (!data.name || data.name.trim() === '') {
          return null;
        }
        
        return data;
      } catch (error) {
        console.error('[arAiExtraction] Error parsing customer JSON:', error);
        return null;
      }
    }
    
    return null;
  } catch (error) {
    console.error('[arAiExtraction] Error in extractCustomerInfoWithAI:', error);
    return null;
  }
}

/**
 * Check if a query is about creating an invoice using AI
 * @param query The user's query text
 */
export async function isInvoiceCreationWithAI(query: string): Promise<boolean> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You determine if a query is about creating a new invoice. Respond with only 'Yes' or 'No'."
        },
        { role: "user", content: query }
      ],
      temperature: 0,
    });
    
    const answer = response.choices[0].message.content?.toLowerCase() || '';
    return answer.includes('yes') || answer.includes('true');
  } catch (error) {
    console.error('[arAiExtraction] Error in isInvoiceCreationWithAI:', error);
    return false;
  }
}

/**
 * Payment data structure for AI extraction
 */
export interface PaymentData {
  invoice_id?: number;
  invoice_number?: string;
  payment_date?: string;
  amount?: number;
  payment_method?: string;
  notes?: string;
  reference_number?: string;
  customer_id?: number;     // Added to support customer identification from query
  customer_name?: string;   // Added to support customer identification from query
}

/**
 * Determines if a query is about recording a payment for an existing invoice
 * @param query The user's query text
 * @returns True if the query is about recording an invoice payment
 */
export async function isInvoicePaymentWithAI(query: string): Promise<boolean> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You determine if a query is about recording a payment for an existing invoice. Look for phrases like 'paid', 'payment received', 'settled invoice', etc. Respond with only 'Yes' or 'No'."
        },
        { role: "user", content: query }
      ],
      temperature: 0.1,
    });
    
    const answer = response.choices[0].message.content?.toLowerCase() || '';
    return answer.includes('yes') || answer.includes('true');
  } catch (error) {
    console.error('[arAiExtraction] Error in isInvoicePaymentWithAI:', error);
    return false;
  }
}

/**
 * Extract payment information from a query using AI
 * @param query The user's query text
 * @returns Payment data object or null if extraction fails
 */
export async function extractPaymentInfoWithAI(query: string): Promise<PaymentData | null> {
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0,
      messages: [
        { 
          role: "system", 
          content: "You extract invoice payment information from a user query. Return a valid JSON object with no explanatory text.\n\nExtract the following fields if mentioned:\n- invoice_number (if specifically mentioned)\n- payment_date (convert relative dates like 'today', 'yesterday' to actual dates in YYYY-MM-DD format)\n- amount (the payment amount, if mentioned)\n- payment_method (e.g., 'check', 'cash', 'credit card', 'bank transfer', etc.)\n- reference_number (any check number or payment reference)\n- notes (any additional notes about the payment)\n\nIMPORTANT: Respond with ONLY the valid JSON object and nothing else. No markdown, no explanation, no code blocks."
        },
        { role: "user", content: query }
      ]
    });
    
    const responseText = response.choices[0].message.content?.trim() || '';
    console.log('[arAiExtraction] Original payment extraction response:', responseText);
    
    try {
      // Parse the JSON response
      const paymentData = JSON.parse(responseText) as PaymentData;
      
      // Convert 'today' to actual date if needed
      if (paymentData.payment_date === 'today') {
        const today = new Date();
        paymentData.payment_date = today.toISOString().split('T')[0];
      } else if (paymentData.payment_date === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        paymentData.payment_date = yesterday.toISOString().split('T')[0];
      }
      
      return paymentData;
    } catch (parseError) {
      console.error('[arAiExtraction] Error parsing payment JSON:', parseError);
      return null;
    }
  } catch (error) {
    console.error('[arAiExtraction] Error extracting payment info:', error);
    return null;
  }
}

/**
 * Extract invoice information from a query using AI
 * @param query The user's query text
 */
export async function extractInvoiceInfoWithAI(query: string): Promise<InvoiceData | null> {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
    });
    
    // Direct approach - ask Claude to generate valid JSON
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 800,
      temperature: 0,
      system: `You extract invoice information from a user query. Return a valid JSON object with no explanatory text.
      
      Extract the following fields if mentioned:
      - customer_name (required - the customer/client name the invoice is for)
      
      Include an array of line items (required) with:
      - description (required for each line)
      - unit_price (required for each line)
      - quantity (default to 1 if not specified)
      
      Optional fields:
      - invoice_date (default to today if not specified)
      - due_date (default to 30 days from invoice date if not specified)
      - terms (like "30 days", "Net 15", etc.)
      - memo_to_customer (any notes the user wants to include)
      - revenue_account_name (for each line item, if specified)
      
      Format dates in YYYY-MM-DD format if possible.
      
      IMPORTANT: Respond with ONLY the valid JSON object and nothing else. No markdown, no explanation, no code blocks.`,
      messages: [{ role: "user", content: query }]
    });
    
    const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
    console.log('[arAiExtraction] Original response from AI:', responseText);
    
    // First attempt: Try to directly parse the full response as JSON
    try {
      // Parse the JSON response
      const rawData = JSON.parse(responseText.trim()) as any;
      console.log('[arAiExtraction] Direct JSON parse succeeded');
      
      // Normalize field names to match our InvoiceData interface
      const normalizedData: InvoiceData = {
        ...rawData,
        // Handle the line_items vs lines field name mismatch
        lines: rawData.lines || rawData.line_items || []
      };
      
      // Validate the required fields
      if (!normalizedData.customer_name || !normalizedData.lines || normalizedData.lines.length === 0) {
        throw new Error('Missing required fields in the response');
      }
      
      return normalizedData;
    } catch (directParseError) {
      console.log('[arAiExtraction] Direct JSON parse failed, trying to extract JSON from response');
      
      // Second attempt: Try to extract JSON from the response
      try {
        // Look for JSON with or without code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                          responseText.match(/({[\s\S]*?})/); 
        
        if (jsonMatch && jsonMatch[1]) {
          const extractedJson = jsonMatch[1].trim();
          console.log('[arAiExtraction] Found JSON in response:', extractedJson);
          
          // Parse and normalize field names
          const rawData = JSON.parse(extractedJson) as any;
          const normalizedData: InvoiceData = {
            ...rawData,
            // Handle the line_items vs lines field name mismatch
            lines: rawData.lines || rawData.line_items || []
          };
          
          return normalizedData;
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (extractionError) {
        console.error('[arAiExtraction] Failed to extract JSON from response:', extractionError);
        
        // Third attempt: Ask Claude to fix the JSON
        try {
          console.log('[arAiExtraction] Attempting to ask Claude to repair the JSON');
          
          const repairResponse = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 800,
            temperature: 0,
            system: `Fix the following invalid JSON from a previous response. Return ONLY the corrected valid JSON with no explanation.
            
            You must extract:
            - customer_name (required)
            - lines array with at least one item with description and unit_price
            
            If you can't fix the JSON, extract the invoice information directly from the original query and format it as valid JSON.`,
            messages: [{ 
              role: "user", 
              content: `Original query: ${query}\n\nFailed JSON response: ${responseText}\n\nPlease fix this JSON and return ONLY a valid JSON object.` 
            }]
          });
          
          const repairedText = typeof repairResponse.content[0] === 'object' && 'text' in repairResponse.content[0] 
            ? repairResponse.content[0].text.trim() 
            : '';
          
          console.log('[arAiExtraction] Repair attempt response:', repairedText);
          
          try {
            // Parse and normalize field names
            const rawData = JSON.parse(repairedText) as any;
            console.log('[arAiExtraction] Repair succeeded');
            
            const normalizedData: InvoiceData = {
              ...rawData,
              // Handle the line_items vs lines field name mismatch
              lines: rawData.lines || rawData.line_items || []
            };
            
            return normalizedData;
          } catch (repairParseError) {
            // Try one more time to extract JSON from the repaired response
            const repairJsonMatch = repairedText.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                                     repairedText.match(/({[\s\S]*?})/);
            
            if (repairJsonMatch && repairJsonMatch[1]) {
              const extractedRepairJson = repairJsonMatch[1].trim();
              console.log('[arAiExtraction] Found JSON in repair response:', extractedRepairJson);
              
              // Parse and normalize field names
              const rawData = JSON.parse(extractedRepairJson) as any;
              const normalizedData: InvoiceData = {
                ...rawData,
                // Handle the line_items vs lines field name mismatch
                lines: rawData.lines || rawData.line_items || []
              };
              
              return normalizedData;
            }
            
            throw new Error('Failed to parse repaired JSON');
          }
        } catch (repairAttemptError) {
          console.error('[arAiExtraction] JSON repair failed:', repairAttemptError);
          
          // Last resort: RegEx extraction from the original query
          const customerMatch = query.match(/invoice\s+([^\s]+(?:\s+[^\s]+)*)\s+for\s+\$?([\d,]+(?:\.\d+)?)/i);
          if (customerMatch) {
            const customerName = customerMatch[1].trim();
            const amount = parseFloat(customerMatch[2].replace(/,/g, ''));
            
            console.log('[arAiExtraction] Extracted minimal data from query:', customerName, amount);
            return {
              customer_name: customerName,
              lines: [{
                description: "Services",
                quantity: 1,
                unit_price: amount
              }]
            };
          }
          
          console.error('[arAiExtraction] All JSON extraction methods failed');
          return null;
        }
      }
    }
  } catch (error) {
    console.error('[arAiExtraction] Error in extractInvoiceInfoWithAI:', error);
    return null;
  }
}

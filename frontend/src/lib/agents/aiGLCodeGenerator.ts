import { sql } from '@vercel/postgres';
import Anthropic from '@anthropic-ai/sdk';

export interface GLCodeGenerationRequest {
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  description?: string;
  expenseType?: string;
  userId?: string;
}

export interface GLCodeGenerationResult {
  success: boolean;
  code: string;
  suggestedName?: string;
  reasoning?: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'ai_analysis' | 'sequential_fallback' | 'range_fallback';
}

/**
 * AI-Powered GL Code Generator
 * 
 * This module provides intelligent GL account code generation that:
 * 1. Reviews the existing chart of accounts using AI analysis
 * 2. Ensures codes are unique and contextually appropriate
 * 3. Follows accounting best practices for code organization
 * 4. Falls back to sequential assignment if AI fails
 */
export class AIGLCodeGenerator {
  private anthropic: Anthropic | null = null;

  constructor() {
    // Initialize Anthropic client if API key is available
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.anthropic = new Anthropic({
        apiKey: apiKey,
      });
    }
  }

  /**
   * Generate an intelligent GL account code based on existing chart of accounts
   */
  async generateGLCode(request: GLCodeGenerationRequest): Promise<GLCodeGenerationResult> {
    try {
      console.log(`[AIGLCodeGenerator] Generating code for ${request.accountType} account: ${request.accountName}`);

      // First, get the existing chart of accounts for this account type
      const existingAccounts = await this.getExistingAccountsByType(request.accountType, request.userId);
      
      // Try AI-powered analysis first if available
      if (this.anthropic && existingAccounts.length > 0) {
        try {
          const aiResult = await this.generateCodeWithAI(request, existingAccounts);
          if (aiResult.success) {
            return aiResult;
          }
        } catch (aiError) {
          console.warn(`[AIGLCodeGenerator] AI analysis failed, falling back to sequential: ${aiError}`);
        }
      }

      // Fallback to sequential code assignment
      return await this.generateSequentialCode(request, existingAccounts);

    } catch (error) {
      console.error(`[AIGLCodeGenerator] Error generating GL code:`, error);
      
      // Final fallback to range-based assignment
      return this.generateRangeBasedCode(request);
    }
  }

  /**
   * Get existing accounts by type for analysis
   */
  private async getExistingAccountsByType(accountType: string, userId?: string): Promise<Array<{code: string, name: string, description?: string}>> {
    try {
      const query = `
        SELECT code, name, notes as description
        FROM accounts 
        WHERE LOWER(account_type) = $1 
        AND code ~ '^[0-9]+$'
        ${userId ? 'AND user_id = $2' : ''}
        ORDER BY CAST(code AS INTEGER) ASC
        LIMIT 100
      `;
      
      const values = userId ? [accountType.toLowerCase(), userId] : [accountType.toLowerCase()];
      const result = await sql.query(query, values);
      
      return result.rows.map(row => ({
        code: row.code,
        name: row.name,
        description: row.description
      }));
    } catch (error) {
      console.error(`[AIGLCodeGenerator] Error fetching existing accounts:`, error);
      return [];
    }
  }

  /**
   * Generate code using AI analysis of existing chart of accounts
   */
  private async generateCodeWithAI(
    request: GLCodeGenerationRequest, 
    existingAccounts: Array<{code: string, name: string, description?: string}>
  ): Promise<GLCodeGenerationResult> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    // Prepare the chart of accounts context
    const chartContext = existingAccounts.map(acc => 
      `${acc.code}: ${acc.name}${acc.description ? ` - ${acc.description}` : ''}`
    ).join('\n');

    const prompt = `You are an expert accounting system analyzing a chart of accounts to determine the most appropriate GL account code for a new account.

ACCOUNT TYPE RANGES:
- Assets: 10000-19999
- Liabilities: 20000-29999  
- Equity: 30000-39999
- Revenue: 40000-49999
- Expenses: 50000-59999

NEW ACCOUNT TO CREATE:
- Name: ${request.accountName}
- Type: ${request.accountType}
- Description: ${request.description || 'Not provided'}
- Expense Type: ${request.expenseType || 'Not applicable'}

EXISTING ${request.accountType.toUpperCase()} ACCOUNTS:
${chartContext || 'No existing accounts of this type'}

TASK: Analyze the existing chart of accounts and determine the most logical GL code for the new account. Consider:

1. **Logical Grouping**: Place similar accounts near each other (e.g., all office expenses together)
2. **Sequential Organization**: Use the next logical number in a sequence when appropriate
3. **Gap Filling**: Fill gaps in the numbering sequence when it makes sense
4. **Subcategory Logic**: Group related subcategories (e.g., 50100-50199 for office expenses)

RESPONSE FORMAT (JSON only):
{
  "code": "XXXXX",
  "suggestedName": "Optimized account name if needed",
  "reasoning": "Brief explanation of why this code was chosen",
  "confidence": "high|medium|low"
}

Provide only the JSON response, no other text.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const aiResponse = JSON.parse(content.text.trim());
        
        // Validate the AI response
        if (await this.validateAIGeneratedCode(aiResponse.code, request.accountType, request.userId)) {
          return {
            success: true,
            code: aiResponse.code,
            suggestedName: aiResponse.suggestedName,
            reasoning: aiResponse.reasoning,
            confidence: aiResponse.confidence as 'high' | 'medium' | 'low',
            method: 'ai_analysis'
          };
        } else {
          console.warn(`[AIGLCodeGenerator] AI suggested invalid code: ${aiResponse.code}`);
          throw new Error('AI suggested code is invalid or already exists');
        }
      }
      
      throw new Error('Invalid AI response format');
    } catch (error) {
      console.error(`[AIGLCodeGenerator] AI code generation failed:`, error);
      throw error;
    }
  }

  /**
   * Validate that an AI-generated code is valid and available
   */
  private async validateAIGeneratedCode(code: string, accountType: string, userId?: string): Promise<boolean> {
    try {
      // Check if code is numeric and in valid range
      const numericCode = parseInt(code);
      if (isNaN(numericCode)) return false;

      // Check range validity
      const ranges = {
        'asset': { start: 10000, end: 19999 },
        'liability': { start: 20000, end: 29999 },
        'equity': { start: 30000, end: 39999 },
        'revenue': { start: 40000, end: 49999 },
        'expense': { start: 50000, end: 59999 }
      };

      const range = ranges[accountType.toLowerCase() as keyof typeof ranges];
      if (!range || numericCode < range.start || numericCode > range.end) {
        return false;
      }

      // Check if code already exists
      const query = `
        SELECT COUNT(*) as count FROM accounts 
        WHERE code = $1 
        ${userId ? 'AND user_id = $2' : ''}
      `;
      
      const values = userId ? [code, userId] : [code];
      const result = await sql.query(query, values);
      
      return result.rows[0].count === 0;
    } catch (error) {
      console.error(`[AIGLCodeGenerator] Error validating AI code:`, error);
      return false;
    }
  }

  /**
   * Generate code using sequential assignment (fallback method)
   */
  private async generateSequentialCode(
    request: GLCodeGenerationRequest,
    existingAccounts: Array<{code: string, name: string, description?: string}>
  ): Promise<GLCodeGenerationResult> {
    const ranges = {
      'asset': { start: 10000, end: 19999 },
      'liability': { start: 20000, end: 29999 },
      'equity': { start: 30000, end: 39999 },
      'revenue': { start: 40000, end: 49999 },
      'expense': { start: 50000, end: 59999 }
    };

    const range = ranges[request.accountType.toLowerCase() as keyof typeof ranges];
    if (!range) {
      throw new Error(`Invalid account type: ${request.accountType}`);
    }

    // Convert existing codes to numbers and sort
    const existingCodes = existingAccounts
      .map(acc => parseInt(acc.code))
      .filter(code => !isNaN(code) && code >= range.start && code <= range.end)
      .sort((a, b) => a - b);

    // Find first available code
    let availableCode = range.start;
    for (const existingCode of existingCodes) {
      if (availableCode === existingCode) {
        availableCode++;
      } else if (availableCode < existingCode) {
        break;
      }
    }

    // Check if we're within range
    if (availableCode > range.end) {
      throw new Error(`No available codes in range ${range.start}-${range.end}`);
    }

    return {
      success: true,
      code: availableCode.toString(),
      reasoning: `Sequential assignment: next available code in ${request.accountType} range`,
      confidence: 'medium',
      method: 'sequential_fallback'
    };
  }

  /**
   * Generate code using basic range assignment (final fallback)
   */
  private generateRangeBasedCode(request: GLCodeGenerationRequest): GLCodeGenerationResult {
    const ranges = {
      'asset': { start: 10000, end: 19999 },
      'liability': { start: 20000, end: 29999 },
      'equity': { start: 30000, end: 39999 },
      'revenue': { start: 40000, end: 49999 },
      'expense': { start: 50000, end: 59999 }
    };

    const range = ranges[request.accountType.toLowerCase() as keyof typeof ranges];
    const code = range ? range.start.toString() : '50000';

    return {
      success: true,
      code,
      reasoning: `Fallback assignment: using start of ${request.accountType} range`,
      confidence: 'low',
      method: 'range_fallback'
    };
  }
}

/**
 * Convenience function to generate a GL code
 */
export async function generateIntelligentGLCode(request: GLCodeGenerationRequest): Promise<GLCodeGenerationResult> {
  const generator = new AIGLCodeGenerator();
  return await generator.generateGLCode(request);
}

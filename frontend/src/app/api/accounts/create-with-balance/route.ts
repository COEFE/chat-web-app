import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { createGLAccount } from '@/lib/glUtils';

/**
 * API endpoint to create a GL account with a starting balance
 * This endpoint demonstrates the ability to create accounts with initial balances
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(req);
    
    // If authentication failed, return the error
    if (error) {
      return error;
    }
    
    // If no userId, return unauthorized
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    // Parse the request body
    const body = await req.json();
    const { code: rawCode, name, accountType, startingBalance, notes, balanceDate, parentId } = body;
    
    // Validate required fields
    if (!rawCode || !name || !accountType) {
      return NextResponse.json(
        { error: 'Account code, name, and type are required' },
        { status: 400 }
      );
    }
    
    // Use the provided code as is - we'll rely on the account type for determining balance behavior
    let formattedCode = rawCode;
    
    // Check if the account code already exists
    try {
      const { rows: existingAccounts } = await sql`
        SELECT code, name FROM accounts WHERE code = ${formattedCode}
      `;
      
      // If the account exists, modify the code to make it unique
      if (existingAccounts.length > 0) {
        // Find a unique code by appending a number
        let suffix = 1;
        let uniqueCode = formattedCode;
        let isUnique = false;
        
        while (!isUnique && suffix < 100) {
          uniqueCode = `${formattedCode}-${suffix}`;
          const { rows: checkAccounts } = await sql`
            SELECT code FROM accounts WHERE code = ${uniqueCode}
          `;
          
          if (checkAccounts.length === 0) {
            isUnique = true;
            formattedCode = uniqueCode;
          } else {
            suffix++;
          }
        }
        
        // If we couldn't find a unique code after 100 attempts, let the user know
        if (!isUnique) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Account code ${rawCode} already exists and we couldn't generate a unique alternative. Please try a different code.` 
            },
            { status: 400 }
          );
        }
      }
    } catch (error) {
      console.error('[create-with-balance] Error checking for existing account:', error);
      // Continue with the original code if there's an error checking
    }
    
    // Convert starting balance to number
    const initialBalance = startingBalance ? parseFloat(startingBalance) : 0;
    
    console.log(`[create-with-balance] Creating account: ${formattedCode} - ${name} with balance: ${initialBalance}, type: ${accountType}`);
    console.log(`[create-with-balance] Original code: ${rawCode}, formatted code: ${formattedCode}`);
    
    try {
      // Create the account with starting balance
      const result = await createGLAccount(
        formattedCode,
        name,
        notes || `${accountType.charAt(0).toUpperCase() + accountType.slice(1)} account created via admin interface`,
        userId,
        initialBalance,
        balanceDate || new Date().toISOString().split('T')[0], // Use provided date or today
        accountType as 'asset' | 'liability' | 'equity' | 'revenue' | 'expense', // Pass the account type directly
        parentId || null // Pass the parent ID if provided
      );
      
      console.log(`[create-with-balance] Result:`, result);
      return NextResponse.json({
        success: result.success,
        message: result.message,
        account: result.account,
        journalId: result.journalId
      });
    } catch (err) {
      console.error('[create-with-balance] Error creating GL account:', err);
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Error creating GL account' },
        { status: 400 }
      );
    }
    
    // Code moved to try/catch block above
  } catch (error) {
    console.error('Error creating GL account with balance:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

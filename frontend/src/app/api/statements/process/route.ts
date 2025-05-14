import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isStatementProcessed, recordProcessedStatement, hasStartingBalanceStatement, findStatementByAccountIdentifiers } from '@/lib/accounting/statementTracker';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * API endpoint to process a bank or credit card statement
 * This endpoint handles:
 * 1. Checking if a statement has already been processed
 * 2. Identifying accounts by statement number or last four digits
 * 3. Setting starting balances for accounts if needed
 * 4. Recording processed statements
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      return error;
    }
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse the request body
    const body = await request.json();
    const { 
      accountId, 
      accountCode, 
      accountName,
      statementNumber, 
      statementDate, 
      balance,
      isStartingBalance = false
    } = body;

    // Validate required fields
    if (!statementNumber) {
      return NextResponse.json(
        { error: 'Statement number is required' },
        { status: 400 }
      );
    }

    // Extract last four digits for fallback identification
    const lastFour = statementNumber.length >= 4 
      ? statementNumber.slice(-4) 
      : statementNumber;

    // First check if we can identify this account from previous statements
    let existingAccountId = accountId;
    
    if (!existingAccountId) {
      const existingAccount = await findStatementByAccountIdentifiers(
        statementNumber,
        lastFour,
        userId
      );

      if (existingAccount) {
        existingAccountId = existingAccount.accountId;
        
        // Check if this statement has already been processed
        const isProcessed = await isStatementProcessed(
          existingAccountId,
          statementNumber,
          lastFour,
          userId
        );
        
        if (isProcessed) {
          return NextResponse.json({
            success: true,
            message: `Statement ${statementNumber} has already been processed for this account.`,
            isAlreadyProcessed: true,
            accountId: existingAccountId
          });
        }
      }
    }

    // If we still don't have an account ID, try to find it by code or name
    if (!existingAccountId && (accountCode || accountName)) {
      let accountQuery = null;
      
      if (accountCode) {
        accountQuery = await sql`
          SELECT id FROM accounts 
          WHERE code = ${accountCode} AND user_id = ${userId}
        `;
      } else if (accountName) {
        accountQuery = await sql`
          SELECT id FROM accounts 
          WHERE LOWER(name) LIKE ${`%${accountName.toLowerCase()}%`} AND user_id = ${userId}
        `;
      }
      
      if (accountQuery && accountQuery.rows.length > 0) {
        existingAccountId = accountQuery.rows[0].id;
      }
    }

    // If we still don't have an account ID, return an error
    if (!existingAccountId) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Account not found',
          needsAccountCreation: true
        },
        { status: 404 }
      );
    }

    // Check if this account already has a starting balance set
    const hasStartingBalance = await hasStartingBalanceStatement(
      existingAccountId,
      userId
    );

    // If this is a starting balance but the account already has one, return an error
    if (isStartingBalance && hasStartingBalance) {
      return NextResponse.json({
        success: false,
        error: 'This account already has a starting balance set',
        hasStartingBalance: true,
        accountId: existingAccountId
      });
    }

    // Record that we've processed this statement
    const result = await recordProcessedStatement(
      existingAccountId,
      statementNumber,
      statementDate || new Date().toISOString().split('T')[0],
      lastFour,
      isStartingBalance,
      userId
    );

    // If this is a starting balance, update the account's starting balance
    if (isStartingBalance && balance !== undefined) {
      await sql`
        UPDATE accounts 
        SET starting_balance = ${balance}, 
            balance_date = ${statementDate || new Date().toISOString().split('T')[0]},
            updated_at = NOW()
        WHERE id = ${existingAccountId} AND user_id = ${userId}
      `;
    }

    return NextResponse.json({
      success: true,
      message: isStartingBalance 
        ? `Starting balance of ${balance} has been set for the account as of ${statementDate}`
        : `Statement ${statementNumber} has been processed`,
      accountId: existingAccountId,
      isStartingBalance,
      statementId: result?.id
    });
  } catch (error) {
    console.error('Error processing statement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

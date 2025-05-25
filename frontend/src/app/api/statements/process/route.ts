import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { isStatementProcessed, recordProcessedStatement, hasStartingBalanceStatement, findStatementByAccountIdentifiers } from '@/lib/accounting/statementTracker';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { CreditCardAgent } from '@/lib/agents/creditCardAgent';
import { AgentContext } from '@/types/agents';
import { CreditCardTransaction } from '@/types/creditCard';
import { createBill } from '@/lib/accounting/billQueries';
import { storeStatementEmbedding } from '@/lib/statementEmbeddings';

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
      isStartingBalance = false,
      transactions = [] // Add support for transactions
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

    // Store the statement embedding
    await storeStatementEmbedding({
      user_id: userId,
      account_id: existingAccountId,
      account_number: lastFour,
      statement_date: statementDate || new Date().toISOString().split('T')[0],
      statement_number: statementNumber,
      statement_content: `Credit card statement ${statementNumber} dated ${statementDate || new Date().toISOString().split('T')[0]} for account ending in ${lastFour}${balance !== undefined ? ` with balance ${balance}` : ''}${accountName ? ` for ${accountName}` : ''}${accountCode ? ` (${accountCode})` : ''}`
    });

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

    // Process transactions if they were provided
    let transactionResult = null;
    if (transactions && transactions.length > 0 && existingAccountId) {
      console.log(`[API] Processing ${transactions.length} transactions for account ID ${existingAccountId}`);
      
      try {
        // Create an agent context with the user ID
        const context: AgentContext = {
          userId: userId,
          query: `Process transactions for statement ${statementNumber}`,
          conversationId: 'api-statement-process'
        };
        
        // Create a CreditCardAgent instance to process the transactions
        const creditCardAgent = new CreditCardAgent();
        
        // Get the account name if not provided
        let actualAccountName = accountName;
        if (!actualAccountName) {
          const accountQuery = await sql`
            SELECT name FROM accounts WHERE id = ${existingAccountId} AND user_id = ${userId}
          `;
          if (accountQuery.rows.length > 0) {
            actualAccountName = accountQuery.rows[0].name;
          } else {
            actualAccountName = `Account ${existingAccountId}`;
          }
        }
        
        // DIRECT APPROACH: Process transactions directly in the API endpoint
        // This bypasses the need for AI extraction and ensures transactions are recorded
        console.log(`[API] DIRECT APPROACH: Processing ${transactions.length} transactions directly`);
        
        // Process each transaction using billQueries.createBill
        let processedCount = 0;
        const errors: string[] = [];
        
        for (const transaction of transactions) {
          try {
            // Skip if it's a payment or refund (negative amount)
            if (transaction.amount < 0) {
              console.log(`[API] Skipping payment/refund transaction: ${transaction.description} ($${transaction.amount})`);
              continue;
            }
            
            // Find or create a vendor based on the transaction description
            const vendorQuery = await sql`
              SELECT id FROM vendors 
              WHERE LOWER(name) LIKE ${`%${transaction.description.toLowerCase().substring(0, 10)}%`}
              AND user_id = ${userId}
              LIMIT 1
            `;
            
            let vendorId;
            if (vendorQuery.rows.length > 0) {
              vendorId = vendorQuery.rows[0].id;
              console.log(`[API] Found existing vendor with ID: ${vendorId}`);
            } else {
              // Create a new vendor
              const newVendorQuery = await sql`
                INSERT INTO vendors (name, user_id)
                VALUES (${transaction.description.substring(0, 50)}, ${userId})
                RETURNING id
              `;
              vendorId = newVendorQuery.rows[0].id;
              console.log(`[API] Created new vendor with ID: ${vendorId}`);
            }
            
            // Find a default expense account
            const expenseAccountQuery = await sql`
              SELECT id FROM accounts 
              WHERE account_type = 'expense'
              AND user_id = ${userId}
              LIMIT 1
            `;
            
            let expenseAccountId;
            if (expenseAccountQuery.rows.length > 0) {
              expenseAccountId = expenseAccountQuery.rows[0].id;
              console.log(`[API] Found expense account with ID: ${expenseAccountId}`);
            } else {
              // Create a default expense account if none exists
              // Generate a unique account code
              const timestamp = new Date().getTime();
              const accountCode = `EXP-${timestamp.toString().slice(-6)}`;
              
              const newExpenseAccountQuery = await sql`
                INSERT INTO accounts (name, account_type, user_id, code, is_active)
                VALUES ('General Expense', 'expense', ${userId}, ${accountCode}, true)
                RETURNING id
              `;
              expenseAccountId = newExpenseAccountQuery.rows[0].id;
              console.log(`[API] Created new expense account with ID: ${expenseAccountId}`);
            }
            
            // Generate a unique bill number
            const timestamp = new Date().getTime();
            const uniqueBillNumber = `CC-${transaction.date.replace(/-/g, '')}-${timestamp.toString().slice(-6)}`;
            
            // Create the bill
            const bill = {
              vendor_id: vendorId,
              bill_number: transaction.id || uniqueBillNumber,
              bill_date: transaction.date,
              due_date: transaction.date,
              total_amount: Math.abs(transaction.amount),
              status: 'Paid', // Credit card transactions are already paid
              memo: `Credit card transaction: ${transaction.description}`,
              ap_account_id: existingAccountId,
              terms: 'Net 0',
              amount_paid: Math.abs(transaction.amount), // Set amount_paid equal to total_amount
            };
            
            // Create the bill line
            const billLine = {
              expense_account_id: expenseAccountId.toString(),
              description: transaction.description,
              quantity: '1',
              unit_price: Math.abs(transaction.amount).toString(),
              amount: Math.abs(transaction.amount).toString(),
              category: transaction.category || 'Uncategorized'
            };
            
            console.log(`[API] Creating bill with data:`, JSON.stringify(bill, null, 2));
            console.log(`[API] Bill line:`, JSON.stringify(billLine, null, 2));
            
            // Create the bill using billQueries.createBill
            const newBill = await createBill(bill, [billLine], userId);
            
            if (newBill && newBill.id) {
              processedCount++;
              console.log(`[API] Successfully created bill with ID: ${newBill.id}`);
            } else {
              throw new Error('Failed to create bill');
            }
          } catch (err) {
            console.error(`[API] Error processing transaction ${transaction.description}:`, err);
            errors.push(`Error processing transaction ${transaction.description}: ${err instanceof Error ? err.message : 'Unknown error'}`);
          }
        }
        
        // Create the transaction result
        if (processedCount === transactions.length) {
          transactionResult = {
            success: true,
            message: `Successfully processed all ${processedCount} transactions`,
            processedCount
          };
        } else {
          transactionResult = {
            success: true,
            message: `Processed ${processedCount} out of ${transactions.length} transactions. Errors: ${errors.join('; ')}`,
            processedCount
          };
        }
        
        console.log(`[API] Transaction processing result: ${JSON.stringify(transactionResult)}`);
      } catch (error) {
        console.error('[API] Error processing transactions:', error);
        transactionResult = {
          success: false,
          message: `Error processing transactions: ${error instanceof Error ? error.message : 'Unknown error'}`,
          processedCount: 0
        };
      }
    }
    
    return NextResponse.json({
      success: true,
      message: isStartingBalance 
        ? `Starting balance of ${balance} has been set for the account as of ${statementDate}`
        : `Statement ${statementNumber} has been processed${transactionResult ? `. ${transactionResult.message}` : ''}`,
      accountId: existingAccountId,
      isStartingBalance,
      statementId: result?.id,
      transactionResult: transactionResult
    });
  } catch (error) {
    console.error('Error processing statement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

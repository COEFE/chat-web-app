import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest): Promise<NextResponse> {
    console.log('[CHECK-ACCOUNTS] API endpoint called');
    
    try {
        // Authenticate the user
        const user = await auth(req);
        if (!user || !user.uid) {
            return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
        }
        const userId = user.uid;
        console.log(`[CHECK-ACCOUNTS] Authenticated user ID: ${userId}`);

        // Get the account names from the request body
        const { creditCardAccountName, expenseAccountName } = await req.json();
        console.log(`[CHECK-ACCOUNTS] Checking for accounts: CC=${creditCardAccountName}, Expense=${expenseAccountName}`);

        // Check for the credit card account
        let creditCardAccountExists = false;
        let creditCardAccountId = null;
        if (creditCardAccountName) {
            // First try exact match
            let ccResult = await query(
                'SELECT id, name, account_type FROM accounts WHERE name = $1 AND user_id = $2 LIMIT 1',
                [creditCardAccountName, userId]
            );
            
            // If no exact match, try LIKE match
            if (ccResult.rows.length === 0) {
                console.log(`[CHECK-ACCOUNTS] No exact match for credit card account '${creditCardAccountName}', trying LIKE match`);
                ccResult = await query(
                    'SELECT id, name, account_type FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1',
                    [`%${creditCardAccountName.toLowerCase()}%`, userId, 'credit_card']
                );
                
                // If still no match, try matching by last four digits if present
                if (ccResult.rows.length === 0) {
                    // Extract last four digits if they exist in the account name
                    const lastFourMatch = creditCardAccountName.match(/(\d{4})\s*$/);
                    if (lastFourMatch && lastFourMatch[1]) {
                        const lastFour = lastFourMatch[1];
                        console.log(`[CHECK-ACCOUNTS] Trying to match credit card by last four digits: ${lastFour}`);
                        ccResult = await query(
                            'SELECT id, name, account_type FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1',
                            [`%${lastFour}%`, userId, 'credit_card']
                        );
                    }
                }
            }
            
            creditCardAccountExists = ccResult.rows.length > 0;
            if (creditCardAccountExists) {
                creditCardAccountId = ccResult.rows[0].id;
                console.log(`[CHECK-ACCOUNTS] Found credit card account: ${JSON.stringify(ccResult.rows[0])}`);
            } else {
                console.log(`[CHECK-ACCOUNTS] Credit card account '${creditCardAccountName}' not found after multiple search attempts`);
            }
        }

        // Check for the expense account
        let expenseAccountExists = false;
        let expenseAccountId = null;
        if (expenseAccountName) {
            // First try exact match
            let expenseResult = await query(
                'SELECT id, name, account_type FROM accounts WHERE name = $1 AND user_id = $2 LIMIT 1',
                [expenseAccountName, userId]
            );
            
            // If no exact match, try LIKE match
            if (expenseResult.rows.length === 0) {
                console.log(`[CHECK-ACCOUNTS] No exact match for expense account '${expenseAccountName}', trying LIKE match`);
                expenseResult = await query(
                    'SELECT id, name, account_type FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1',
                    [`%${expenseAccountName.toLowerCase()}%`, userId, 'expense']
                );
                
                // If still no match, try finding any expense account
                if (expenseResult.rows.length === 0) {
                    console.log(`[CHECK-ACCOUNTS] No matching expense account found, looking for any expense account`);
                    expenseResult = await query(
                        'SELECT id, name, account_type FROM accounts WHERE account_type = $1 AND user_id = $2 LIMIT 1',
                        ['expense', userId]
                    );
                }
            }
            
            expenseAccountExists = expenseResult.rows.length > 0;
            if (expenseAccountExists) {
                expenseAccountId = expenseResult.rows[0].id;
                console.log(`[CHECK-ACCOUNTS] Found expense account: ${JSON.stringify(expenseResult.rows[0])}`);
            } else {
                console.log(`[CHECK-ACCOUNTS] Expense account '${expenseAccountName}' not found after multiple search attempts`);
            }
        }

        // Return the results
        return NextResponse.json({
            success: true,
            creditCardAccount: {
                exists: creditCardAccountExists,
                id: creditCardAccountId,
                name: creditCardAccountName
            },
            expenseAccount: {
                exists: expenseAccountExists,
                id: expenseAccountId,
                name: expenseAccountName
            }
        });
    } catch (error: any) {
        console.error('[CHECK-ACCOUNTS] Error:', error);
        return NextResponse.json({
            success: false,
            message: `Error checking accounts: ${error.message}`,
            error: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}

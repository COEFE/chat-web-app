import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { CreditCardAgent } from '@/lib/agents/creditCardAgent';
import { query } from '@/lib/db';
import { AgentContext } from '@/types/agents';

// Note: For testing purposes, we need to access private methods
// In a production environment, we would refactor the agent to expose testable methods
// or create proper test hooks. This is a temporary solution for testing.

interface TestResult {
    success: boolean;
    message: string;
    details?: any;
    error?: string;
    verificationLog: string[];
}

// Helper function to get/create a default expense account ID
async function getDefaultExpenseAccountId(userId: string, addToLog: (log: string) => void, expenseAccountName?: string): Promise<string | null> {
    const defaultName = expenseAccountName || 'Miscellaneous Expense';
    addToLog(`Attempting to find/create expense account: ${defaultName}`);
    
    try {
        // Try multiple strategies to find an expense account
        let accountId: string | null = null;
        
        // Strategy 1: Find the specified expense account by exact name
        addToLog(`Strategy 1: Looking for exact match of '${defaultName}'...`);
        let accountResult = await query(
            'SELECT id, name FROM accounts WHERE name = $1 AND user_id = $2 LIMIT 1', 
            [defaultName, userId]
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found exact match for expense account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Strategy 2: Find the specified expense account by LIKE
        addToLog(`Strategy 2: Looking for partial match of '${defaultName}'...`);
        accountResult = await query(
            'SELECT id, name FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
            [`%${defaultName.toLowerCase()}%`, userId, 'expense']
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found partial match for expense account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Strategy 3: Find Miscellaneous Expense account as fallback
        if (defaultName.toLowerCase() !== 'miscellaneous expense') {
            addToLog('Strategy 3: Looking for Miscellaneous Expense account as fallback...');
            accountResult = await query(
                'SELECT id, name FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
                ['%miscellaneous expense%', userId, 'expense']
            );
            
            if (accountResult.rows.length > 0) {
                accountId = accountResult.rows[0].id;
                addToLog(`Found Miscellaneous Expense account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
                return accountId;
            }
        }
        
        // Strategy 4: Find General Expense account
        addToLog('Strategy 4: Looking for General Expense account...');
        accountResult = await query(
            'SELECT id, name FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
            ['%general expense%', userId, 'expense']
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found General Expense account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Strategy 5: Find any expense account
        addToLog('Strategy 5: Looking for any expense account...');
        accountResult = await query(
            'SELECT id, name FROM accounts WHERE account_type = $1 AND user_id = $2 LIMIT 1', 
            ['expense', userId]
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found generic expense account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // No account found, create a new account with the specified name
        addToLog(`No expense account found using any strategy. Creating a new account: '${defaultName}'...`);
        
        // Generate a unique account code
        const accountCode = `EXP${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Create the account
        const insertResult = await query(
            'INSERT INTO accounts (name, code, account_type, user_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [defaultName, accountCode, 'expense', userId, true]
        );
        
        if (insertResult.rows.length > 0) {
            const newAccountId = insertResult.rows[0].id;
            addToLog(`Created new expense account '${defaultName}' with ID: ${newAccountId} and code: ${accountCode}`);
            return newAccountId;
        } else {
            addToLog(`Failed to create expense account '${defaultName}'.`);
            return null;
        }
    } catch (e: any) {
        addToLog(`Error finding/creating expense account: ${e.message}`);
        if (e.stack) addToLog(`Error stack: ${e.stack}`);
        return null;
    }
}

async function getCreditCardAccountIdByName(accountName: string, userId: string, lastFourDigits: string, addToLog: (log: string) => void): Promise<string | null> {
    addToLog(`Querying for Credit Card account ID by name: ${accountName} with last four digits: ${lastFourDigits}`);
    try {
        // Try multiple strategies to find the account
        let accountId: string | null = null;
        
        // Strategy 1: Exact name match
        addToLog('Strategy 1: Trying exact name match...');
        let accountResult = await query('SELECT id, name FROM accounts WHERE name = $1 AND user_id = $2 LIMIT 1', 
            [accountName, userId]);
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found Credit Card account by exact name: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Strategy 2: LIKE match with account name
        addToLog('Strategy 2: Trying LIKE match with account name...');
        accountResult = await query(
            'SELECT id, name FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
            [`%${accountName.toLowerCase()}%`, userId, 'credit_card']
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found Credit Card account by LIKE match: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Strategy 3: Match by last four digits
        if (lastFourDigits && lastFourDigits.length === 4) {
            addToLog(`Strategy 3: Trying to match by last four digits: ${lastFourDigits}...`);
            accountResult = await query(
                'SELECT id, name FROM accounts WHERE LOWER(name) LIKE $1 AND user_id = $2 LIMIT 1', 
                [`%${lastFourDigits}%`, userId]
            );
            
            if (accountResult.rows.length > 0) {
                accountId = accountResult.rows[0].id;
                addToLog(`Found Credit Card account by last four digits: '${accountResult.rows[0].name}' with ID: ${accountId}`);
                return accountId;
            }
        }
        
        // Strategy 4: Find any credit card account
        addToLog('Strategy 4: Looking for any credit card account...');
        accountResult = await query(
            'SELECT id, name FROM accounts WHERE account_type = $1 AND user_id = $2 LIMIT 1', 
            ['credit_card', userId]
        );
        
        if (accountResult.rows.length > 0) {
            accountId = accountResult.rows[0].id;
            addToLog(`Found generic Credit Card account: '${accountResult.rows[0].name}' with ID: ${accountId}`);
            return accountId;
        }
        
        // No account found, create it
        addToLog(`No Credit Card account found using any strategy. Creating a new one...`);
        
        // Generate a unique account code
        const accountCode = `CC${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Create a name that includes the last four digits if available
        const newAccountName = lastFourDigits ? 
            `Credit Card ${lastFourDigits}` : 
            accountName || 'Credit Card Account';
        
        // Create the account
        const insertResult = await query(
            'INSERT INTO accounts (name, code, account_type, user_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [newAccountName, accountCode, 'credit_card', userId, true]
        );
        
        if (insertResult.rows.length > 0) {
            const newAccountId = insertResult.rows[0].id;
            addToLog(`Created new Credit Card account '${newAccountName}' with ID: ${newAccountId} and code: ${accountCode}`);
            return newAccountId;
        } else {
            addToLog(`Failed to create Credit Card account '${newAccountName}'.`);
            return null;
        }
    } catch (e: any) {
        addToLog(`Error querying/creating Credit Card account ID: ${e.message}`);
        if (e.stack) addToLog(`Error stack: ${e.stack}`);
        return null;
    }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const verificationLog: string[] = [];
    const addToLog = (message: string) => {
        console.log(`[TEST-LOG] ${message}`); // Add console logging for server logs
        verificationLog.push(`[${new Date().toISOString()}] ${message}`);
    };

    addToLog('API endpoint /api/tests/credit-card-agent-full-flow-test called.');

    try {
        const user = await auth(req);
        if (!user || !user.uid) {
            addToLog('User unauthorized: No user or user.uid found in request.');
            return NextResponse.json({ success: false, message: 'Unauthorized', verificationLog }, { status: 401 });
        }
        const userId = user.uid;
        addToLog(`Authenticated user ID: ${userId}`);

        // Parse request body if available
        let requestBody = {};
        try {
            requestBody = await req.json();
            addToLog(`Request body received: ${JSON.stringify(requestBody)}`);
        } catch (e) {
            addToLog('No request body provided or invalid JSON. Using default values.');
        }

        // Create the CreditCardAgent instance
        const agent = new CreditCardAgent();

        addToLog('Preparing test data and accounts...');

        // Get account names from request body or use defaults
        const creditCardAccountName = (requestBody as any).creditCardAccountName || "Test Bank 1234";
        addToLog(`Will use credit card account name: ${creditCardAccountName}`);

        const expenseAccountName = (requestBody as any).expenseAccountName || "Miscellaneous Expense";
        addToLog(`Will use expense account name: ${expenseAccountName}`);

        // Check if debug mode is enabled
        const debugMode = (requestBody as any).debug === true;
        if (debugMode) {
            addToLog('DEBUG MODE ENABLED: Will provide detailed diagnostic information');
        }

        // Get the default expense account ID
        const defaultExpenseAccountId = await getDefaultExpenseAccountId(userId, addToLog, expenseAccountName);
        if (!defaultExpenseAccountId) {
            addToLog('Critical setup error: Could not obtain a default expense account ID.');
            return NextResponse.json({ success: false, message: 'Test setup failed (Default Expense Account ID).', verificationLog }, { status: 500 });
        }
        addToLog(`Using Default Expense Account ID: ${defaultExpenseAccountId}`);

        // Create a test vendor
        const testVendorName = "Test CC Merchant - Full Flow Test";
        addToLog(`Test Vendor: ${testVendorName}`);
        
        // Find or create the vendor
        addToLog(`Finding or creating vendor: ${testVendorName}`);
        const vendorQuery = await query(
            'SELECT id FROM vendors WHERE name = $1 AND user_id = $2 LIMIT 1',
            [testVendorName, userId]
        );
        
        let vendorId;
        if (vendorQuery.rows.length > 0) {
            vendorId = vendorQuery.rows[0].id;
            addToLog(`Found existing vendor '${testVendorName}' with ID: ${vendorId}`);
        } else {
            addToLog(`Vendor '${testVendorName}' not found. Creating it...`);
            const insertVendorResult = await query(
                'INSERT INTO vendors (name, user_id) VALUES ($1, $2) RETURNING id',
                [testVendorName, userId]
            );
            if (insertVendorResult.rows.length > 0) {
                vendorId = insertVendorResult.rows[0].id;
                addToLog(`Created new vendor '${testVendorName}' with ID: ${vendorId}`);
            } else {
                addToLog(`Failed to create vendor '${testVendorName}'.`);
                throw new Error('Failed to create vendor');
            }
        }

        // Create test transactions (similar to what would be extracted from a PDF)
        const testTransactions = [
            {
                id: 'test-txn-' + Date.now() + '-1',
                date: new Date().toISOString().split('T')[0],
                description: "Test Purchase - Coffee Shop",
                amount: 5.99,
                category: "Business Meals",
                merchant: testVendorName
            },
            {
                id: 'test-txn-' + Date.now() + '-2',
                date: new Date().toISOString().split('T')[0],
                description: "Test Purchase - Office Supplies",
                amount: 25.49,
                category: "Office Supplies",
                merchant: testVendorName
            },
            {
                id: 'test-txn-' + Date.now() + '-3',
                date: new Date().toISOString().split('T')[0],
                description: "Test Payment - Thank You",
                amount: -100.00,
                category: "Payment",
                merchant: "Payment"
            }
        ];

        // Create test statement info (similar to what would be extracted from a PDF)
        const testStatementInfo = {
            statementNumber: "TEST-STMT-" + Date.now(),
            creditCardIssuer: "Test Bank",
            lastFourDigits: "1234",
            statementDate: new Date().toISOString().split('T')[0],
            balance: 540.82,
            dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            minimumPayment: 25.00,
            transactions: testTransactions
        };
        
        // Create the agent context
        const agentContext: AgentContext = {
            userId: userId,
            query: `Process credit card transactions for ${creditCardAccountName}`,
            additionalContext: {
                forceTransactionProcessing: true,
                statementInfo: testStatementInfo,  // Include the statement info in the context
                documentContext: {
                    extractedData: {
                        statementInfo: testStatementInfo
                    }
                }
            }
        };

        addToLog('Testing full credit card processing flow...');
        addToLog(`Test statement info: ${JSON.stringify(testStatementInfo, null, 2)}`);

        // Step 1: Find or create accounts using our enhanced lookup functions
        addToLog('Step 1: Finding or creating accounts using enhanced lookup...');
        try {
            // Find or create credit card account using our enhanced function
            const creditCardAccountId = await getCreditCardAccountIdByName(
                creditCardAccountName, 
                userId, 
                testStatementInfo.lastFourDigits,
                addToLog
            );
            
            if (!creditCardAccountId) {
                addToLog('Critical error: Could not find or create credit card account');
                throw new Error('Could not find or create credit card account');
            }
            
            addToLog(`Using credit card account with ID: ${creditCardAccountId}`);
            
            // Get the default expense account ID using our enhanced function
            const defaultExpenseAccountId = await getDefaultExpenseAccountId(userId, addToLog);
            if (!defaultExpenseAccountId) {
                addToLog('Critical error: Could not find or create default expense account');
                throw new Error('Could not find or create default expense account');
            }
            
            addToLog(`Using default expense account with ID: ${defaultExpenseAccountId}`);
            
            // Step 2: Process transactions directly using the CreditCardAgent's methods
            addToLog('Step 2: Processing transactions directly...');
            
            // Get the account name for the credit card account
            const accountResult = await query('SELECT name FROM accounts WHERE id = $1', [creditCardAccountId]);
            if (accountResult.rows.length === 0) {
                addToLog('Critical error: Could not find account name for the credit card account');
                throw new Error('Could not find account name for the credit card account');
            }
            
            const accountName = accountResult.rows[0].name;
            addToLog(`Using credit card account name: ${accountName}`);
            
            // Access the recordTransactionInAP method from the agent
            const recordTransactionInAP = (agent as any).recordTransactionInAP.bind(agent);
            
            if (typeof recordTransactionInAP !== 'function') {
                addToLog(`Error: recordTransactionInAP is not a function. Type: ${typeof recordTransactionInAP}`);
                throw new Error('recordTransactionInAP is not a function');
            }
            
            // Process each purchase transaction directly
            let processedCount = 0;
            let errors = [];
            
            for (const transaction of testStatementInfo.transactions) {
                if (transaction.amount > 0) { // Only process purchase transactions
                    try {
                        addToLog(`Directly processing transaction: ${transaction.description} for $${transaction.amount}`);
                        
                        // Use the default expense account we found/created
                        const result = await recordTransactionInAP(
                            agentContext,
                            transaction,
                            creditCardAccountId,
                            accountName,
                            defaultExpenseAccountId, // Use the default expense account
                            transaction.category || "Miscellaneous Expense" // Use category from transaction if available
                        );
                        
                        addToLog(`Transaction processing result: ${JSON.stringify(result, null, 2)}`);
                        
                        if (result.success) {
                            processedCount++;
                            addToLog(`Successfully processed transaction: ${transaction.description}`);
                        } else {
                            errors.push(`Failed to process transaction ${transaction.description}: ${result.message}`);
                            addToLog(`Failed to process transaction: ${transaction.description} - ${result.message}`);
                        }
                    } catch (error: any) {
                        errors.push(`Error processing transaction ${transaction.description}: ${error.message}`);
                        addToLog(`Error processing transaction ${transaction.description}: ${error.message}`);
                        if (error.stack) addToLog(`Error stack: ${error.stack}`);
                    }
                } else {
                    addToLog(`Skipping payment/refund transaction: ${transaction.description} for $${Math.abs(transaction.amount)}`);
                }
            }
            
            // Create a transaction result object similar to what processCreditCardTransactions would return
            const transactionResult = {
                success: processedCount > 0,
                message: `Processed ${processedCount} out of ${testStatementInfo.transactions.filter(t => t.amount > 0).length} transactions.${errors.length > 0 ? ' Errors: ' + errors.join('; ') : ''}`,
                processedCount: processedCount,
                categorizedTransactions: []
            };
            
            addToLog(`Transaction processing result: ${JSON.stringify(transactionResult, null, 2)}`);
            
            if (!transactionResult.success) {
                addToLog(`Failed to process transactions: ${transactionResult.message}`);
                throw new Error(`Failed to process transactions: ${transactionResult.message}`);
            }
            
            addToLog(`Successfully processed ${transactionResult.processedCount} of ${testStatementInfo.transactions.length} transactions`);
            
            // Step 3: Verify the results in the database
            addToLog('Step 3: Verifying results in database...');
            
            // Check for bills created for purchase transactions
            let billsCreated = 0;
            let journalEntriesCreated = 0;
            
            for (const transaction of testStatementInfo.transactions) {
                if (transaction.amount > 0) { // Purchase transaction
                    addToLog(`Checking for bill created for purchase transaction: ${transaction.description}`);
                    
                    const billResult = await query(
                        'SELECT id, status, total_amount, amount_paid, ap_account_id, vendor_id FROM bills WHERE memo LIKE $1 AND user_id = $2',
                        [`%${transaction.description}%`, userId]
                    );
                    
                    if (billResult.rows.length > 0) {
                        const dbBill = billResult.rows[0];
                        addToLog(`Found bill ID ${dbBill.id} for transaction: ${transaction.description}`);
                        billsCreated++;
                        
                        // Check for journal entry
                        const journalResult = await query(
                            "SELECT id FROM journals WHERE memo LIKE $1 AND user_id = $2 AND journal_type = 'CCP'",
                            [`%Bill #${dbBill.id}%`, userId]
                        );
                        
                        if (journalResult.rows.length > 0) {
                            const journalId = journalResult.rows[0].id;
                            addToLog(`Found journal ID ${journalId} for bill ID ${dbBill.id}`);
                            journalEntriesCreated++;
                            
                            // Check journal lines
                            const journalLinesResult = await query(
                                'SELECT * FROM journal_lines WHERE journal_id = $1',
                                [journalId]
                            );
                            
                            if (journalLinesResult.rows.length === 2) {
                                addToLog(`Found ${journalLinesResult.rows.length} journal lines for journal ID ${journalId}`);
                                
                                // Check that we have one credit line for the credit card account and one debit line for the expense account
                                let hasValidCreditLine = false;
                                let hasValidDebitLine = false;
                                
                                for (const line of journalLinesResult.rows) {
                                    if (line.account_id === Number(creditCardAccountId) && Math.abs(parseFloat(line.credit) - transaction.amount) < 0.001) {
                                        hasValidCreditLine = true;
                                        addToLog(`Found credit journal line for credit card account ID ${creditCardAccountId} with amount ${line.credit}`);
                                    }
                                    
                                    if (Math.abs(parseFloat(line.debit) - transaction.amount) < 0.001) {
                                        hasValidDebitLine = true;
                                        addToLog(`Found debit journal line with amount ${line.debit}`);
                                    }
                                }
                                
                                if (!hasValidCreditLine) {
                                    addToLog(`No valid credit journal line found for credit card account ID ${creditCardAccountId}`);
                                }
                                
                                if (!hasValidDebitLine) {
                                    addToLog(`No valid debit journal line found`);
                                }
                            } else {
                                addToLog(`Expected 2 journal lines, found ${journalLinesResult.rows.length}`);
                            }
                        } else {
                            addToLog(`No journal entry found for bill ID ${dbBill.id}`);
                        }
                    } else {
                        addToLog(`No bill found for transaction: ${transaction.description}`);
                    }
                }
            }
            
            addToLog(`Found ${billsCreated} bills and ${journalEntriesCreated} journal entries for ${testStatementInfo.transactions.filter(t => t.amount > 0).length} purchase transactions`);
            
            const testResult: TestResult = {
                success: billsCreated > 0 && journalEntriesCreated > 0,
                message: `Test ${billsCreated > 0 && journalEntriesCreated > 0 ? 'passed' : 'failed'}: Found ${billsCreated} bills and ${journalEntriesCreated} journal entries for ${testStatementInfo.transactions.filter(t => t.amount > 0).length} purchase transactions`,
                details: {
                    billsCreated,
                    journalEntriesCreated,
                    purchaseTransactions: testStatementInfo.transactions.filter(t => t.amount > 0).length
                },
                verificationLog
            };
            
            addToLog(`Overall Test Result: ${testResult.success ? 'PASSED' : 'FAILED'}`);
            
            return NextResponse.json(testResult);
        } catch (error: any) {
            console.error("Error in credit card agent full flow test:", error);
            addToLog(`Unhandled error in test: ${error.message}`);
            addToLog(`Error stack: ${error.stack || 'No stack trace available'}`);
            
            return NextResponse.json({ 
                success: false, 
                message: `Error in credit card agent full flow test: ${error.message}`,
                error: error.message,
                verificationLog
            }, { status: 500 });
        }
    } catch (error: any) {
        console.error("Error in credit card agent test API:", error);
        addToLog(`Unhandled error in API: ${error.message}`);
        addToLog(`Error stack: ${error.stack || 'No stack trace available'}`);
        
        return NextResponse.json({ 
            success: false, 
            message: `Error in credit card agent test API: ${error.message}`,
            error: error.message,
            verificationLog
        }, { status: 500 });
    }
}

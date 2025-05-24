import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { CreditCardAgent } from '@/lib/agents/creditCardAgent';
import { query } from '@/lib/db';
import { AgentContext } from '@/types/agents';
import { CreditCardTransaction } from '@/types/creditCard';

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
async function getDefaultExpenseAccountId(userId: string, addToLog: (log: string) => void): Promise<string | null> {
    addToLog('Attempting to find/create default expense account...');
    const defaultExpenseAccountName = 'Miscellaneous Expense'; 
    try {
        // First, try to find the existing account
        let accountResult = await query('SELECT id FROM accounts WHERE name = $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
            [defaultExpenseAccountName, userId, 'Expense']);
        
        if (accountResult.rows.length > 0) {
            const accountId = accountResult.rows[0].id;
            addToLog(`Found existing default expense account '${defaultExpenseAccountName}' with ID: ${accountId}`);
            return accountId;
        } 
        
        // Account not found, create it
        addToLog(`Default expense account '${defaultExpenseAccountName}' not found. Creating it...`);
        
        // Generate a unique account code
        const accountCode = `EXP${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Create the account
        const insertResult = await query(
            'INSERT INTO accounts (name, code, account_type, user_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [defaultExpenseAccountName, accountCode, 'Expense', userId, true]
        );
        
        if (insertResult.rows.length > 0) {
            const newAccountId = insertResult.rows[0].id;
            addToLog(`Created new default expense account '${defaultExpenseAccountName}' with ID: ${newAccountId} and code: ${accountCode}`);
            return newAccountId;
        } else {
            addToLog(`Failed to create default expense account '${defaultExpenseAccountName}'.`);
            return null;
        }
    } catch (e: any) {
        addToLog(`Error finding/creating default expense account: ${e.message}`);
        if (e.stack) addToLog(`Error stack: ${e.stack}`);
        return null;
    }
}

async function getCreditCardAccountIdByName(accountName: string, userId: string, addToLog: (log: string) => void): Promise<string | null> {
    addToLog(`Querying for Credit Card account ID by name: ${accountName}`);
    try {
        // First, try to find the existing account
        const accountResult = await query('SELECT id FROM accounts WHERE name = $1 AND user_id = $2 AND account_type = $3 LIMIT 1', 
            [accountName, userId, 'Liability']); // Assuming CC accounts are 'Liability'
        
        if (accountResult.rows.length > 0) {
            const accountId = accountResult.rows[0].id;
            addToLog(`Found Credit Card account '${accountName}' with ID: ${accountId}`);
            return accountId;
        }
        
        // Account not found, create it
        addToLog(`Credit Card account '${accountName}' not found. Creating it...`);
        
        // Generate a unique account code
        const accountCode = `CC${Math.floor(1000 + Math.random() * 9000)}`;
        
        // Create the account
        const insertResult = await query(
            'INSERT INTO accounts (name, code, account_type, user_id, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [accountName, accountCode, 'Liability', userId, true]
        );
        
        if (insertResult.rows.length > 0) {
            const newAccountId = insertResult.rows[0].id;
            addToLog(`Created new Credit Card account '${accountName}' with ID: ${newAccountId} and code: ${accountCode}`);
            return newAccountId;
        } else {
            addToLog(`Failed to create Credit Card account '${accountName}'.`);
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

    addToLog('API endpoint /api/tests/credit-card-agent-bill-creation-test-route called.');

    try {
        const user = await auth(req);
        if (!user || !user.uid) {
            addToLog('User unauthorized: No user or user.uid found in request.');
            return NextResponse.json({ success: false, message: 'Unauthorized', verificationLog }, { status: 401 });
        }
        const userId = user.uid;
        addToLog(`Authenticated user ID: ${userId}`);

        // Create the CreditCardAgent instance
        const agent = new CreditCardAgent();

        addToLog('Preparing test data and accounts...');

        // Get or create a credit card account for testing
        const creditCardAccountName = "Test CC - Bill Agent Test ARF";
        addToLog(`Finding or creating credit card account: ${creditCardAccountName}`);
        
        // Get the credit card account ID
        const creditCardAccountResult = await getCreditCardAccountIdByName(creditCardAccountName, userId, addToLog);
        if (!creditCardAccountResult) {
            addToLog('Critical setup error: Could not obtain a credit card account ID.');
            return NextResponse.json({ success: false, message: 'Test setup failed (Credit Card Account ID).', verificationLog }, { status: 500 });
        }
        const creditCardAccountId = creditCardAccountResult;
        addToLog(`Using Credit Card Account ID: ${creditCardAccountId}`);

        // Get the default expense account ID
        const defaultExpenseAccountId = await getDefaultExpenseAccountId(userId, addToLog);
        if (!defaultExpenseAccountId) {
            addToLog('Critical setup error: Could not obtain a default expense account ID.');
            return NextResponse.json({ success: false, message: 'Test setup failed (Default Expense Account ID).', verificationLog }, { status: 500 });
        }
        addToLog(`Using Default Expense Account ID: ${defaultExpenseAccountId}`);

        // Create a test transaction
        const testVendorName = "Test CC Merchant - Agent Test ARF";
        addToLog(`Test Vendor: ${testVendorName}`);
        
        const purchaseTransaction: CreditCardTransaction = {
            id: 'test-txn-' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            description: "Test Purchase - Latte CC Agent ARF",
            amount: 6.99,
            category: "Business Meals",
            merchant: testVendorName
        };
        
        // Create the agent context
        const agentContext: AgentContext = {
            userId: userId,
            query: `Process credit card transactions for ${creditCardAccountName}`,
            additionalContext: {
                forceTransactionProcessing: true
            }
        };
        
        addToLog('Testing bill creation for credit card transactions...');
        
        let createdBillId: string | null = null;
        let recordingSuccessful = false;
        
        try {
            // Instead of using the processRequest method which requires statement extraction,
            // we'll directly call the recordTransactionInAP method using TypeScript's type assertion
            // This is a testing approach to bypass the statement extraction step
            addToLog(`Setting up direct bill creation test with: accountId=${creditCardAccountId}, expenseAccountId=${defaultExpenseAccountId}`);
            
            // First, find or create the vendor
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
            
            // Use the CreditCardAgent's recordTransactionInAP method
            addToLog(`Using CreditCardAgent.recordTransactionInAP to create bill and journal entry...`);
            
            // We need to access the private recordTransactionInAP method
            // This is only for testing purposes - in production code, we would refactor the agent
            // to expose testable methods or create proper test hooks
            const recordTransactionInAP = (agent as any).recordTransactionInAP.bind(agent);
            
            if (typeof recordTransactionInAP !== 'function') {
                addToLog(`Error: recordTransactionInAP is not a function. Type: ${typeof recordTransactionInAP}`);
                throw new Error('recordTransactionInAP is not a function');
            }
            
            addToLog(`Transaction data: ${JSON.stringify(purchaseTransaction)}`);
            
            try {
                // Call the recordTransactionInAP method directly
                const result = await recordTransactionInAP(
                    agentContext,
                    purchaseTransaction,
                    Number(creditCardAccountId),
                    creditCardAccountName,
                    Number(defaultExpenseAccountId),
                    purchaseTransaction.category || 'Business Expense'
                );
                
                if (result.success && result.billId) {
                    createdBillId = result.billId.toString();
                    addToLog(`Successfully created bill with ID: ${createdBillId}`);
                    recordingSuccessful = true;
                } else {
                    addToLog(`Failed to create bill: ${result.message}`);
                    recordingSuccessful = false;
                }
            } catch (billError: any) {
                addToLog(`Error calling recordTransactionInAP: ${billError.message}`);
                if (billError.stack) addToLog(`Error stack: ${billError.stack}`);
                recordingSuccessful = false;
            }
        } catch (e: any) {
            addToLog(`Error in test setup: ${e.message}`);
            if (e.stack) addToLog(`Error stack: ${e.stack}`);
            recordingSuccessful = false;
        }
        
        // Skip payment transaction test for simplicity
        addToLog('Skipping payment transaction test for now to focus on purchase bill creation.');

        // Verify results in database
        addToLog('Verifying results in database...');
        let billVerified = false;
        let checksPassed = true;

        if (recordingSuccessful && createdBillId) {
            // We have the bill ID, so we can query it directly
            addToLog(`Querying bill with ID: ${createdBillId}`);
            try {
                const billResult = await query(
                    'SELECT id, status, total_amount, amount_paid, ap_account_id, vendor_id FROM bills WHERE id = $1 AND user_id = $2',
                    [createdBillId, userId]
                );

                if (billResult.rows.length > 0) {
                    const dbBill = billResult.rows[0];
                    addToLog(`DB CHECK: Found bill ID ${dbBill.id} in database.`);

                    if (dbBill.status === 'Paid') addToLog(`  OK: Bill status is 'Paid'.`); 
                    else { addToLog(`  FAIL: Bill status is '${dbBill.status}', expected 'Paid'.`); checksPassed = false; }
                    
                    if (Math.abs(parseFloat(dbBill.total_amount) - purchaseTransaction.amount) < 0.001) addToLog(`  OK: Bill total_amount (${dbBill.total_amount}) matches transaction amount (${purchaseTransaction.amount}).`); 
                    else { addToLog(`  FAIL: Bill total_amount is ${dbBill.total_amount}, expected ${purchaseTransaction.amount}.`); checksPassed = false; }
                    
                    if (Math.abs(parseFloat(dbBill.amount_paid) - purchaseTransaction.amount) < 0.001) addToLog(`  OK: Bill amount_paid (${dbBill.amount_paid}) matches transaction amount (${purchaseTransaction.amount}).`); 
                    else { addToLog(`  FAIL: Bill amount_paid is ${dbBill.amount_paid}, expected ${purchaseTransaction.amount}.`); checksPassed = false; }
                    
                    if (dbBill.ap_account_id === Number(creditCardAccountId)) addToLog(`  OK: Bill ap_account_id (${dbBill.ap_account_id}) matches target credit card account ID (${creditCardAccountId}).`); 
                    else { addToLog(`  FAIL: Bill ap_account_id is ${dbBill.ap_account_id}, expected ${creditCardAccountId} (for CC: ${creditCardAccountName}).`); checksPassed = false; }
                    
                    const vendorResult = await query('SELECT name FROM vendors WHERE id = $1 AND user_id = $2', [dbBill.vendor_id, userId]);
                    if (vendorResult.rows.length === 1 && vendorResult.rows[0].name === testVendorName) {
                        addToLog(`  OK: Vendor is '${vendorResult.rows[0].name}'.`);
                    } else {
                        addToLog(`  FAIL: Vendor not found or incorrect for bill. Expected '${testVendorName}', Found: ${vendorResult.rows[0]?.name}. Vendor ID on bill: ${dbBill.vendor_id}`); 
                        checksPassed = false;
                    }

                    const billLinesResult = await query('SELECT * FROM bill_lines WHERE bill_id = $1', [createdBillId]);
                    
                    if (billLinesResult.rows.length === 1) {
                        const dbBillLine = billLinesResult.rows[0];
                        addToLog(`DB CHECK: Found ${billLinesResult.rows.length} bill line for bill ID ${createdBillId}.`);
                        
                        if (dbBillLine.expense_account_id === Number(defaultExpenseAccountId)) addToLog(`  OK: Bill line expense_account_id (${dbBillLine.expense_account_id}) matches default expense account ID (${defaultExpenseAccountId}).`);
                        else { addToLog(`  FAIL: Bill line expense_account_id is ${dbBillLine.expense_account_id}, expected ${defaultExpenseAccountId}.`); checksPassed = false; }
                        
                        if (Math.abs(parseFloat(dbBillLine.amount) - purchaseTransaction.amount) < 0.001) addToLog(`  OK: Bill line amount (${dbBillLine.amount}) matches transaction amount (${purchaseTransaction.amount}).`);
                        else { addToLog(`  FAIL: Bill line amount is ${dbBillLine.amount}, expected ${purchaseTransaction.amount}.`); checksPassed = false; }
                    } else {
                        addToLog(`  FAIL: Expected 1 bill line, found ${billLinesResult.rows.length}.`);
                        checksPassed = false;
                    }
                    
                    // Check for journal entries
                    addToLog(`DB CHECK: Looking for journal entries related to bill ID ${createdBillId}...`);
                    
                    // First check if the bills table has a journal_id column
                    let journalId = null;
                    try {
                        const columnCheck = await query(`
                            SELECT EXISTS (
                                SELECT 1 FROM information_schema.columns 
                                WHERE table_name = 'bills' AND column_name = 'journal_id'
                            ) as has_journal_id
                        `);
                        
                        const hasJournalIdColumn = columnCheck.rows[0].has_journal_id;
                        addToLog(`  INFO: Bills table ${hasJournalIdColumn ? 'has' : 'does not have'} journal_id column.`);
                        
                        if (hasJournalIdColumn) {
                            const billJournalResult = await query(
                                'SELECT journal_id FROM bills WHERE id = $1 AND user_id = $2',
                                [createdBillId, userId]
                            );
                            
                            if (billJournalResult.rows.length > 0 && billJournalResult.rows[0].journal_id) {
                                journalId = billJournalResult.rows[0].journal_id;
                                addToLog(`  OK: Found journal ID ${journalId} linked to bill ID ${createdBillId}.`);
                            }
                        }
                    } catch (error: any) {
                        addToLog(`  ERROR: Failed to check for journal_id column: ${error.message}`);
                    }
                    
                    // If no journal_id on the bill, look for journals with a matching memo containing the bill ID
                    if (!journalId) {
                        try {
                            const journalSearchResult = await query(
                                "SELECT id FROM journals WHERE memo LIKE $1 AND user_id = $2 AND journal_type = 'CCP'",
                                [`%Bill #${createdBillId}%`, userId]
                            );
                            
                            if (journalSearchResult.rows.length > 0) {
                                journalId = journalSearchResult.rows[0].id;
                                addToLog(`  OK: Found journal ID ${journalId} with memo referencing bill ID ${createdBillId}.`);
                            } else {
                                addToLog(`  FAIL: No journal entry found for bill ID ${createdBillId}.`);
                                checksPassed = false;
                            }
                        } catch (error: any) {
                            addToLog(`  ERROR: Failed to search for journal by memo: ${error.message}`);
                            checksPassed = false;
                        }
                    }
                    
                    // If we found a journal, check its lines
                    if (journalId) {
                        try {
                            const journalLinesResult = await query(
                                'SELECT * FROM journal_lines WHERE journal_id = $1',
                                [journalId]
                            );
                            
                            if (journalLinesResult.rows.length === 2) {
                                addToLog(`  OK: Found ${journalLinesResult.rows.length} journal lines for journal ID ${journalId}.`);
                                
                                // Check that we have one credit line for the credit card account and one debit line for the expense account
                                let hasValidCreditLine = false;
                                let hasValidDebitLine = false;
                                
                                for (const line of journalLinesResult.rows) {
                                    if (line.account_id === Number(creditCardAccountId) && Math.abs(parseFloat(line.credit) - purchaseTransaction.amount) < 0.001) {
                                        hasValidCreditLine = true;
                                        addToLog(`  OK: Found credit journal line for credit card account ID ${creditCardAccountId} with amount ${line.credit}.`);
                                    }
                                    
                                    if (line.account_id === Number(defaultExpenseAccountId) && Math.abs(parseFloat(line.debit) - purchaseTransaction.amount) < 0.001) {
                                        hasValidDebitLine = true;
                                        addToLog(`  OK: Found debit journal line for expense account ID ${defaultExpenseAccountId} with amount ${line.debit}.`);
                                    }
                                }
                                
                                if (!hasValidCreditLine) {
                                    addToLog(`  FAIL: No valid credit journal line found for credit card account ID ${creditCardAccountId}.`);
                                    checksPassed = false;
                                }
                                
                                if (!hasValidDebitLine) {
                                    addToLog(`  FAIL: No valid debit journal line found for expense account ID ${defaultExpenseAccountId}.`);
                                    checksPassed = false;
                                }
                            } else {
                                addToLog(`  FAIL: Expected 2 journal lines, found ${journalLinesResult.rows.length}.`);
                                checksPassed = false;
                            }
                        } catch (error: any) {
                            addToLog(`  ERROR: Failed to check journal lines: ${error.message}`);
                            checksPassed = false;
                        }
                    }
                    
                    billVerified = checksPassed;
                } else {
                    addToLog(`FAIL: Could not find bill with ID ${createdBillId} in database for user ${userId}.`);
                }
            } catch (dbError: any) {
                addToLog(`Error querying database: ${dbError.message}`);
                if (dbError.stack) addToLog(`DB error stack: ${dbError.stack}`);
            }
        } else {
            addToLog('SKIP DB VERIFICATION: Bill creation failed or no bill ID was returned.');
        }

        // Return the test result
        const testResult: TestResult = {
            success: recordingSuccessful && billVerified,
            message: recordingSuccessful 
                ? (billVerified ? 'Test passed: Bill and journal entry created successfully.' : 'Test partially passed: Bill created but verification failed.')
                : 'Test failed: Could not create bill.',
            verificationLog
        };
        
        addToLog(`Overall Test Result: ${testResult.success ? 'PASSED' : 'FAILED'}`);
        
        return NextResponse.json(testResult);
        
    } catch (error: any) {
        console.error("Error in credit card agent test API:", error);
        addToLog(`Unhandled error in API: ${error.message}`);
        addToLog(`Error stack: ${error.stack || 'No stack trace available'}`);
        
        // Additional diagnostic information
        if (error.code) addToLog(`Error code: ${error.code}`);
        if (error.position) addToLog(`Error position: ${error.position}`);
        addToLog(`Full error object: ${JSON.stringify(error)}`);
        
        // Try to diagnose the error location
        addToLog(`Attempting to diagnose error location...`);
        
        return NextResponse.json({ 
            success: false, 
            message: `Error in credit card agent test API: ${error.message}`,
            error: error.message,
            verificationLog
        }, { status: 500 });
    }
}

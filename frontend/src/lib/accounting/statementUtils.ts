import { findStatementByAccountIdentifiers, isStatementProcessed } from './statementTracker';

/**
 * Check if a statement has already been processed and identify the account
 * This is a utility function for the AP Agent to use when processing statements
 * 
 * @param statementNumber The full statement number
 * @param userId The user ID
 * @returns Information about the statement and account
 */
export async function checkStatementStatus(
  statementNumber: string,
  userId: string
): Promise<{
  isProcessed: boolean;
  accountId?: number;
  accountName?: string;
  hasStartingBalance: boolean;
  lastFour: string;
}> {
  try {
    // Extract last four digits for fallback identification
    const lastFour = statementNumber.length >= 4 
      ? statementNumber.slice(-4) 
      : statementNumber;
    
    // Try to find the account by statement identifiers
    const existingAccount = await findStatementByAccountIdentifiers(
      statementNumber,
      lastFour,
      userId
    );
    
    if (!existingAccount) {
      return {
        isProcessed: false,
        hasStartingBalance: false,
        lastFour
      };
    }
    
    // Check if this statement has already been processed
    const isProcessed = await isStatementProcessed(
      existingAccount.accountId,
      statementNumber,
      lastFour,
      userId
    );
    
    return {
      isProcessed,
      accountId: existingAccount.accountId,
      accountName: existingAccount.accountName,
      hasStartingBalance: existingAccount.hasStartingBalance,
      lastFour
    };
  } catch (error) {
    console.error('Error checking statement status:', error);
    return {
      isProcessed: false,
      hasStartingBalance: false,
      lastFour: statementNumber.length >= 4 ? statementNumber.slice(-4) : statementNumber
    };
  }
}

/**
 * Process a statement via the API
 * 
 * @param statementData Statement data to process
 * @returns API response
 */
export async function processStatementViaApi(statementData: {
  accountId?: number;
  accountCode?: string;
  accountName?: string;
  statementNumber: string;
  statementDate?: string;
  balance?: number;
  isStartingBalance?: boolean;
}): Promise<{
  success: boolean;
  message: string;
  accountId?: number;
  isStartingBalance?: boolean;
  isAlreadyProcessed?: boolean;
  needsAccountCreation?: boolean;
}> {
  try {
    const response = await fetch('/api/statements/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(statementData),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to process statement: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error processing statement via API:', error);
    return {
      success: false,
      message: `Error processing statement: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

import { getBankAccounts, getBankStatements, getRecentReconciliations } from './accounting/bankQueries';

/**
 * Check if a query might be about banking reconciliation topics
 * @param query The user's query text
 */
export function mightBeAboutReconciliation(query: string): boolean {
  const normalizedQuery = query.toLowerCase();
  
  // Reconciliation related terms
  const reconciliationTerms = [
    "reconcile",
    "reconciliation",
    "bank statement",
    "statement balance",
    "bank balance",
    "matching",
    "outstanding check",
    "outstanding deposit",
    "clear transaction",
    "cleared",
    "uncleared",
    "bank feed",
    "bank sync",
    "bank import",
    "statement date",
    "statement ending",
    "unreconciled",
    "in transit",
    "pending"
  ];
  
  return reconciliationTerms.some(term => normalizedQuery.includes(term));
}

/**
 * Find relevant bank accounts based on a query
 * @param query The user's query text
 * @param limit Maximum number of accounts to return
 */
export async function findRelevantBankAccounts(
  query: string,
  limit: number = 5
): Promise<any[]> {
  try {
    const normalizedQuery = query.toLowerCase();
    const accounts = await getBankAccounts();
    
    // Filter accounts whose name or number matches part of the query
    const matchedAccounts = accounts.filter(account => {
      const accountName = account.name.toLowerCase();
      const accountNumber = account.account_number?.toLowerCase() || '';
      const institutionName = account.institution_name?.toLowerCase() || '';
      
      return normalizedQuery.includes(accountName) || 
             accountName.includes(normalizedQuery) ||
             normalizedQuery.includes(accountNumber) ||
             normalizedQuery.includes(institutionName);
    });
    
    // Sort bank accounts by most relevant first
    matchedAccounts.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      
      const aDirectlyMentioned = normalizedQuery.includes(aName);
      const bDirectlyMentioned = normalizedQuery.includes(bName);
      
      if (aDirectlyMentioned && !bDirectlyMentioned) return -1;
      if (!aDirectlyMentioned && bDirectlyMentioned) return 1;
      
      // Secondary sort by recent reconciliation activity
      const aLastReconciled = a.last_reconciled_date ? new Date(a.last_reconciled_date).getTime() : 0;
      const bLastReconciled = b.last_reconciled_date ? new Date(b.last_reconciled_date).getTime() : 0;
      
      return bLastReconciled - aLastReconciled;
    });
    
    return matchedAccounts.slice(0, limit);
  } catch (error) {
    console.error("[ReconciliationUtils] Error finding relevant bank accounts:", error);
    return [];
  }
}

/**
 * Find recent reconciliation sessions
 * @param bankAccountId Optional ID of a specific bank account
 * @param limit Maximum number of reconciliations to return
 */
export async function findRecentReconciliations(
  bankAccountId?: number,
  limit: number = 5
): Promise<any[]> {
  try {
    const recentReconciliations = await getRecentReconciliations(bankAccountId, limit);
    return recentReconciliations;
  } catch (error) {
    console.error("[ReconciliationUtils] Error finding recent reconciliations:", error);
    return [];
  }
}

/**
 * Find relevant bank statements based on a query
 * @param query The user's query text
 * @param bankAccountId Optional bank account ID to filter by
 * @param limit Maximum number of statements to return
 */
export async function findRelevantBankStatements(
  query: string,
  bankAccountId?: number,
  limit: number = 3
): Promise<any[]> {
  try {
    const normalizedQuery = query.toLowerCase();
    
    // Look for date patterns in the query
    const datePattern = /(\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\w+ \d{4}\b|\b\w+ \d{1,2}\b)/gi;
    const dateMatches = normalizedQuery.match(datePattern) || [];
    
    // Look for specific statement mentions
    const isRecentStatement = normalizedQuery.includes('recent') || 
                             normalizedQuery.includes('latest') || 
                             normalizedQuery.includes('last');
    
    const isSpecificDate = dateMatches.length > 0;
    
    // Get bank statements
    const statements = await getBankStatements(bankAccountId);
    
    // Apply filters
    let filteredStatements = statements;
    
    if (isRecentStatement) {
      // Sort by date (most recent first)
      filteredStatements.sort((a, b) => 
        new Date(b.end_date).getTime() - new Date(a.end_date).getTime()
      );
    } else if (isSpecificDate) {
      // Filter statements that include any of the mentioned dates
      filteredStatements = statements.filter(statement => {
        const statementStartDate = new Date(statement.start_date).toLocaleDateString();
        const statementEndDate = new Date(statement.end_date).toLocaleDateString();
        
        return dateMatches.some(date => 
          statementStartDate.includes(date) || statementEndDate.includes(date)
        );
      });
    }
    
    return filteredStatements.slice(0, limit);
  } catch (error) {
    console.error("[ReconciliationUtils] Error finding relevant bank statements:", error);
    return [];
  }
}

/**
 * Find unmatched transactions that may need reconciliation
 * @param bankAccountId ID of the bank account
 * @param limit Maximum number of transactions to return
 */
export async function findUnmatchedTransactions(
  bankAccountId: number,
  limit: number = 10
): Promise<any[]> {
  try {
    // In a real implementation, this would query for transactions that
    // haven't been matched to bank statement imports
    return [];
  } catch (error) {
    console.error("[ReconciliationUtils] Error finding unmatched transactions:", error);
    return [];
  }
}

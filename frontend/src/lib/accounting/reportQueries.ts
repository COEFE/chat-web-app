import { sql } from '@vercel/postgres';

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

export interface IncomeStatementRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

export interface BalanceSheetRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

/**
 * Gets a trial balance for the specified date range
 */
export async function getTrialBalance(
  startDate: string, 
  endDate: string
): Promise<TrialBalanceRow[]> {
  const { rows } = await sql`
    WITH account_balances AS (
      SELECT 
        a.id,
        a.code AS account_code,
        a.name AS account_name,
        a.account_type,
        SUM(COALESCE(jl.debit, 0)) AS total_debits,
        SUM(COALESCE(jl.credit, 0)) AS total_credits
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE 
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
      GROUP BY 
        a.id, a.code, a.name, a.account_type
      UNION ALL
      -- Include accounts with no activity in the period but with balances
      SELECT 
        a.id,
        a.code AS account_code,
        a.name AS account_name,
        a.account_type,
        0 AS total_debits,
        0 AS total_credits
      FROM 
        accounts a
      WHERE 
        a.id NOT IN (
          SELECT DISTINCT jl.account_id 
          FROM journal_lines jl
          JOIN journals j ON jl.journal_id = j.id
          WHERE j.is_posted = TRUE 
            AND j.is_deleted = FALSE
            AND j.date BETWEEN ${startDate} AND ${endDate}
        )
    )
    SELECT 
      account_code AS "accountCode",
      account_name AS "accountName",
      account_type AS "accountType",
      CASE 
        WHEN (total_debits - total_credits) > 0 THEN (total_debits - total_credits)
        ELSE 0
      END AS "debitBalance",
      CASE 
        WHEN (total_credits - total_debits) > 0 THEN (total_credits - total_debits)
        ELSE 0
      END AS "creditBalance"
    FROM 
      account_balances
    WHERE 
      total_debits > 0 OR total_credits > 0 OR account_type IN ('asset', 'liability', 'equity')
    ORDER BY 
      account_code
  `;
  
  return rows as TrialBalanceRow[];
}

/**
 * Gets an income statement for the specified date range
 */
export async function getIncomeStatement(
  startDate: string, 
  endDate: string
): Promise<IncomeStatementRow[]> {
  const { rows } = await sql`
    WITH account_balances AS (
      SELECT 
        a.id,
        a.code AS account_code,
        a.name AS account_name,
        a.account_type,
        SUM(COALESCE(jl.credit, 0)) - SUM(COALESCE(jl.debit, 0)) AS balance
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE 
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
        AND a.account_type IN ('revenue', 'expense')
      GROUP BY 
        a.id, a.code, a.name, a.account_type
    )
    SELECT 
      account_code AS "accountCode",
      account_name AS "accountName",
      account_type AS "accountType",
      CASE 
        WHEN account_type = 'revenue' THEN balance
        ELSE -balance -- Expenses are normally debit balances, so negate for reporting
      END AS "balance",
      FALSE AS "isSubtotal",
      FALSE AS "isTotal"
    FROM 
      account_balances
    WHERE 
      balance <> 0
    ORDER BY 
      account_type DESC, -- Revenue first, then expenses
      account_code
  `;
  
  // Calculate subtotals and net income
  const result: IncomeStatementRow[] = [...rows as IncomeStatementRow[]];
  
  const totalRevenue = rows
    .filter(row => row.accountType === 'revenue')
    .reduce((sum, row) => sum + Number(row.balance), 0);
    
  const totalExpenses = rows
    .filter(row => row.accountType === 'expense')
    .reduce((sum, row) => sum + Number(row.balance), 0);
    
  const netIncome = totalRevenue - totalExpenses;
  
  // Add revenue subtotal
  if (rows.some(row => row.accountType === 'revenue')) {
    result.push({
      accountCode: '',
      accountName: 'Total Revenue',
      accountType: 'revenue',
      balance: totalRevenue,
      isSubtotal: true
    });
  }
  
  // Add expense subtotal
  if (rows.some(row => row.accountType === 'expense')) {
    result.push({
      accountCode: '',
      accountName: 'Total Expenses',
      accountType: 'expense',
      balance: totalExpenses,
      isSubtotal: true
    });
  }
  
  // Add net income
  result.push({
    accountCode: '',
    accountName: 'Net Income',
    accountType: '',
    balance: netIncome,
    isTotal: true
  });
  
  return result;
}

/**
 * Gets a balance sheet as of the specified date
 */
export async function getBalanceSheet(asOfDate: string): Promise<BalanceSheetRow[]> {
  // First, get all accounts that should appear on the balance sheet
  const { rows: accountRows } = await sql`
    SELECT 
      a.id,
      a.code AS account_code,
      a.name AS account_name,
      a.account_type
    FROM 
      accounts a
    WHERE 
      a.account_type IN ('asset', 'liability', 'equity')
    ORDER BY
      a.account_type, a.code
  `;
  
  // Next, get all transactions for these accounts
  const { rows: transactionRows } = await sql`
    SELECT 
      jl.account_id,
      SUM(COALESCE(jl.debit, 0)) AS total_debits,
      SUM(COALESCE(jl.credit, 0)) AS total_credits
    FROM 
      journal_lines jl
    JOIN 
      journals j ON jl.journal_id = j.id
    WHERE 
      j.is_posted = TRUE 
      AND j.is_deleted = FALSE
      AND j.date <= ${asOfDate}
    GROUP BY 
      jl.account_id
  `;
  
  // Calculate net income more explicitly to verify each transaction
  const { rows: revenueRows } = await sql`
    SELECT
      SUM(jl.credit - jl.debit) AS total_revenue
    FROM
      journal_lines jl
    JOIN
      journals j ON jl.journal_id = j.id
    JOIN
      accounts a ON jl.account_id = a.id
    WHERE
      j.is_posted = TRUE
      AND j.is_deleted = FALSE
      AND j.date <= ${asOfDate}
      AND a.account_type = 'revenue'
  `;

  const { rows: expenseRows } = await sql`
    SELECT
      SUM(jl.debit - jl.credit) AS total_expenses
    FROM
      journal_lines jl
    JOIN
      journals j ON jl.journal_id = j.id
    JOIN
      accounts a ON jl.account_id = a.id
    WHERE
      j.is_posted = TRUE
      AND j.is_deleted = FALSE
      AND j.date <= ${asOfDate}
      AND a.account_type = 'expense'
  `;
  
  // Log each transaction for debugging
  const { rows: allTransactions } = await sql`
    SELECT
      j.date,
      j.memo,
      a.name AS account_name,
      a.account_type,
      jl.debit,
      jl.credit
    FROM
      journal_lines jl
    JOIN
      journals j ON jl.journal_id = j.id
    JOIN
      accounts a ON jl.account_id = a.id
    WHERE
      j.is_posted = TRUE
      AND j.is_deleted = FALSE
      AND j.date <= ${asOfDate}
      AND a.account_type IN ('revenue', 'expense')
    ORDER BY
      j.date, j.id, a.account_type
  `;
  
  // Check for any existing retained earnings accounts
  const { rows: existingRetainedEarnings } = await sql`
    SELECT
      SUM(COALESCE(jl.credit, 0) - COALESCE(jl.debit, 0)) AS existing_balance
    FROM
      accounts a
    JOIN
      journal_lines jl ON jl.account_id = a.id
    JOIN
      journals j ON jl.journal_id = j.id
    WHERE
      j.is_posted = TRUE
      AND j.is_deleted = FALSE
      AND j.date <= ${asOfDate}
      AND a.code = '3200' -- Standard retained earnings account
  `;
  
  // Create a transaction map for quick lookup
  const transactionMap = transactionRows.reduce((map, row) => {
    map[row.account_id] = {
      total_debits: Number(row.total_debits),
      total_credits: Number(row.total_credits)
    };
    return map;
  }, {});
  
  // Merge accounts with their balances
  const balanceSheetRows: BalanceSheetRow[] = accountRows.map(account => {
    const transactions = transactionMap[account.id] || { total_debits: 0, total_credits: 0 };
    
    // Calculate balance based on account type
    let balance = 0;
    if (account.account_type === 'asset') {
      balance = transactions.total_debits - transactions.total_credits;
    } else {
      balance = transactions.total_credits - transactions.total_debits;
    }
    
    return {
      accountCode: account.account_code,
      accountName: account.account_name,
      accountType: account.account_type,
      balance,
      isSubtotal: false,
      isTotal: false
    };
  });
  
  // Calculate net income properly
  const totalRevenue = Number(revenueRows[0]?.total_revenue || 0);
  const totalExpenses = Number(expenseRows[0]?.total_expenses || 0);
  const calculatedNetIncome = totalRevenue - totalExpenses;
  
  // Log detailed values for debugging
  console.log('Balance Sheet Net Income Calculation:', {
    totalRevenue,
    totalExpenses,
    calculatedNetIncome,
    transactions: allTransactions,
    asOfDate
  });
  
  // Add current year earnings row with the properly calculated value
  balanceSheetRows.push({
    accountCode: '3999',
    accountName: 'Current Year Earnings',
    accountType: 'equity',
    balance: calculatedNetIncome,
    isSubtotal: false,
    isTotal: false
  });
  
  // Filter out rows with zero balance to keep the report clean
  const filteredRows = balanceSheetRows.filter(row => row.balance !== 0);
  
  // Calculate subtotals and totals
  const result: BalanceSheetRow[] = [...filteredRows];
  
  const totalAssets = filteredRows
    .filter(row => row.accountType === 'asset')
    .reduce((sum, row) => sum + Number(row.balance), 0);
    
  const totalLiabilities = filteredRows
    .filter(row => row.accountType === 'liability')
    .reduce((sum, row) => sum + Number(row.balance), 0);
    
  const totalEquity = filteredRows
    .filter(row => row.accountType === 'equity')
    .reduce((sum, row) => sum + Number(row.balance), 0);
    
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;
  
  // Add asset subtotal
  if (filteredRows.some(row => row.accountType === 'asset')) {
    result.push({
      accountCode: '',
      accountName: 'Total Assets',
      accountType: 'asset',
      balance: totalAssets,
      isSubtotal: true
    });
  }
  
  // Add liability subtotal
  if (filteredRows.some(row => row.accountType === 'liability')) {
    result.push({
      accountCode: '',
      accountName: 'Total Liabilities',
      accountType: 'liability',
      balance: totalLiabilities,
      isSubtotal: true
    });
  }
  
  // Add equity subtotal
  if (filteredRows.some(row => row.accountType === 'equity')) {
    result.push({
      accountCode: '',
      accountName: 'Total Equity',
      accountType: 'equity',
      balance: totalEquity,
      isSubtotal: true
    });
  }
  
  // Add liabilities and equity total
  result.push({
    accountCode: '',
    accountName: 'Total Liabilities and Equity',
    accountType: '',
    balance: totalLiabilitiesAndEquity,
    isTotal: true
  });
  
  return result;
}

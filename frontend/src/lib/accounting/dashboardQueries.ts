import { sql } from '@vercel/postgres';

/**
 * Types for the dashboard data
 */
export interface DashboardData {
  currentPeriodNetIncome: number;
  cashPosition: number;
  topRevenueSources: TopRevenueSource[];
  topExpenses: TopExpense[];
  accountsReceivable: number;
  accountsPayable: number;
  quickRatio: number | null;
  revenueMonthly: MonthlyData[];
  expenseMonthly: MonthlyData[];
}

export interface TopRevenueSource {
  accountName: string;
  accountCode: string;
  amount: number;
  percentage: number;
}

export interface TopExpense {
  accountName: string;
  accountCode: string;
  amount: number;
  percentage: number;
}

export interface MonthlyData {
  month: string;
  amount: number;
}

/**
 * Get current period net income (month to date)
 */
export async function getCurrentPeriodNetIncome(): Promise<number> {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const startDate = firstDayOfMonth.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  // Revenue
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
      AND j.date BETWEEN ${startDate} AND ${endDate}
      AND a.account_type = 'revenue'
  `;

  // Expenses
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
      AND j.date BETWEEN ${startDate} AND ${endDate}
      AND a.account_type = 'expense'
  `;

  const totalRevenue = Number(revenueRows[0]?.total_revenue || 0);
  const totalExpenses = Number(expenseRows[0]?.total_expenses || 0);
  return totalRevenue - totalExpenses;
}

/**
 * Get cash position (sum of all cash and cash equivalent accounts)
 */
export async function getCashPosition(): Promise<number> {
  const { rows } = await sql`
    WITH cash_accounts AS (
      SELECT 
        a.id
      FROM 
        accounts a
      WHERE 
        a.account_type = 'asset'
        AND (
          a.code LIKE '10%' OR -- Cash accounts typically start with 10
          a.name ILIKE '%cash%' OR 
          a.name ILIKE '%bank%'
        )
    ),
    account_balances AS (
      SELECT 
        a.id,
        SUM(COALESCE(jl.debit, 0)) - SUM(COALESCE(jl.credit, 0)) AS balance
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        a.id IN (SELECT id FROM cash_accounts)
        AND (j.is_posted IS NULL OR j.is_posted = TRUE)
        AND (j.is_deleted IS NULL OR j.is_deleted = FALSE)
      GROUP BY 
        a.id
    )
    SELECT 
      COALESCE(SUM(balance), 0) AS cash_position
    FROM 
      account_balances
  `;

  return Number(rows[0]?.cash_position || 0);
}

/**
 * Get top revenue sources
 */
export async function getTopRevenueSources(limit: number = 5): Promise<TopRevenueSource[]> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const startDate = startOfYear.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const { rows } = await sql`
    WITH revenue_by_account AS (
      SELECT 
        a.id,
        a.name AS account_name,
        a.code AS account_code,
        SUM(jl.credit - jl.debit) AS amount
      FROM 
        accounts a
      JOIN 
        journal_lines jl ON a.id = jl.account_id
      JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
        AND a.account_type = 'revenue'
      GROUP BY 
        a.id, a.name, a.code
      HAVING 
        SUM(jl.credit - jl.debit) > 0
    ),
    total_revenue AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM revenue_by_account
    )
    SELECT 
      account_name AS "accountName",
      account_code AS "accountCode",
      amount AS "amount",
      CASE 
        WHEN (SELECT total FROM total_revenue) > 0 
        THEN (amount / (SELECT total FROM total_revenue)) * 100
        ELSE 0
      END AS "percentage"
    FROM 
      revenue_by_account
    ORDER BY 
      amount DESC
    LIMIT ${limit}
  `;

  return rows.map(row => ({
    accountName: row.accountName,
    accountCode: row.accountCode,
    amount: Number(row.amount),
    percentage: Number(row.percentage)
  }));
}

/**
 * Get top expenses
 */
export async function getTopExpenses(limit: number = 5): Promise<TopExpense[]> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const startDate = startOfYear.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const { rows } = await sql`
    WITH expense_by_account AS (
      SELECT 
        a.id,
        a.name AS account_name,
        a.code AS account_code,
        SUM(jl.debit - jl.credit) AS amount
      FROM 
        accounts a
      JOIN 
        journal_lines jl ON a.id = jl.account_id
      JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
        AND a.account_type = 'expense'
      GROUP BY 
        a.id, a.name, a.code
      HAVING 
        SUM(jl.debit - jl.credit) > 0
    ),
    total_expense AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM expense_by_account
    )
    SELECT 
      account_name AS "accountName",
      account_code AS "accountCode",
      amount AS "amount",
      CASE 
        WHEN (SELECT total FROM total_expense) > 0 
        THEN (amount / (SELECT total FROM total_expense)) * 100
        ELSE 0
      END AS "percentage"
    FROM 
      expense_by_account
    ORDER BY 
      amount DESC
    LIMIT ${limit}
  `;

  return rows.map(row => ({
    accountName: row.accountName,
    accountCode: row.accountCode,
    amount: Number(row.amount),
    percentage: Number(row.percentage)
  }));
}

/**
 * Get accounts receivable total
 */
export async function getAccountsReceivable(): Promise<number> {
  const { rows } = await sql`
    WITH ar_accounts AS (
      SELECT 
        a.id
      FROM 
        accounts a
      WHERE 
        a.account_type = 'asset'
        AND (
          a.code LIKE '11%' OR -- A/R accounts typically start with 11
          a.name ILIKE '%receivable%' OR 
          a.name ILIKE '%accounts receivable%'
        )
    ),
    account_balances AS (
      SELECT 
        a.id,
        SUM(COALESCE(jl.debit, 0)) - SUM(COALESCE(jl.credit, 0)) AS balance
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        a.id IN (SELECT id FROM ar_accounts)
        AND (j.is_posted IS NULL OR j.is_posted = TRUE)
        AND (j.is_deleted IS NULL OR j.is_deleted = FALSE)
      GROUP BY 
        a.id
    )
    SELECT 
      COALESCE(SUM(balance), 0) AS accounts_receivable
    FROM 
      account_balances
  `;

  return Number(rows[0]?.accounts_receivable || 0);
}

/**
 * Get accounts payable total
 */
export async function getAccountsPayable(): Promise<number> {
  const { rows } = await sql`
    WITH ap_accounts AS (
      SELECT 
        a.id
      FROM 
        accounts a
      WHERE 
        a.account_type = 'liability'
        AND (
          a.code LIKE '20%' OR -- A/P accounts typically start with 20
          a.name ILIKE '%payable%' OR 
          a.name ILIKE '%accounts payable%'
        )
    ),
    account_balances AS (
      SELECT 
        a.id,
        SUM(COALESCE(jl.credit, 0)) - SUM(COALESCE(jl.debit, 0)) AS balance
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        a.id IN (SELECT id FROM ap_accounts)
        AND (j.is_posted IS NULL OR j.is_posted = TRUE)
        AND (j.is_deleted IS NULL OR j.is_deleted = FALSE)
      GROUP BY 
        a.id
    )
    SELECT 
      COALESCE(SUM(balance), 0) AS accounts_payable
    FROM 
      account_balances
  `;

  return Number(rows[0]?.accounts_payable || 0);
}

/**
 * Calculate quick ratio = (cash + marketable securities + accounts receivable) / current liabilities
 */
export async function getQuickRatio(): Promise<number | null> {
  const cashPosition = await getCashPosition();
  const accountsReceivable = await getAccountsReceivable();
  
  // Get current liabilities
  const { rows } = await sql`
    WITH current_liabilities AS (
      SELECT 
        a.id
      FROM 
        accounts a
      WHERE 
        a.account_type = 'liability'
        AND (
          a.code LIKE '2%' -- Current liabilities typically start with 2
        )
    ),
    liability_balances AS (
      SELECT 
        a.id,
        SUM(COALESCE(jl.credit, 0)) - SUM(COALESCE(jl.debit, 0)) AS balance
      FROM 
        accounts a
      LEFT JOIN 
        journal_lines jl ON a.id = jl.account_id
      LEFT JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        a.id IN (SELECT id FROM current_liabilities)
        AND (j.is_posted IS NULL OR j.is_posted = TRUE)
        AND (j.is_deleted IS NULL OR j.is_deleted = FALSE)
      GROUP BY 
        a.id
    )
    SELECT 
      COALESCE(SUM(balance), 0) AS current_liabilities
    FROM 
      liability_balances
  `;

  const currentLiabilities = Number(rows[0]?.current_liabilities || 0);
  
  if (currentLiabilities === 0) {
    return null; // Avoid division by zero
  }
  
  return (cashPosition + accountsReceivable) / currentLiabilities;
}

/**
 * Get monthly revenue data for the current year
 */
export async function getMonthlyRevenue(): Promise<MonthlyData[]> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const startDate = startOfYear.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const { rows } = await sql`
    WITH RECURSIVE months AS (
      SELECT 1 AS month_num, 'January' AS month_name
      UNION ALL
      SELECT month_num + 1, 
        CASE month_num + 1
          WHEN 2 THEN 'February'
          WHEN 3 THEN 'March'
          WHEN 4 THEN 'April'
          WHEN 5 THEN 'May'
          WHEN 6 THEN 'June'
          WHEN 7 THEN 'July'
          WHEN 8 THEN 'August'
          WHEN 9 THEN 'September'
          WHEN 10 THEN 'October'
          WHEN 11 THEN 'November'
          WHEN 12 THEN 'December'
        END
      FROM months
      WHERE month_num < 12
    ),
    revenue_by_month AS (
      SELECT 
        EXTRACT(MONTH FROM j.date) AS month_num,
        SUM(jl.credit - jl.debit) AS amount
      FROM 
        accounts a
      JOIN 
        journal_lines jl ON a.id = jl.account_id
      JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
        AND a.account_type = 'revenue'
      GROUP BY 
        month_num
    )
    SELECT 
      m.month_name AS "month",
      COALESCE(r.amount, 0) AS "amount"
    FROM 
      months m
    LEFT JOIN 
      revenue_by_month r ON m.month_num = r.month_num
    WHERE 
      m.month_num <= EXTRACT(MONTH FROM CURRENT_DATE)
    ORDER BY 
      m.month_num
  `;

  return rows.map(row => ({
    month: row.month,
    amount: Number(row.amount)
  }));
}

/**
 * Get monthly expense data for the current year
 */
export async function getMonthlyExpenses(): Promise<MonthlyData[]> {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  
  const startDate = startOfYear.toISOString().split('T')[0];
  const endDate = today.toISOString().split('T')[0];

  const { rows } = await sql`
    WITH RECURSIVE months AS (
      SELECT 1 AS month_num, 'January' AS month_name
      UNION ALL
      SELECT month_num + 1, 
        CASE month_num + 1
          WHEN 2 THEN 'February'
          WHEN 3 THEN 'March'
          WHEN 4 THEN 'April'
          WHEN 5 THEN 'May'
          WHEN 6 THEN 'June'
          WHEN 7 THEN 'July'
          WHEN 8 THEN 'August'
          WHEN 9 THEN 'September'
          WHEN 10 THEN 'October'
          WHEN 11 THEN 'November'
          WHEN 12 THEN 'December'
        END
      FROM months
      WHERE month_num < 12
    ),
    expense_by_month AS (
      SELECT 
        EXTRACT(MONTH FROM j.date) AS month_num,
        SUM(jl.debit - jl.credit) AS amount
      FROM 
        accounts a
      JOIN 
        journal_lines jl ON a.id = jl.account_id
      JOIN 
        journals j ON jl.journal_id = j.id
      WHERE 
        j.is_posted = TRUE
        AND j.is_deleted = FALSE
        AND j.date BETWEEN ${startDate} AND ${endDate}
        AND a.account_type = 'expense'
      GROUP BY 
        month_num
    )
    SELECT 
      m.month_name AS "month",
      COALESCE(e.amount, 0) AS "amount"
    FROM 
      months m
    LEFT JOIN 
      expense_by_month e ON m.month_num = e.month_num
    WHERE 
      m.month_num <= EXTRACT(MONTH FROM CURRENT_DATE)
    ORDER BY 
      m.month_num
  `;

  return rows.map(row => ({
    month: row.month,
    amount: Number(row.amount)
  }));
}

/**
 * Get all dashboard data in a single call
 */
export async function getDashboardData(): Promise<DashboardData> {
  const [
    currentPeriodNetIncome,
    cashPosition,
    topRevenueSources,
    topExpenses,
    accountsReceivable,
    accountsPayable,
    quickRatio,
    revenueMonthly,
    expenseMonthly
  ] = await Promise.all([
    getCurrentPeriodNetIncome(),
    getCashPosition(),
    getTopRevenueSources(),
    getTopExpenses(),
    getAccountsReceivable(),
    getAccountsPayable(),
    getQuickRatio(),
    getMonthlyRevenue(),
    getMonthlyExpenses()
  ]);

  return {
    currentPeriodNetIncome,
    cashPosition,
    topRevenueSources,
    topExpenses,
    accountsReceivable,
    accountsPayable,
    quickRatio,
    revenueMonthly,
    expenseMonthly
  };
}

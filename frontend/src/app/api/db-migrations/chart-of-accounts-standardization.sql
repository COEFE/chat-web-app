-- Chart of Accounts Standardization
-- This migration script enhances the chart of accounts with a comprehensive structure

-- Function to insert accounts or update if they already exist
CREATE OR REPLACE FUNCTION upsert_account(
  p_code VARCHAR,
  p_name TEXT,
  p_parent_code VARCHAR,
  p_account_type VARCHAR,
  p_notes TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_parent_id INTEGER;
BEGIN
  -- Get parent ID if parent code provided
  IF p_parent_code IS NOT NULL THEN
    SELECT id INTO v_parent_id FROM accounts WHERE code = p_parent_code;
  ELSE
    v_parent_id := NULL;
  END IF;

  -- Insert or update account
  INSERT INTO accounts (
    code, 
    name, 
    parent_id, 
    account_type, 
    notes, 
    is_custom,
    is_active
  ) VALUES (
    p_code, 
    p_name, 
    v_parent_id, 
    p_account_type, 
    p_notes, 
    FALSE,
    TRUE
  )
  ON CONFLICT (code) DO UPDATE SET
    name = p_name,
    parent_id = v_parent_id,
    account_type = p_account_type,
    notes = p_notes,
    is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ASSETS (1000-1999)
-- Current Assets (1000-1499)
SELECT upsert_account('1000', 'Current Assets', NULL, 'asset', 'Assets expected to be converted to cash within one year');
  -- Cash & Cash Equivalents (1000-1099)
  SELECT upsert_account('1010', 'Cash & Cash Equivalents', '1000', 'asset', 'Cash and highly liquid investments');
    SELECT upsert_account('1011', 'Operating Account', '1010', 'asset', 'Primary business checking account');
    SELECT upsert_account('1012', 'Savings Account', '1010', 'asset', 'Business savings account');
    SELECT upsert_account('1013', 'Petty Cash', '1010', 'asset', 'Small cash fund for minor expenses');
    SELECT upsert_account('1015', 'Money Market', '1010', 'asset', 'Money market funds');
    SELECT upsert_account('1020', 'Undeposited Funds', '1010', 'asset', 'Payments received but not yet deposited');

  -- Accounts Receivable (1100-1199)
  SELECT upsert_account('1100', 'Accounts Receivable', '1000', 'asset', 'Amounts owed by customers');
    SELECT upsert_account('1110', 'Accounts Receivable - Trade', '1100', 'asset', 'Standard receivables from customers');
    SELECT upsert_account('1120', 'Allowance for Doubtful Accounts', '1100', 'asset', 'Estimated uncollectible receivables (contra account)');

  -- Inventory (1200-1299)
  SELECT upsert_account('1200', 'Inventory', '1000', 'asset', 'Goods held for sale');
    SELECT upsert_account('1210', 'Raw Materials', '1200', 'asset', 'Materials not yet in production');
    SELECT upsert_account('1220', 'Work in Process', '1200', 'asset', 'Partially completed goods');
    SELECT upsert_account('1230', 'Finished Goods', '1200', 'asset', 'Completed goods ready for sale');

  -- Prepaid Expenses (1300-1399)
  SELECT upsert_account('1300', 'Prepaid Expenses', '1000', 'asset', 'Expenses paid in advance');
    SELECT upsert_account('1310', 'Prepaid Insurance', '1300', 'asset', 'Insurance premiums paid in advance');
    SELECT upsert_account('1320', 'Prepaid Rent', '1300', 'asset', 'Rent paid in advance');
    SELECT upsert_account('1330', 'Prepaid Subscriptions', '1300', 'asset', 'Subscriptions paid in advance');

  -- Other Current Assets (1400-1499)
  SELECT upsert_account('1400', 'Other Current Assets', '1000', 'asset', 'Other assets expected to be converted to cash within one year');
    SELECT upsert_account('1410', 'Employee Advances', '1400', 'asset', 'Advances paid to employees');
    SELECT upsert_account('1420', 'Notes Receivable - Current', '1400', 'asset', 'Promissory notes due within one year');
    SELECT upsert_account('1430', 'Tax Refunds Receivable', '1400', 'asset', 'Expected tax refunds');

-- Non-Current Assets (1500-1999)
SELECT upsert_account('1500', 'Non-Current Assets', NULL, 'asset', 'Assets not expected to be converted to cash within one year');
  -- Fixed Assets (1500-1599)
  SELECT upsert_account('1510', 'Property, Plant & Equipment', '1500', 'asset', 'Tangible long-term assets');
    SELECT upsert_account('1511', 'Buildings', '1510', 'asset', 'Buildings owned by the business');
    SELECT upsert_account('1512', 'Furniture & Fixtures', '1510', 'asset', 'Office furniture and fixtures');
    SELECT upsert_account('1513', 'Equipment', '1510', 'asset', 'Machinery and equipment');
    SELECT upsert_account('1514', 'Vehicles', '1510', 'asset', 'Company-owned vehicles');
    SELECT upsert_account('1515', 'Leasehold Improvements', '1510', 'asset', 'Improvements to leased property');
    SELECT upsert_account('1516', 'Computer Equipment', '1510', 'asset', 'Computer hardware');

  -- Accumulated Depreciation (1600-1699)
  SELECT upsert_account('1600', 'Accumulated Depreciation', '1500', 'asset', 'Accumulated depreciation of fixed assets (contra account)');
    SELECT upsert_account('1611', 'Accum. Depr. - Buildings', '1600', 'asset', 'Accumulated depreciation on buildings');
    SELECT upsert_account('1612', 'Accum. Depr. - Furniture & Fixtures', '1600', 'asset', 'Accumulated depreciation on furniture');
    SELECT upsert_account('1613', 'Accum. Depr. - Equipment', '1600', 'asset', 'Accumulated depreciation on equipment');
    SELECT upsert_account('1614', 'Accum. Depr. - Vehicles', '1600', 'asset', 'Accumulated depreciation on vehicles');
    SELECT upsert_account('1615', 'Accum. Depr. - Leasehold Improvements', '1600', 'asset', 'Accumulated depreciation on leasehold improvements');
    SELECT upsert_account('1616', 'Accum. Depr. - Computer Equipment', '1600', 'asset', 'Accumulated depreciation on computer equipment');

  -- Intangible Assets (1700-1799)
  SELECT upsert_account('1700', 'Intangible Assets', '1500', 'asset', 'Non-physical assets with long-term value');
    SELECT upsert_account('1710', 'Goodwill', '1700', 'asset', 'Value of business reputation');
    SELECT upsert_account('1720', 'Patents', '1700', 'asset', 'Legal rights to inventions');
    SELECT upsert_account('1730', 'Trademarks', '1700', 'asset', 'Legal rights to branding elements');
    SELECT upsert_account('1740', 'Copyrights', '1700', 'asset', 'Legal rights to original works');
    SELECT upsert_account('1750', 'Software', '1700', 'asset', 'Purchased or developed software');

  -- Long-term Investments (1800-1899)
  SELECT upsert_account('1800', 'Long-term Investments', '1500', 'asset', 'Investments intended to be held for more than one year');
    SELECT upsert_account('1810', 'Investment Securities', '1800', 'asset', 'Stocks, bonds, and other securities');
    SELECT upsert_account('1820', 'Investment in Subsidiaries', '1800', 'asset', 'Investments in subsidiary companies');

  -- Other Non-current Assets (1900-1999)
  SELECT upsert_account('1900', 'Other Non-current Assets', '1500', 'asset', 'Other long-term assets');
    SELECT upsert_account('1910', 'Deposits', '1900', 'asset', 'Long-term security deposits');
    SELECT upsert_account('1920', 'Notes Receivable - Non-current', '1900', 'asset', 'Promissory notes due after one year');

-- LIABILITIES (2000-2999)
-- Current Liabilities (2000-2499)
SELECT upsert_account('2000', 'Current Liabilities', NULL, 'liability', 'Obligations due within one year');
  -- Accounts Payable (2000-2099)
  SELECT upsert_account('2010', 'Accounts Payable', '2000', 'liability', 'Amounts owed to suppliers');
    SELECT upsert_account('2020', 'Accounts Payable - Trade', '2010', 'liability', 'Standard payables to vendors');
    SELECT upsert_account('2030', 'Credit Card Payable', '2010', 'liability', 'Credit card balances');

  -- Short-term Loans (2100-2199)
  SELECT upsert_account('2100', 'Short-term Loans', '2000', 'liability', 'Loans due within one year');
    SELECT upsert_account('2110', 'Line of Credit', '2100', 'liability', 'Business line of credit');
    SELECT upsert_account('2120', 'Current Portion of Long-term Debt', '2100', 'liability', 'Long-term debt due within one year');

  -- Payroll Liabilities (2200-2299)
  SELECT upsert_account('2200', 'Payroll Liabilities', '2000', 'liability', 'Amounts owed for payroll');
    SELECT upsert_account('2210', 'Wages Payable', '2200', 'liability', 'Accrued but unpaid wages');
    SELECT upsert_account('2220', 'FICA Payable', '2200', 'liability', 'Social security and Medicare taxes payable');
    SELECT upsert_account('2230', 'Federal Income Tax Payable', '2200', 'liability', 'Withheld federal income tax');
    SELECT upsert_account('2240', 'State Income Tax Payable', '2200', 'liability', 'Withheld state income tax');
    SELECT upsert_account('2250', 'Health Insurance Payable', '2200', 'liability', 'Employee health insurance withholdings');
    SELECT upsert_account('2260', 'Retirement Contributions Payable', '2200', 'liability', 'Employee retirement withholdings');

  -- Taxes Payable (2300-2399)
  SELECT upsert_account('2300', 'Taxes Payable', '2000', 'liability', 'Taxes owed but not yet paid');
    SELECT upsert_account('2310', 'Sales Tax Payable', '2300', 'liability', 'Collected sales tax due');
    SELECT upsert_account('2320', 'Federal Income Tax Payable - Business', '2300', 'liability', 'Federal income tax owed by the business');
    SELECT upsert_account('2330', 'State Income Tax Payable - Business', '2300', 'liability', 'State income tax owed by the business');
    SELECT upsert_account('2340', 'Property Tax Payable', '2300', 'liability', 'Property taxes due');

  -- Other Current Liabilities (2400-2499)
  SELECT upsert_account('2400', 'Other Current Liabilities', '2000', 'liability', 'Other obligations due within one year');
    SELECT upsert_account('2410', 'Customer Deposits', '2400', 'liability', 'Advance payments from customers');
    SELECT upsert_account('2420', 'Deferred Revenue', '2400', 'liability', 'Revenue received but not yet earned');
    SELECT upsert_account('2430', 'Accrued Expenses', '2400', 'liability', 'Expenses incurred but not yet paid');

-- Non-Current Liabilities (2500-2999)
SELECT upsert_account('2500', 'Non-Current Liabilities', NULL, 'liability', 'Obligations due after one year');
  -- Long-term Loans (2500-2599)
  SELECT upsert_account('2510', 'Long-term Loans', '2500', 'liability', 'Loans due after one year');
    SELECT upsert_account('2520', 'Mortgage Payable', '2510', 'liability', 'Mortgage loans on property');
    SELECT upsert_account('2530', 'Equipment Loans', '2510', 'liability', 'Loans for equipment purchases');

  -- Bonds Payable (2600-2699)
  SELECT upsert_account('2600', 'Bonds Payable', '2500', 'liability', 'Bonds issued by the company');

  -- Other Non-current Liabilities (2700-2999)
  SELECT upsert_account('2700', 'Other Non-current Liabilities', '2500', 'liability', 'Other long-term obligations');
    SELECT upsert_account('2710', 'Deferred Tax Liabilities', '2700', 'liability', 'Future tax liabilities');
    SELECT upsert_account('2720', 'Long-term Deferred Revenue', '2700', 'liability', 'Revenue received but not yet earned after one year');

-- EQUITY (3000-3999)
SELECT upsert_account('3000', 'Equity', NULL, 'equity', 'Ownership interests in the business');
  -- Capital Contributions (3000-3099)
  SELECT upsert_account('3010', 'Owner Equity', '3000', 'equity', 'Owner\'s capital account');
    SELECT upsert_account('3020', 'Capital Stock', '3010', 'equity', 'Value of issued stock');
    SELECT upsert_account('3030', 'Additional Paid-in Capital', '3010', 'equity', 'Premium on stock issuance');

  -- Retained Earnings (3100-3199)
  SELECT upsert_account('3100', 'Retained Earnings', '3000', 'equity', 'Accumulated profits not distributed');
    SELECT upsert_account('3200', 'Retained Earnings - Prior Years', '3100', 'equity', 'Retained earnings from previous years');

  -- Dividends & Distributions (3200-3299)
  SELECT upsert_account('3210', 'Dividends', '3000', 'equity', 'Distributions to shareholders');
    SELECT upsert_account('3220', 'Owner Withdrawals', '3210', 'equity', 'Owner withdrawals from business');

  -- Current Year Earnings (3900-3999)
  SELECT upsert_account('3900', 'Current Year Earnings', '3000', 'equity', 'Net income for the current year');

-- REVENUE (4000-4999)
SELECT upsert_account('4000', 'Revenue', NULL, 'revenue', 'Income from normal business operations');
  -- Primary Product/Service Revenue (4000-4099)
  SELECT upsert_account('4010', 'Product Sales', '4000', 'revenue', 'Revenue from product sales');
    SELECT upsert_account('4020', 'Product Sales - Category A', '4010', 'revenue', 'Revenue from product category A');
    SELECT upsert_account('4030', 'Product Sales - Category B', '4010', 'revenue', 'Revenue from product category B');
  
  SELECT upsert_account('4100', 'Service Revenue', '4000', 'revenue', 'Revenue from services');
    SELECT upsert_account('4110', 'Service Revenue - Type A', '4100', 'revenue', 'Revenue from service type A');
    SELECT upsert_account('4120', 'Service Revenue - Type B', '4100', 'revenue', 'Revenue from service type B');

  -- Other Income (4900-4999)
  SELECT upsert_account('4900', 'Other Income', '4000', 'revenue', 'Income from sources other than primary operations');
    SELECT upsert_account('4910', 'Interest Income', '4900', 'revenue', 'Income from interest');
    SELECT upsert_account('4920', 'Rental Income', '4900', 'revenue', 'Income from property rentals');
    SELECT upsert_account('4930', 'Gain on Sale of Assets', '4900', 'revenue', 'Gains from selling assets above book value');

-- COST OF GOODS SOLD (5000-5999)
SELECT upsert_account('5000', 'Cost of Goods Sold', NULL, 'expense', 'Direct costs of producing goods and services');
  -- Materials & Direct Costs (5000-5099)
  SELECT upsert_account('5010', 'Materials Cost', '5000', 'expense', 'Cost of materials used in production');
    SELECT upsert_account('5020', 'Purchase Discounts', '5010', 'expense', 'Discounts received on purchases');
    SELECT upsert_account('5030', 'Freight In', '5010', 'expense', 'Shipping costs for incoming materials');

  -- Direct Labor (5100-5199)
  SELECT upsert_account('5100', 'Direct Labor', '5000', 'expense', 'Labor costs directly related to production');
    SELECT upsert_account('5110', 'Production Wages', '5100', 'expense', 'Wages for production employees');
    SELECT upsert_account('5120', 'Production Benefits', '5100', 'expense', 'Benefits for production employees');

  -- Other COGS (5900-5999)
  SELECT upsert_account('5900', 'Other COGS', '5000', 'expense', 'Other direct costs');
    SELECT upsert_account('5910', 'Manufacturing Overhead', '5900', 'expense', 'Indirect production costs');
    SELECT upsert_account('5920', 'Inventory Adjustments', '5900', 'expense', 'Write-downs and adjustments to inventory');

-- OPERATING EXPENSES (6000-6999)
SELECT upsert_account('6000', 'Operating Expenses', NULL, 'expense', 'Expenses from normal business operations');
  -- Rent & Occupancy (6000-6099)
  SELECT upsert_account('6010', 'Rent & Occupancy', '6000', 'expense', 'Costs related to business premises');
    SELECT upsert_account('6020', 'Rent Expense', '6010', 'expense', 'Rent payments for business locations');
    SELECT upsert_account('6030', 'Property Taxes', '6010', 'expense', 'Taxes on business property');
    SELECT upsert_account('6040', 'Maintenance & Repairs', '6010', 'expense', 'Building maintenance and repairs');

  -- Utilities (6100-6199)
  SELECT upsert_account('6100', 'Utilities', '6000', 'expense', 'Utility expenses');
    SELECT upsert_account('6110', 'Electricity', '6100', 'expense', 'Electricity bills');
    SELECT upsert_account('6120', 'Water & Sewer', '6100', 'expense', 'Water and sewer bills');
    SELECT upsert_account('6130', 'Gas', '6100', 'expense', 'Natural gas bills');
    SELECT upsert_account('6140', 'Internet & Telecommunications', '6100', 'expense', 'Internet and phone services');

  -- Payroll & Benefits (6200-6299)
  SELECT upsert_account('6200', 'Payroll & Benefits', '6000', 'expense', 'Non-production employee expenses');
    SELECT upsert_account('6210', 'Salaries & Wages', '6200', 'expense', 'Salaries for administrative staff');
    SELECT upsert_account('6220', 'Payroll Taxes', '6200', 'expense', 'Employer portion of payroll taxes');
    SELECT upsert_account('6230', 'Employee Benefits', '6200', 'expense', 'Health insurance and other benefits');
    SELECT upsert_account('6240', 'Retirement Plan Contributions', '6200', 'expense', 'Employer 401k/retirement contributions');

  -- Office Expenses (6300-6399)
  SELECT upsert_account('6300', 'Office Expenses', '6000', 'expense', 'Office-related expenses');
    SELECT upsert_account('6310', 'Office Supplies', '6300', 'expense', 'Paper, pens, and other supplies');
    SELECT upsert_account('6320', 'Postage & Shipping', '6300', 'expense', 'Mailing and shipping costs');
    SELECT upsert_account('6330', 'Printing & Reproduction', '6300', 'expense', 'Printing services');
    SELECT upsert_account('6340', 'Software Subscriptions', '6300', 'expense', 'Software and SaaS expenses');

  -- Marketing & Advertising (6400-6499)
  SELECT upsert_account('6400', 'Marketing & Advertising', '6000', 'expense', 'Promotion and advertising expenses');
    SELECT upsert_account('6410', 'Advertising', '6400', 'expense', 'Traditional advertising costs');
    SELECT upsert_account('6420', 'Digital Marketing', '6400', 'expense', 'Online marketing expenses');
    SELECT upsert_account('6430', 'Public Relations', '6400', 'expense', 'PR and media relations');
    SELECT upsert_account('6440', 'Marketing Materials', '6400', 'expense', 'Brochures, cards, and promotional items');

  -- Professional Services (6500-6599)
  SELECT upsert_account('6500', 'Professional Services', '6000', 'expense', 'Professional consulting fees');
    SELECT upsert_account('6510', 'Legal Fees', '6500', 'expense', 'Attorney fees');
    SELECT upsert_account('6520', 'Accounting Fees', '6500', 'expense', 'Accountant and bookkeeper fees');
    SELECT upsert_account('6530', 'Consulting Fees', '6500', 'expense', 'Business consultant fees');
    SELECT upsert_account('6540', 'IT Services', '6500', 'expense', 'Technology support services');

  -- Travel & Entertainment (6600-6699)
  SELECT upsert_account('6600', 'Travel & Entertainment', '6000', 'expense', 'Business travel and entertainment');
    SELECT upsert_account('6610', 'Travel - Transportation', '6600', 'expense', 'Airfare, rail, and other transportation');
    SELECT upsert_account('6620', 'Travel - Lodging', '6600', 'expense', 'Hotel and accommodation');
    SELECT upsert_account('6630', 'Travel - Meals', '6600', 'expense', 'Business meals while traveling');
    SELECT upsert_account('6640', 'Entertainment', '6600', 'expense', 'Client entertainment expenses');

  -- Depreciation & Amortization (6700-6799)
  SELECT upsert_account('6700', 'Depreciation & Amortization', '6000', 'expense', 'Allocation of asset costs over useful life');
    SELECT upsert_account('6710', 'Depreciation Expense', '6700', 'expense', 'Depreciation of tangible assets');
    SELECT upsert_account('6720', 'Amortization Expense', '6700', 'expense', 'Amortization of intangible assets');

  -- Insurance (6800-6899)
  SELECT upsert_account('6800', 'Insurance', '6000', 'expense', 'Business insurance expenses');
    SELECT upsert_account('6810', 'Liability Insurance', '6800', 'expense', 'General liability insurance');
    SELECT upsert_account('6820', 'Property Insurance', '6800', 'expense', 'Insurance for business property');
    SELECT upsert_account('6830', 'Workers Compensation', '6800', 'expense', 'Workers compensation insurance');
    SELECT upsert_account('6840', 'Professional Liability Insurance', '6800', 'expense', 'E&O and professional liability');

  -- Miscellaneous Expenses (6900-6999)
  SELECT upsert_account('6900', 'Miscellaneous Expenses', '6000', 'expense', 'Expenses not otherwise categorized');
    SELECT upsert_account('6910', 'Bank Charges', '6900', 'expense', 'Fees charged by banks');
    SELECT upsert_account('6920', 'Interest Expense', '6900', 'expense', 'Interest on loans and credit');
    SELECT upsert_account('6930', 'Dues & Subscriptions', '6900', 'expense', 'Membership dues and publications');
    SELECT upsert_account('6940', 'Licenses & Permits', '6900', 'expense', 'Business licenses and permits');
    SELECT upsert_account('6950', 'Bad Debt Expense', '6900', 'expense', 'Uncollectible accounts expense');
    SELECT upsert_account('6960', 'Charitable Contributions', '6900', 'expense', 'Donations to charitable organizations');

-- Drop the function when done
DROP FUNCTION upsert_account;

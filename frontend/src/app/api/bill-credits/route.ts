import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { BillCredit, BillCreditLine } from '@/lib/accounting/billCreditTypes';
import { sql } from '@vercel/postgres';

// Helper function to create tables if they don't exist
async function createTablesIfNotExist(userId: string) {
  try {
    // Create bill_credits table
    await query(`
      CREATE TABLE IF NOT EXISTS bill_credits (
        id SERIAL PRIMARY KEY,
        vendor_id INTEGER REFERENCES vendors(id) ON DELETE CASCADE,
        credit_number VARCHAR(100),
        credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE,
        total_amount NUMERIC(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'Draft',
        terms VARCHAR(100),
        memo TEXT,
        ap_account_id INTEGER REFERENCES accounts(id),
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create bill_credit_lines table
    await query(`
      CREATE TABLE IF NOT EXISTS bill_credit_lines (
        id SERIAL PRIMARY KEY,
        bill_credit_id INTEGER REFERENCES bill_credits(id) ON DELETE CASCADE,
        expense_account_id INTEGER REFERENCES accounts(id),
        description TEXT,
        quantity NUMERIC(15, 2) NOT NULL,
        unit_price NUMERIC(15, 2) NOT NULL,
        amount NUMERIC(15, 2) NOT NULL,
        category VARCHAR(100),
        location VARCHAR(100),
        funder VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credits_vendor_id ON bill_credits(vendor_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credits_user_id ON bill_credits(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credit_lines_bill_credit_id ON bill_credit_lines(bill_credit_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_bill_credit_lines_expense_account_id ON bill_credit_lines(expense_account_id)`);
    
    console.log(`Tables created for user ${userId}`);
    return true;
  } catch (err) {
    console.error('Error creating tables:', err);
    return false;
  }
}

// Helper function to create journal entry for bill credit
async function createJournalEntryForBillCredit(
  billCreditId: number, 
  billCredit: any, 
  lines: BillCreditLine[], 
  userId: string
): Promise<boolean> {
  try {
    console.log(`[Bill Credit Journal] Creating journal entry for bill credit ${billCreditId}`);
    
    // Get the date column name (transaction_date or date) used in the journals table
    const dateColumnCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
    `;
    
    const dateColumnName = dateColumnCheck.rows[0].has_transaction_date ? 'transaction_date' : 'date';
    console.log(`[Bill Credit Journal] Using ${dateColumnName} for journal date column`);
    
    // Check all the columns that may or may not exist in the journals table
    const columnCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'source') as has_source,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'user_id') as has_user_id
    `;
    
    const schema = columnCheck.rows[0];
    console.log(`[Bill Credit Journal] Schema check result:`, schema);
    
    // Get valid journal types from the journal_types table
    let journalType = 'GJ'; // Default to General Journal
    try {
      // First check if the journal_types table exists
      const typesTableCheck = await sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'journal_types'
        ) as has_journal_types;
      `;
      
      if (typesTableCheck.rows[0].has_journal_types) {
        // Fetch all valid journal types for logging
        const typesResult = await sql`SELECT code, name FROM journal_types ORDER BY code`;
        console.log(`[Bill Credit Journal] Available journal types:`, typesResult.rows);
        
        // Try to find a bill credit or AP related journal type
        const creditTypes = typesResult.rows.filter(t => 
          t.code.includes('BC') || 
          t.code.includes('CR') || 
          t.name.toLowerCase().includes('credit') || 
          t.name.toLowerCase().includes('bill credit')
        );
        
        if (creditTypes.length > 0) {
          // Use the first credit related journal type found
          journalType = creditTypes[0].code;
          console.log(`[Bill Credit Journal] Selected journal type: ${journalType} (${creditTypes[0].name})`);
        } else {
          // Try to find AP related types
          const apTypes = typesResult.rows.filter(t => 
            t.code.includes('AP') || 
            t.name.toLowerCase().includes('payable')
          );
          
          if (apTypes.length > 0) {
            journalType = apTypes[0].code;
            console.log(`[Bill Credit Journal] Using AP journal type: ${journalType} (${apTypes[0].name})`);
          } else if (typesResult.rows.length > 0) {
            // Or just use the first available type
            journalType = typesResult.rows[0].code;
            console.log(`[Bill Credit Journal] Using first available journal type: ${journalType} (${typesResult.rows[0].name})`);
          }
        }
      } else {
        console.log(`[Bill Credit Journal] journal_types table doesn't exist, using default type: ${journalType}`);
      }
    } catch (err) {
      console.error(`[Bill Credit Journal] Error fetching journal types:`, err);
      console.log(`[Bill Credit Journal] Falling back to default journal type: ${journalType}`);
    }
    
    // Get next journal number if that column exists
    let journalNumber = null;
    try {
      if (schema.has_journal_number) {
        // Get the latest journal_number and increment it
        const lastJournalResult = await sql`
          SELECT MAX(CAST(SUBSTRING(journal_number FROM '[0-9]+') AS INTEGER)) as last_num 
          FROM journals
        `;
        
        const lastNum = lastJournalResult.rows[0].last_num || 0;
        journalNumber = `J-${(lastNum + 1).toString().padStart(5, '0')}`;
        console.log(`[Bill Credit Journal] Generated journal number: ${journalNumber}`);
      }
    } catch (numErr) {
      console.error(`[Bill Credit Journal] Error generating journal number:`, numErr);
      // Continue without journal number
    }
    
    // Start a transaction for creating the journal entry
    await sql.query('BEGIN');
    
    try {
      // Build the column list and values dynamically based on what columns exist
      let columnList = [];
      let valuePlaceholders = [];
      const params = [];
      let paramIndex = 1;
      
      // Add journal_number if it exists and we have a value
      if (journalNumber && schema.has_journal_number) {
        columnList.push('journal_number');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push(journalNumber);
      }
      
      // These columns should always exist
      columnList.push('journal_type');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(journalType);
      
      columnList.push(dateColumnName);
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(billCredit.credit_date);
      
      columnList.push('memo');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(`Bill Credit #${billCredit.credit_number || billCreditId.toString()} - ${billCredit.vendor_name || 'Vendor'}`);
      
      // Only add source if the column exists
      if (schema.has_source) {
        columnList.push('source');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push('bill-credits');
      }
      
      // Only add reference_number if the column exists
      if (schema.has_reference_number) {
        columnList.push('reference_number');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push(billCreditId.toString()); 
      }
      
      // These columns should always exist
      columnList.push('is_posted');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(true);
      
      columnList.push('created_by');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(userId);
      
      // Add user_id if the column exists
      if (schema.has_user_id) {
        columnList.push('user_id');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push(userId);
      }
      
      // Build the final query
      const journalInsertQuery = `
        INSERT INTO journals (
          ${columnList.join(', ')}
        ) 
        VALUES (
          ${valuePlaceholders.join(', ')}
        )
        RETURNING id
      `;
      
      console.log(`[Bill Credit Journal] SQL: ${journalInsertQuery}`);
      console.log(`[Bill Credit Journal] Params: ${params.join(', ')}`);
      
      const journalResult = await sql.query(journalInsertQuery, params);
      const journalId = journalResult.rows[0].id;
      console.log(`[Bill Credit Journal] Created journal header with ID: ${journalId}`);
      
      // Check journal_lines table columns
      const journalLinesColumnsCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'journal_lines' 
        ORDER BY ordinal_position
      `;
      
      const journalLinesColumns = journalLinesColumnsCheck.rows.map(r => r.column_name);
      console.log(`[Bill Credit Journal] Journal lines columns:`, journalLinesColumns);
      
      // Check if specific columns exist
      const hasLineNumber = journalLinesColumns.includes('line_number');
      const hasUserId = journalLinesColumns.includes('user_id');
      
      // Calculate the total amount
      const totalAmount = parseFloat(typeof billCredit.total_amount === 'string' ? billCredit.total_amount : billCredit.total_amount.toString());
      
      // For a bill credit, we need to reverse the normal bill entry:
      // - Debit A/P account (reduces liability)
      // - Credit expense accounts (reduces expenses)
      
      // First add the A/P account debit line
      const apLineColumns = ['journal_id', 'account_id', 'description', 'debit', 'credit'];
      const apLineValues = [journalId, billCredit.ap_account_id, `Bill Credit #${billCredit.credit_number || billCreditId.toString()} - ${billCredit.vendor_name || 'Vendor'}`, totalAmount, 0];
      let apLineParams = [...apLineValues];
      
      if (hasLineNumber) {
        apLineColumns.push('line_number');
        apLineParams.push(1);
      }
      if (hasUserId) {
        apLineColumns.push('user_id');
        apLineParams.push(userId);
      }
      
      const apLineQuery = `
        INSERT INTO journal_lines (${apLineColumns.join(', ')})
        VALUES (${apLineColumns.map((_, i) => `$${i + 1}`).join(', ')})
      `;
      
      await sql.query(apLineQuery, apLineParams);
      console.log(`[Bill Credit Journal] Created A/P debit line: $${totalAmount}`);
      
      // Add expense account credit lines
      let lineNumber = 2;
      
      for (const line of lines) {
        const lineAmount = parseFloat(line.amount.toString());
        const expenseLineColumns = ['journal_id', 'account_id', 'description', 'debit', 'credit'];
        const expenseLineValues = [
          journalId, 
          parseInt(line.expense_account_id.toString()), 
          line.description || `Bill Credit #${billCredit.credit_number || billCreditId.toString()} expense`, 
          0, 
          lineAmount
        ];
        let expenseLineParams = [...expenseLineValues];
        
        if (hasLineNumber) {
          expenseLineColumns.push('line_number');
          expenseLineParams.push(lineNumber++);
        }
        if (hasUserId) {
          expenseLineColumns.push('user_id');
          expenseLineParams.push(userId);
        }
        
        // Add optional fields if they exist in the schema and have values
        if (journalLinesColumns.includes('category') && line.category) {
          expenseLineColumns.push('category');
          expenseLineParams.push(line.category);
        }
        if (journalLinesColumns.includes('location') && line.location) {
          expenseLineColumns.push('location');
          expenseLineParams.push(line.location);
        }
        if (journalLinesColumns.includes('funder') && line.funder) {
          expenseLineColumns.push('funder');
          expenseLineParams.push(line.funder);
        }
        
        const expenseLineQuery = `
          INSERT INTO journal_lines (${expenseLineColumns.join(', ')})
          VALUES (${expenseLineColumns.map((_, i) => `$${i + 1}`).join(', ')})
        `;
        
        await sql.query(expenseLineQuery, expenseLineParams);
        console.log(`[Bill Credit Journal] Created expense credit line: $${lineAmount} for account ${line.expense_account_id}`);
      }
      
      // Commit the transaction
      await sql.query('COMMIT');
      console.log(`[Bill Credit Journal] Journal ${journalId} created successfully for bill credit.`);
      return true;
      
    } catch (error) {
      await sql.query('ROLLBACK');
      throw error;
    }
    
  } catch (error) {
    console.error('[Bill Credit Journal] Error creating journal entry:', error);
    return false;
  }
}

// GET endpoint for fetching bill credits
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const userId = auth.userId;
    const searchParams = request.nextUrl.searchParams;
    
    // Check if we're just requesting statuses
    if (searchParams.get('statuses') === 'true') {
      const statusesResult = await query(
        'SELECT DISTINCT status FROM bill_credits WHERE user_id = $1 ORDER BY status',
        [userId]
      );
      
      const statuses = statusesResult.rows.map((row: { status: string }) => row.status);
      return NextResponse.json(statuses);
    }
    
    // Handle pagination
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    
    // Handle filters
    const vendorId = searchParams.get('vendor_id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    
    // Build the query and parameters
    let whereConditions = ['bc.user_id = $1'];
    let queryParams: any[] = [userId];
    let paramIndex = 2;
    
    if (vendorId) {
      whereConditions.push(`bc.vendor_id = $${paramIndex}`);
      queryParams.push(parseInt(vendorId));
      paramIndex++;
    }
    
    if (status) {
      whereConditions.push(`bc.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    if (startDate) {
      whereConditions.push(`bc.credit_date >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereConditions.push(`bc.credit_date <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count for pagination
    const countResult = await query(
      `SELECT COUNT(*) FROM bill_credits bc WHERE ${whereClause}`,
      queryParams
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Get bill credits with vendor names
    const billCreditsResult = await query(
      `SELECT 
        bc.*, 
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bill_credits bc
      LEFT JOIN vendors v ON bc.vendor_id = v.id
      LEFT JOIN accounts a ON bc.ap_account_id = a.id
      WHERE ${whereClause}
      ORDER BY bc.credit_date DESC, bc.id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...queryParams, limit, offset]
    );
    
    return NextResponse.json({
      billCredits: billCreditsResult.rows,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages
      }
    });
  } catch (err: any) {
    console.error('[bill-credits/GET] Error:', err);
    
    // Check if the error is related to missing tables
    if (err.message && err.message.includes('relation "bill_credits" does not exist')) {
      // Get authentication info from the original try block
      try {
        // Re-authenticate to get userId
        const authResult = await authenticateRequest(request);
        if (authResult.error) {
          return authResult.error;
        }
        
        const userId = authResult.userId;
        const tablesCreated = await createTablesIfNotExist(userId);
        
        if (tablesCreated) {
          // If tables were created successfully, retry the original request
          try {
            // Get the search params again
            const searchParamsRetry = request.nextUrl.searchParams;
            
            // Check if we're just requesting statuses
            if (searchParamsRetry.get('statuses') === 'true') {
              const statusesResult = await query(
                'SELECT DISTINCT status FROM bill_credits WHERE user_id = $1 ORDER BY status',
                [userId]
              );
              
              const statuses = statusesResult.rows.map((row: { status: string }) => row.status);
              return NextResponse.json(statuses);
            }
            
            // Get pagination params again
            const pageRetry = parseInt(searchParamsRetry.get('page') || '1');
            const limitRetry = parseInt(searchParamsRetry.get('limit') || '20');
            
            // For regular requests, return empty results with pagination
            return NextResponse.json({
              billCredits: [],
              pagination: {
                page: pageRetry,
                limit: limitRetry,
                totalItems: 0,
                totalPages: 0
              }
            });
          } catch (retryErr: any) {
            console.error('[bill-credits/GET] Error after table creation:', retryErr);
            return NextResponse.json({ error: retryErr.message || 'Error after table creation' }, { status: 500 });
          }
        }
      } catch (authErr: any) {
        console.error('[bill-credits/GET] Authentication error during table creation:', authErr);
        return NextResponse.json({ error: 'Authentication error during table creation' }, { status: 500 });
      }
    }
    
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// POST endpoint for creating a new bill credit
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const userId = auth.userId;
    const { bill, lines } = await request.json();
    
    // Validate required fields
    if (!bill || !bill.vendor_id || !bill.credit_date || !bill.ap_account_id) {
      return NextResponse.json({ 
        error: 'Missing required fields: vendor_id, credit_date, ap_account_id' 
      }, { status: 400 });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ 
        error: 'At least one line item is required' 
      }, { status: 400 });
    }
    
    // Create the bill credit
    const billCreditData: BillCredit = {
      ...bill,
      user_id: userId
    };
    
    const billCreditResult = await query(
      `INSERT INTO bill_credits (
        vendor_id, 
        credit_number, 
        credit_date, 
        due_date, 
        total_amount, 
        status, 
        terms, 
        memo, 
        ap_account_id, 
        user_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
      ) RETURNING *`,
      [
        billCreditData.vendor_id, 
        billCreditData.credit_number || null, 
        billCreditData.credit_date, 
        billCreditData.due_date || null, 
        billCreditData.total_amount, 
        billCreditData.status || 'Draft', 
        billCreditData.terms || null, 
        billCreditData.memo || null, 
        billCreditData.ap_account_id, 
        userId
      ]
    );
    
    const newBillCredit = billCreditResult.rows[0];
    
    // Create the line items
    const lineItems: BillCreditLine[] = lines.map(line => ({
      ...line,
      bill_credit_id: newBillCredit.id
    }));
    
    for (const line of lineItems) {
      await query(
        `INSERT INTO bill_credit_lines (
          bill_credit_id, 
          expense_account_id, 
          description, 
          quantity, 
          unit_price, 
          amount, 
          category, 
          location, 
          funder
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9
        )`,
        [
          line.bill_credit_id, 
          line.expense_account_id, 
          line.description || null, 
          line.quantity, 
          line.unit_price, 
          line.amount, 
          line.category || null, 
          line.location || null, 
          line.funder || null
        ]
      );
    }
    
    // Create journal entry for bill credit
    await createJournalEntryForBillCredit(newBillCredit.id, newBillCredit, lineItems, userId);
    
    // Get the complete bill credit with lines
    const completeBillCreditResult = await query(
      `SELECT 
        bc.*, 
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bill_credits bc
      LEFT JOIN vendors v ON bc.vendor_id = v.id
      LEFT JOIN accounts a ON bc.ap_account_id = a.id
      WHERE bc.id = $1`,
      [newBillCredit.id]
    );
    
    const billCreditLines = await query(
      `SELECT 
        bcl.*, 
        a.name as expense_account_name
      FROM bill_credit_lines bcl
      LEFT JOIN accounts a ON bcl.expense_account_id = a.id
      WHERE bcl.bill_credit_id = $1`,
      [newBillCredit.id]
    );
    
    const completeBillCredit = {
      ...completeBillCreditResult.rows[0],
      lines: billCreditLines.rows
    };
    
    return NextResponse.json(completeBillCredit);
  } catch (err: any) {
    console.error('[bill-credits/POST] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

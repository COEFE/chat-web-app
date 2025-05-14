import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { 
  getBills, 
  getBill, 
  createBill, 
  getBillStatuses,
  Bill,
  BillLine
} from '@/lib/accounting/billQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';
import { sql } from '@vercel/postgres';
import { getJournalDateColumn } from '@/lib/accounting/journalColumnUtils';

// Helper function to create a journal entry for a bill
async function createJournalEntryForBill(
  billId: number, 
  bill: any, 
  lines: BillLine[], 
  userId: string
): Promise<boolean> {
  // Only create journal entries for bills with Open status
  if (bill.status !== 'Open') {
    console.log(`[Bill Journal] Skipping journal entry creation for bill ${billId} with status ${bill.status}`);
    return false;
  }
  try {
    console.log(`[Bill Journal] Creating journal entry for bill ${billId} with status ${bill.status}`);
    
    // Get the date column name (transaction_date or date) used in the journals table
    const dateColumnName = await getJournalDateColumn();
    console.log(`[Bill Journal] Using ${dateColumnName} for journal date column`);
    
    // Check all the columns that may or may not exist in the journals table
    const columnCheck = await sql`
      SELECT 
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_number') as has_journal_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'reference_number') as has_reference_number,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'source') as has_source
    `;
    
    const schema = columnCheck.rows[0];
    console.log(`[Bill Journal] Schema check result:`, schema);
    
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
        console.log(`[Bill Journal] Available journal types:`, typesResult.rows);
        
        // Try to find a bill or AP related journal type
        const apTypes = typesResult.rows.filter(t => 
          t.code.includes('AP') || 
          t.code.includes('BL') || 
          t.name.toLowerCase().includes('bill') || 
          t.name.toLowerCase().includes('payable')
        );
        
        if (apTypes.length > 0) {
          // Use the first AP/Bill related journal type found
          journalType = apTypes[0].code;
          console.log(`[Bill Journal] Selected journal type: ${journalType} (${apTypes[0].name})`);
        } else if (typesResult.rows.length > 0) {
          // Or just use the first available type
          journalType = typesResult.rows[0].code;
          console.log(`[Bill Journal] Using first available journal type: ${journalType} (${typesResult.rows[0].name})`);
        }
      } else {
        console.log(`[Bill Journal] journal_types table doesn't exist, using default type: ${journalType}`);
      }
    } catch (err) {
      console.error(`[Bill Journal] Error fetching journal types:`, err);
      console.log(`[Bill Journal] Falling back to default journal type: ${journalType}`);
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
        console.log(`[Bill Journal] Generated journal number: ${journalNumber}`);
      }
    } catch (numErr) {
      console.error(`[Bill Journal] Error generating journal number:`, numErr);
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
      params.push(journalType); // Using a valid journal type code from the database
      
      columnList.push(dateColumnName);
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(bill.bill_date); // transaction_date or date
      
      columnList.push('memo');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(`Bill #${bill.bill_number || billId} - ${bill.vendor_name || 'Vendor'}`);
      
      // Only add source if the column exists
      if (schema.has_source) {
        columnList.push('source');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push('bills');
      }
      
      // Only add reference_number if the column exists
      if (schema.has_reference_number) {
        columnList.push('reference_number');
        valuePlaceholders.push(`$${paramIndex++}`);
        params.push(billId.toString());
      }
      
      // These columns should always exist
      columnList.push('is_posted');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(true);
      
      columnList.push('created_by');
      valuePlaceholders.push(`$${paramIndex++}`);
      params.push(userId);
      
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
      
      console.log(`[Bill Journal] SQL: ${journalInsertQuery}`);
      console.log(`[Bill Journal] Params: ${params.join(', ')}`);
      
      const journalResult = await sql.query(journalInsertQuery, params);
      const journalId = journalResult.rows[0].id;
      console.log(`[Bill Journal] Created journal header with ID: ${journalId}`);
      
      // Check journal_lines table columns
      const journalLinesColumnsCheck = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'journal_lines' 
        ORDER BY ordinal_position
      `;
      
      const journalLinesColumns = journalLinesColumnsCheck.rows.map(r => r.column_name);
      console.log(`[Bill Journal] Journal lines columns:`, journalLinesColumns);
      
      // Check if specific columns exist
      const hasLineNumber = journalLinesColumns.includes('line_number');
      
      // Calculate the total amount
      const totalAmount = parseFloat(typeof bill.total_amount === 'string' ? bill.total_amount : bill.total_amount.toString());
      
      // First add the A/P account credit line
      const apLine = {
        account_id: bill.ap_account_id,
        description: `Bill #${bill.bill_number || billId} - ${bill.vendor_name || 'Vendor'}`,
        debit: 0,
        credit: totalAmount
      };
      if (hasLineNumber) {
        (apLine as any).line_number = 1;
      }
      
      // Add expense account debit lines
      const expenseLines = [];
      let lineNumber = 2;
      
      for (const line of lines) {
        const lineAmount = parseFloat(line.amount);
        const expenseLine = {
          account_id: parseInt(line.expense_account_id as string),
          description: line.description || `Bill #${bill.bill_number || billId} expense`,
          debit: lineAmount,
          credit: 0
        };
        
        // Only add optional fields if they exist in the schema
        if (hasLineNumber) {
          (expenseLine as any).line_number = lineNumber++;
        }
        if (journalLinesColumns.includes('category')) {
          (expenseLine as any).category = line.category || null;
        }
        if (journalLinesColumns.includes('location')) {
          (expenseLine as any).location = line.location || null;
        }
        if (journalLinesColumns.includes('vendor')) {
          (expenseLine as any).vendor = bill.vendor_name || null;
        }
        if (journalLinesColumns.includes('funder')) {
          (expenseLine as any).funder = line.funder || null;
        }
        
        expenseLines.push(expenseLine);
      }
      
      // Insert all journal lines
      // Create dynamic SQL for the journal lines insertion
      console.log(`[Bill Journal] Inserting AP line:`, apLine);
      
      // First insert the AP line
      try {
        // Build column list and values list dynamically based on available fields
        const apColumnsList = ['journal_id', 'account_id', 'description', 'debit', 'credit'];
        const apValuesList = [journalId, apLine.account_id, apLine.description, apLine.debit, apLine.credit];
        
        // Add optional fields if they exist
        if (hasLineNumber) {
          apColumnsList.push('line_number');
          apValuesList.push((apLine as any).line_number);
        }
        
        // Build and execute the SQL query
        const apInsertQuery = `
          INSERT INTO journal_lines (${apColumnsList.join(', ')})
          VALUES (${apColumnsList.map((_, i) => `$${i + 1}`).join(', ')})
        `;
        
        console.log(`[Bill Journal] AP line insert query:`, apInsertQuery);
        await sql.query(apInsertQuery, apValuesList);
        console.log(`[Bill Journal] Successfully inserted AP line`);
      } catch (apLineError) {
        console.error(`[Bill Journal] Error inserting AP line:`, apLineError);
        throw apLineError;
      }
      
      // Then insert all expense lines
      console.log(`[Bill Journal] Inserting ${expenseLines.length} expense lines`);
      for (const expenseLine of expenseLines) {
        try {
          // Build column list and values list dynamically based on available fields
          const expColumnsList = ['journal_id', 'account_id', 'description', 'debit', 'credit'];
          const expValuesList = [journalId, expenseLine.account_id, expenseLine.description, expenseLine.debit, expenseLine.credit];
          
          // Add optional fields if they exist
          if (hasLineNumber) {
            expColumnsList.push('line_number');
            expValuesList.push((expenseLine as any).line_number);
          }
          
          if (journalLinesColumns.includes('category') && (expenseLine as any).category !== undefined) {
            expColumnsList.push('category');
            expValuesList.push((expenseLine as any).category);
          }
          
          if (journalLinesColumns.includes('location') && (expenseLine as any).location !== undefined) {
            expColumnsList.push('location');
            expValuesList.push((expenseLine as any).location);
          }
          
          if (journalLinesColumns.includes('vendor') && (expenseLine as any).vendor !== undefined) {
            expColumnsList.push('vendor');
            expValuesList.push((expenseLine as any).vendor);
          }
          
          if (journalLinesColumns.includes('funder') && (expenseLine as any).funder !== undefined) {
            expColumnsList.push('funder');
            expValuesList.push((expenseLine as any).funder);
          }
          
          // Build and execute the SQL query
          const expInsertQuery = `
            INSERT INTO journal_lines (${expColumnsList.join(', ')})
            VALUES (${expColumnsList.map((_, i) => `$${i + 1}`).join(', ')})
          `;
          
          await sql.query(expInsertQuery, expValuesList);
        } catch (expLineError) {
          console.error(`[Bill Journal] Error inserting expense line:`, expLineError);
          throw expLineError;
        }
      }
      
      console.log(`[Bill Journal] Successfully inserted all journal lines`);
      
      // Link the journal to the bill if journal_id column exists in bills table
      try {
        const columnCheck = await sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'bills' AND column_name = 'journal_id'
          ) as has_journal_id
        `;
        
        if (columnCheck.rows[0].has_journal_id) {
          await sql`
            UPDATE bills SET journal_id = ${journalId} WHERE id = ${billId}
          `;
          console.log(`[Bill Journal] Linked journal ${journalId} to bill ${billId} via journal_id column`);
        }
      } catch (linkErr) {
        console.error(`[Bill Journal] Error linking journal to bill:`, linkErr);
        // Continue without linking - journal is still created
      }
      
      await sql.query('COMMIT');
      console.log(`[Bill Journal] Successfully created journal entry ${journalId} for bill ${billId}`);
      return true;
    } catch (journalError) {
      await sql.query('ROLLBACK');
      console.error(`[Bill Journal] Error creating journal entry, transaction rolled back:`, journalError);
      throw journalError;
    }
  } catch (error) {
    console.error(`[Bill Journal] Top-level error in createJournalEntryForBill:`, error);
    return false;
  }
}

// GET /api/bills - fetch bills with optional filtering
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const vendorId = url.searchParams.get('vendorId') ? parseInt(url.searchParams.get('vendorId') as string, 10) : undefined;
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const includeDeletedParam = url.searchParams.get('includeDeleted');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    
    // Special parameter to get bill statuses
    if (url.searchParams.get('statuses') === 'true') {
      const statuses = await getBillStatuses();
      return NextResponse.json(statuses);
    }
    
    // Special parameter to get a specific bill
    const billId = url.searchParams.get('id');
    if (billId) {
      const includeLines = url.searchParams.get('includeLines') !== 'false';
      const includePayments = url.searchParams.get('includePayments') !== 'false';
      
      const bill = await getBill(
        parseInt(billId, 10),
        includeLines,
        includePayments,
        userId // Pass user_id for proper data isolation
      );
      
      if (!bill) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
      }
      
      return NextResponse.json(bill);
    }
    
    // Handle includeDeleted parameter
    const includeDeleted = includeDeletedParam === 'true';
    
    // Get bills with pagination and filters
    const { bills, total } = await getBills(
      page,
      limit,
      vendorId,
      startDate,
      endDate,
      status,
      includeDeleted,
      userId // Pass user_id for proper data isolation
    );
    
    return NextResponse.json({
      bills,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err: any) {
    console.error('[bills] GET error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch bills' },
      { status: 500 }
    );
  }
}

// POST /api/bills - create a new bill
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    
    // Validate required fields
    if (!body.bill) {
      return NextResponse.json({ 
        error: 'Bill data is required' 
      }, { status: 400 });
    }
    
    const { bill, lines } = body;
    
    if (!bill.vendor_id) {
      return NextResponse.json({ error: 'Vendor ID is required' }, { status: 400 });
    }
    
    if (!bill.bill_date) {
      return NextResponse.json({ error: 'Bill date is required' }, { status: 400 });
    }
    
    if (!bill.due_date) {
      return NextResponse.json({ error: 'Due date is required' }, { status: 400 });
    }
    
    if (!bill.ap_account_id) {
      return NextResponse.json({ error: 'AP account ID is required' }, { status: 400 });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'At least one bill line is required' }, { status: 400 });
    }
    
    // Calculate total amount if not provided
    if (!bill.total_amount) {
      bill.total_amount = lines.reduce((total, line) => total + (line.amount || 0), 0);
    }
    
    // Validate line items
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line.expense_account_id) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Expense account ID is required` 
        }, { status: 400 });
      }
      
      if (!line.quantity || line.quantity <= 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Quantity must be greater than 0` 
        }, { status: 400 });
      }
      
      if (!line.unit_price || line.unit_price < 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Unit price must be non-negative` 
        }, { status: 400 });
      }
      
      if (!line.amount || line.amount < 0) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Amount must be non-negative` 
        }, { status: 400 });
      }
      
      // Validate that amount = quantity * unit_price (with small rounding tolerance)
      const calculatedAmount = line.quantity * line.unit_price;
      if (Math.abs(calculatedAmount - line.amount) > 0.01) {
        return NextResponse.json({ 
          error: `Line ${i + 1}: Amount (${line.amount}) does not match quantity (${line.quantity}) * unit_price (${line.unit_price}) = ${calculatedAmount}` 
        }, { status: 400 });
      }
    }
    
    // Set default status if not specified
    if (!bill.status) {
      bill.status = 'Draft';
    }
    
    const billData: Bill = {
      vendor_id: bill.vendor_id,
      bill_number: bill.bill_number,
      bill_date: bill.bill_date,
      due_date: bill.due_date,
      total_amount: bill.total_amount,
      amount_paid: bill.amount_paid || 0,
      status: bill.status,
      terms: bill.terms,
      memo: bill.memo,
      ap_account_id: bill.ap_account_id
    };
    
    const lineItems: BillLine[] = lines.map(line => ({
      expense_account_id: line.expense_account_id,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      amount: line.amount
    }));
    
    const newBill = await createBill(billData, lineItems, userId); // Pass userId for proper data isolation

    // Audit Log for Bill Creation
    if (userId && newBill && typeof newBill.id !== 'undefined') {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        // user_name: // Optional: consider fetching user details if needed for logs
        action_type: 'BILL_CREATED',
        entity_type: 'Bill',
        entity_id: newBill.id,
        changes_made: [
          { field: 'vendor_id', old_value: null, new_value: newBill.vendor_id },
          { field: 'bill_number', old_value: null, new_value: newBill.bill_number },
          { field: 'bill_date', old_value: null, new_value: newBill.bill_date },
          { field: 'due_date', old_value: null, new_value: newBill.due_date },
          { field: 'total_amount', old_value: null, new_value: newBill.total_amount },
          { field: 'status', old_value: null, new_value: newBill.status },
          { field: 'ap_account_id', old_value: null, new_value: newBill.ap_account_id },
        ].filter(change => typeof change.new_value !== 'undefined'), // Ensure only defined values are logged
        status: 'SUCCESS',
        // context: { // Optional: for additional details if required
        //   lineItemsCount: lineItems.length,
        //   memo: newBill.memo
        // }
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error("Audit Log Error (BILL_CREATED):", auditError);
        // Non-critical error: a failure to log should not break the main operation.
      }
      
      // If the bill was created with Open status, create a journal entry
      if (newBill.status === 'Open') {
        console.log(`[Bill Create] Creating journal entry for new bill ${newBill.id} with Open status`);
        try {
          // We need to get the vendor name to create a proper journal entry
          const vendorQuery = await sql`
            SELECT name FROM vendors WHERE id = ${newBill.vendor_id}
          `;
          const vendorName = vendorQuery.rows.length > 0 ? vendorQuery.rows[0].name : 'Vendor';
          
          // Add vendor name to the bill object
          const billWithVendor = {
            ...newBill,
            vendor_name: vendorName
          };
          
          // Create journal entry
          await createJournalEntryForBill(newBill.id, billWithVendor, lineItems, userId);
        } catch (journalError) {
          console.error(`[Bill Create] Error creating journal entry for new bill ${newBill.id}:`, journalError);
          // Don't throw the error - the bill was created successfully even if journal creation failed
        }
      } else {
        console.log(`[Bill Create] Bill ${newBill.id} created with ${newBill.status} status, no journal entry needed`);
      }
    }
    
    return NextResponse.json({
      success: true,
      bill: newBill
    }, { status: 201 });
  } catch (err: any) {
    console.error('[bills] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create bill' },
      { status: 500 }
    );
  }
}

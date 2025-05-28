import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import {
  getBill,
  updateBill,
  deleteBill,
  BillLine
} from '@/lib/accounting/billQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';
import { sql } from '@vercel/postgres';
import { getJournalDateColumn } from '@/lib/accounting/journalColumnUtils';
import Anthropic from "@anthropic-ai/sdk";

/**
 * Parse payment terms and calculate the due date using AI
 * @param billDate The bill date in YYYY-MM-DD format
 * @param paymentTerms The payment terms (e.g., "Net 30", "2/10 Net 30", "Due on Receipt")
 * @returns The calculated due date in YYYY-MM-DD format
 */
async function calculateDueDateFromTerms(billDate: string, paymentTerms: string): Promise<string> {
  console.log(`[Bills API] Calculating due date from terms: ${paymentTerms} with bill date: ${billDate}`);
  
  try {
    // First try to parse common terms without AI
    const netMatch = paymentTerms.match(/net\s*(\d+)/i);
    if (netMatch && netMatch[1]) {
      const days = parseInt(netMatch[1], 10);
      if (!isNaN(days)) {
        const billDateObj = new Date(billDate);
        const dueDate = new Date(billDateObj);
        dueDate.setDate(billDateObj.getDate() + days);
        return `${dueDate.getFullYear()}-${(dueDate.getMonth() + 1).toString().padStart(2, '0')}-${dueDate.getDate().toString().padStart(2, '0')}`;
      }
    }
    
    // Check for "Due on Receipt"
    if (paymentTerms.toLowerCase().includes('due on receipt') || 
        paymentTerms.toLowerCase().includes('due upon receipt') ||
        paymentTerms.toLowerCase().includes('cod') ||
        paymentTerms.toLowerCase().includes('cash on delivery')) {
      return billDate; // Due immediately
    }
    
    // For more complex terms, use AI
    try {
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY || "",
      });
      
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 100,
        temperature: 0.1,
        system: `You are an accounting AI that parses payment terms and calculates due dates.
        Given a bill date and payment terms, determine the due date in YYYY-MM-DD format.
        Common payment terms include:
        - Net X: Payment due X days after invoice date
        - X/Y Net Z: X% discount if paid within Y days, otherwise full amount due in Z days
        - EOM: End of month
        - MFI: Month following invoice
        - Due on Receipt: Payment due immediately
        
        Respond ONLY with the due date in YYYY-MM-DD format. Just the date, nothing else.`,
        messages: [{ 
          role: "user", 
          content: `Bill date: ${billDate}\nPayment terms: ${paymentTerms}\n\nWhat is the due date in YYYY-MM-DD format?`
        }]
      });
      
      const responseText = typeof response.content[0] === 'object' && 'text' in response.content[0] ? response.content[0].text : '';
      
      // Extract date in YYYY-MM-DD format
      const dateMatch = responseText.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch && dateMatch[1]) {
        console.log(`[Bills API] AI calculated due date: ${dateMatch[1]} from terms: ${paymentTerms}`);
        return dateMatch[1];
      }
    } catch (aiError) {
      console.error('[Bills API] Error using AI for payment terms parsing:', aiError);
      // Continue to fallback if AI fails
    }
    
    // Fallback: Default to Net 30 if we couldn't parse the terms
    const billDateObj = new Date(billDate);
    const dueDate = new Date(billDateObj);
    dueDate.setDate(billDateObj.getDate() + 30);
    return `${dueDate.getFullYear()}-${(dueDate.getMonth() + 1).toString().padStart(2, '0')}-${dueDate.getDate().toString().padStart(2, '0')}`;
  } catch (error) {
    console.error('[Bills API] Error calculating due date from terms:', error);
    // Fallback to 30 days from bill date
    const billDateObj = new Date(billDate);
    const dueDate = new Date(billDateObj);
    dueDate.setDate(billDateObj.getDate() + 30);
    return `${dueDate.getFullYear()}-${(dueDate.getMonth() + 1).toString().padStart(2, '0')}-${dueDate.getDate().toString().padStart(2, '0')}`;
  }
}

// Extended interface for bill with additional fields from the database
interface BillWithDetails {
  id: number;
  vendor_id: number;
  vendor_name?: string;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: string | number;
  paid_amount?: string | number;
  status: string;
  payment_terms?: string;
  description?: string;
  ap_account_id: number;
  ap_account_name?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  lines?: BillLine[];
  payments?: any[];
}

// Simplified JournalLine interface for our specific needs
interface JournalEntry {
  line_number?: number;
  account_id: number;
  description: string;
  debit_amount: number;
  credit_amount: number;
  category?: string | null;
  location?: string | null;
  vendor?: string | null;
  funder?: string | null;
}

/**
 * Creates a journal entry when a bill changes from Draft to Open status
 */
async function createJournalEntryForBill(billId: number, bill: BillWithDetails, billLines: BillLine[], userId: string): Promise<void> {
  try {
    console.log(`[Bill Journal] Creating journal entry for bill ${billId}`);
    
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
      params.push(bill.bill_date);
      
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
      
      // Add user_id column to ensure data isolation
      columnList.push('user_id');
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
      const apLine: JournalEntry = {
        account_id: bill.ap_account_id,
        description: `Bill #${bill.bill_number || billId} - ${bill.vendor_name || 'Vendor'}`,
        debit_amount: 0,
        credit_amount: totalAmount
      };
      if (hasLineNumber) {
        (apLine as any).line_number = 1;
      }
      
      // Add expense account debit lines
      const expenseLines: JournalEntry[] = [];
      let lineNumber = 2;
      
      for (const line of billLines) {
        const lineAmount = parseFloat(line.line_total);
        const expenseLine: JournalEntry = {
          account_id: parseInt(line.account_id as string),
          description: line.description || `Bill #${bill.bill_number || billId} expense`,
          debit_amount: lineAmount,
          credit_amount: 0
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
        const apColumnsList = ['journal_id', 'account_id', 'description', 'debit_amount', 'credit_amount', 'user_id'];
        const apValuesList = [journalId, apLine.account_id, apLine.description, apLine.debit_amount, apLine.credit_amount, userId];
        
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
          const expColumnsList = ['journal_id', 'account_id', 'description', 'debit_amount', 'credit_amount', 'user_id'];
          const expValuesList = [journalId, expenseLine.account_id, expenseLine.description, expenseLine.debit_amount, expenseLine.credit_amount, userId];
          
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
    } catch (journalError) {
      await sql.query('ROLLBACK');
      console.error(`[Bill Journal] Error creating journal entry, transaction rolled back:`, journalError);
      throw journalError;
    }
  } catch (error) {
    console.error(`[Bill Journal] Top-level error in createJournalEntryForBill:`, error);
    throw error;
  }
}

// GET /api/bills/[id] - fetch a specific bill
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    // Parse query parameters
    const url = new URL(req.url);
    const includeLines = url.searchParams.get('includeLines') !== 'false';
    const includePayments = url.searchParams.get('includePayments') !== 'false';

    const bill = await getBill(id, includeLines, includePayments);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    return NextResponse.json(bill);
  } catch (err: any) {
    console.error(`[bills/${id}] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch bill' },
      { status: 500 }
    );
  }
}

// PUT /api/bills/[id] - update a specific bill
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    if (!body || !body.bill) {
      return NextResponse.json({ error: 'Bill data is required' }, { status: 400 });
    }

    // Get the existing bill first
    const existingBill = await getBill(id);
    if (!existingBill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Don't allow updates if bill has payments and we're trying to change certain fields
    if ((existingBill.paid_amount || 0) > 0) {
      const { bill } = body;
      if (
        (bill.vendor_id && bill.vendor_id !== existingBill.vendor_id) ||
        (bill.total_amount && bill.total_amount !== existingBill.total_amount) ||
        (bill.ap_account_id && bill.ap_account_id !== existingBill.ap_account_id)
      ) {
        return NextResponse.json(
          { error: 'Cannot modify vendor, total amount, or AP account for a bill that has payments' },
          { status: 400 }
        );
      }
    }

    const { bill, lines } = body;

    // Check if we're changing status from Draft to Open (case-insensitive comparison)
    const existingStatusLower = existingBill.status?.toLowerCase() || '';
    const newStatusLower = bill.status?.toLowerCase() || '';
    const changingFromDraftToOpen = existingStatusLower === 'draft' && newStatusLower === 'open';
    
    console.log(`[Bill Update] Status change detection: existingStatus=${existingBill.status}, newStatus=${bill.status}, changingFromDraftToOpen=${changingFromDraftToOpen}`);

    // If updating total_amount, make sure it's not less than amount already paid
    if (bill.total_amount && (existingBill.paid_amount || 0) > bill.total_amount) {
      return NextResponse.json(
        { error: `Cannot set total amount less than amount already paid (${existingBill.paid_amount})` },
        { status: 400 }
      );
    }

    // Check if payment terms are being updated but due date is not explicitly provided
    // If so, calculate the due date based on the new payment terms
    let billToUpdate = { ...bill };
    
    if (bill.payment_terms && (!bill.due_date || bill.due_date === existingBill.due_date)) {
      // Terms changed but due date not explicitly updated
      if (bill.payment_terms !== existingBill.payment_terms) {
        console.log(`[Bills API] Payment terms changed from ${existingBill.payment_terms} to ${bill.payment_terms}, recalculating due date`);
        
        // Use the bill date from the update if provided, otherwise use existing bill date
        const billDate = bill.bill_date || existingBill.bill_date;
        
        // Calculate new due date based on the updated terms
        try {
          const calculatedDueDate = await calculateDueDateFromTerms(billDate, bill.payment_terms);
          console.log(`[Bills API] Auto-calculated due date: ${calculatedDueDate} based on terms: ${bill.payment_terms}`);
          
          // Update the due date in the bill object
          billToUpdate.due_date = calculatedDueDate;
        } catch (calcError) {
          console.error(`[Bills API] Error calculating due date from terms:`, calcError);
          // Continue with update even if due date calculation fails
        }
      }
    }
    
    // Update the bill
    const updatedBill = await updateBill(
      id,
      {
        ...billToUpdate,
        // Fields that should never be updated via API
        paid_amount: undefined, // Never update paid_amount directly, only via payments
        is_deleted: undefined, // Never update is_deleted directly, use DELETE endpoint
        deleted_at: undefined, // Never update deleted_at directly, use DELETE endpoint
      },
      lines,
      userId // Pass userId for proper data isolation
    );
    
    // Create journal entry if status changed from Draft to Open
    if (changingFromDraftToOpen && updatedBill) {
      try {
        // Get the actual bill lines if they weren't provided in the update
        const billWithLines = await getBill(id, true, false) as BillWithDetails | null;
        const billLines = lines || (billWithLines && billWithLines.lines ? billWithLines.lines : []);
        const totalAmount = typeof updatedBill.total_amount === 'string' ? parseFloat(updatedBill.total_amount) : updatedBill.total_amount || 0;
        
        if (billLines.length === 0) {
          console.warn(`[Bill Update] No bill lines found for creating journal entry`);
        }

        // Create journal entry for bill
        await createJournalEntryForBill(id, updatedBill as BillWithDetails, billLines, userId);
      } catch (journalError) {
        console.error(`[Bill Update] Error creating journal entry for bill ${id}:`, journalError);
        // We continue despite journal errors - the bill is updated but may need manual journal entry
      }
    }

    // Audit Log for Bill Update
    if (userId && updatedBill) {
      const changes: { field: string; old_value: any; new_value: any }[] = [];
      const fieldsToCompare: (keyof typeof existingBill)[] = [
        'vendor_id', 'bill_number', 'bill_date', 'due_date', 
        'total_amount', 'status', 'payment_terms', 'description', 'ap_account_id'
      ];

      for (const field of fieldsToCompare) {
        if (existingBill[field] !== updatedBill[field] && 
            typeof updatedBill[field] !== 'undefined') { // only log if value actually changed and new value is defined
          changes.push({
            field: String(field),
            old_value: existingBill[field],
            new_value: updatedBill[field],
          });
        }
      }
      // Note: Line item changes are handled within updateBill and could be logged there
      // or as separate LINE_ITEM_UPDATED events if needed.
      // For this BILL_UPDATED event, we focus on direct bill properties.

      if (changes.length > 0 || (lines && lines.length > 0)) { // Log if direct fields changed or if lines were part of the update payload
        const auditEntry: AuditLogData = {
          timestamp: new Date().toISOString(),
          user_id: userId,
          action_type: 'BILL_UPDATED',
          entity_type: 'Bill',
          entity_id: id,
          changes_made: changes.length > 0 ? changes : null, // Only include changes if there are any
          status: 'SUCCESS',
          context: (lines && lines.length > 0) ? { line_items_provided_in_update: true, line_items_count: lines.length } : null,
        };
        try {
          logAuditEvent(auditEntry);
        } catch (auditError) {
          console.error(`Audit Log Error (BILL_UPDATED, ID: ${id}):`, auditError);
        }
      }
    }

    return NextResponse.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    console.error(`[bills/${id}] PUT error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to update bill' },
      { status: 500 }
    );
  }
}

// DELETE /api/bills/[id] - soft delete a bill
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    // Get the bill to check if it has payments
    const bill = await getBill(id, false, true);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found' }, { status: 404 });
    }

    // Don't allow deletion if bill has payments
    if ((bill.paid_amount || 0) > 0) {
      return NextResponse.json({ error: 'Cannot delete a bill that has payments' }, { status: 400 });
    }

    // Delete the bill (soft delete)
    await deleteBill(id);

    // Audit Log for Bill Deletion
    if (userId) {
      const auditEntry: AuditLogData = {
        timestamp: new Date().toISOString(),
        user_id: userId,
        action_type: 'BILL_DELETED',
        entity_type: 'Bill',
        entity_id: id,
        changes_made: [
            { field: 'is_deleted', old_value: bill?.is_deleted ?? false, new_value: true }, // Assuming bill.is_deleted reflects state before deleteBill call
            { field: 'status', old_value: bill?.status, new_value: 'Deleted' } // Conceptual change
        ],
        status: 'SUCCESS',
        context: { original_status: bill?.status }, // Log original status from bill object fetched before deletion
      };
      try {
        logAuditEvent(auditEntry);
      } catch (auditError) {
        console.error(`Audit Log Error (BILL_DELETED, ID: ${id}):`, auditError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[bills/${id}] DELETE error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete bill' },
      { status: 500 }
    );
  }
}

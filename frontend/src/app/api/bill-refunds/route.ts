import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { 
  getBill,
} from '@/lib/accounting/billQueries';
import { createJournal, Journal, JournalLine } from '@/lib/accounting/journalQueries';
import { logAuditEvent, AuditLogData } from '@/lib/auditLogger';

// Define interfaces for bill and related data
interface BillLine {
  id: number;
  expense_account_id: number;
  expense_account_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface Bill {
  id: number;
  vendor_id: number;
  vendor_name: string;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  ap_account_name: string;
  created_at: string;
  updated_at: string;
  lines?: BillLine[];
}

/**
 * POST /api/bill-refunds - create a new bill refund
 * This endpoint creates a refund for a paid vendor bill
 */
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const body = await req.json();
    
    // Handle both formats: { refund: {...} } or direct refund object
    let refund;
    if (body.refund) {
      refund = body.refund;
    } else if (body.bill_id) {
      // If the body itself has bill_id, treat it as the refund object
      refund = body;
    } else {
      return NextResponse.json({ 
        error: 'Refund data is required' 
      }, { status: 400 });
    }
    
    if (!refund.bill_id) {
      return NextResponse.json({ error: 'Bill ID is required' }, { status: 400 });
    }
    
    if (!refund.refund_date) {
      return NextResponse.json({ error: 'Refund date is required' }, { status: 400 });
    }
    
    if (!refund.amount || refund.amount <= 0) {
      return NextResponse.json({ error: 'Refund amount must be greater than 0' }, { status: 400 });
    }
    
    if (!refund.refund_account_id) {
      return NextResponse.json({ error: 'Refund account ID is required' }, { status: 400 });
    }
    
    // Check if bill exists and belongs to the current user
    const billId = typeof refund.bill_id === 'number' ? refund.bill_id : parseInt(refund.bill_id.toString());
    const bill = await getBill(billId, true, true, userId);
    if (!bill) {
      return NextResponse.json({ error: 'Bill not found or you do not have permission to access it' }, { status: 404 });
    }
    
    // Check if bill has been paid
    if (bill.status !== 'Paid') {
      return NextResponse.json({ error: 'Only paid bills can be refunded' }, { status: 400 });
    }
    
    // Check if bill has an amount_paid value
    const billAmountPaid = bill.amount_paid || 0;
    
    // Check if refund amount exceeds paid amount
    if (refund.amount > billAmountPaid) {
      return NextResponse.json({ 
        error: `Refund amount ${refund.amount} exceeds paid bill amount ${billAmountPaid}` 
      }, { status: 400 });
    }
    
    // Ensure refund amount is a valid number
    let refundAmountNum: number;
    try {
      // Handle both string and number inputs
      refundAmountNum = typeof refund.amount === 'number' ? 
        refund.amount : 
        parseFloat(refund.amount);
      
      // Validate the number
      if (isNaN(refundAmountNum) || refundAmountNum <= 0) {
        return NextResponse.json({ error: 'Refund amount must be a valid positive number' }, { status: 400 });
      }
      
      // Round to 2 decimal places to avoid floating point issues
      refundAmountNum = Math.round(refundAmountNum * 100) / 100;
    } catch (err) {
      return NextResponse.json({ error: 'Invalid refund amount format' }, { status: 400 });
    }

    // Journal entry description
    // Get vendor name from bill or use a generic fallback
    // The vendor name might be in a related field or need to be fetched separately
    const vendorName = (bill as any).vendor_name || 'vendor';
    const journalMemo = `Refund for Bill ${bill.bill_number || bill.id} from ${vendorName}`;
    const creditDescription = `Refund from ${vendorName} for bill #${bill.bill_number || bill.id}`;
    const debitDescription = refund.reference_number ? 
      `Ref: ${refund.reference_number}` : 
      `Refund for Bill ${bill.bill_number || bill.id}`;
      
    // Calculate how to distribute the refund across expense accounts
    // If bill has no lines, we'll credit the AP account as fallback
    const billLines = (bill as Bill).lines || [];
    let expenseDistribution: {account_id: number, amount: number}[] = [];
    
    if (billLines.length > 0) {
      // Calculate total amount from bill lines to determine proportions
      const totalLineAmount = billLines.reduce((sum: number, line: BillLine) => sum + (line.amount || 0), 0);
      
      // Distribute refund amount proportionally across expense accounts
      if (totalLineAmount > 0) {
        expenseDistribution = billLines.map((line: BillLine) => {
          const proportion = (line.amount || 0) / totalLineAmount;
          const amount = Math.round((proportion * refundAmountNum) * 100) / 100; // Round to 2 decimal places
          return {
            account_id: line.expense_account_id,
            amount: amount
          };
        });
      }
    }

    // Create journal entry directly using SQL to avoid trigger issues
    let journalId: number;
    try {
      console.log('Creating journal entry for refund with direct SQL...');
      
      // Use a client from the pool for transaction
      const client = await sql.connect();
      
      try {
        // Start transaction
        await client.query('BEGIN');
        
        // Check which date column exists in the journals table
        const schemaCheck = await client.query(`
          SELECT 
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'transaction_date') as has_transaction_date,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'date') as has_date
        `);
        
        const schema = schemaCheck.rows[0];
        console.log('Journal table schema check:', schema);
        
        // Use the appropriate date column based on schema
        let dateColumnName = schema.has_transaction_date ? 'transaction_date' : 'date';
        
        // Insert journal header with dynamic column name
        const journalResult = await client.query(
          `INSERT INTO journals 
            (${dateColumnName}, memo, source, journal_type, is_posted, created_by, user_id) 
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7) 
          RETURNING id`,
          [refund.refund_date, journalMemo, 'AP', 'BR', true, userId, userId]
        );
        
        journalId = journalResult.rows[0].id;
        console.log(`Journal created with ID: ${journalId}`);
        
        // Check if journal_lines table has line_number column
        const lineNumberCheck = await client.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'journal_lines' AND column_name = 'line_number'
          ) as has_line_number
        `);
        
        const hasLineNumber = lineNumberCheck.rows[0].has_line_number;
        console.log('Journal lines has line_number column:', hasLineNumber);
        
        // Insert journal lines for the refund
        // First insert the debit line for the refund account
        let lineNumber = 1;
        
        if (hasLineNumber) {
          // Insert debit line with line number
          await client.query(
            `INSERT INTO journal_lines 
              (journal_id, line_number, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [journalId, lineNumber++, refund.refund_account_id, debitDescription, refundAmountNum, 0, null, null, null, null, userId]
          );
          
          // Insert credit lines for expense accounts
          if (expenseDistribution.length > 0) {
            // Use expense accounts proportionally
            for (const dist of expenseDistribution) {
              if (dist.amount > 0) {
                await client.query(
                  `INSERT INTO journal_lines 
                    (journal_id, line_number, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
                  VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                  [journalId, lineNumber++, dist.account_id, creditDescription, 0, dist.amount, null, null, null, null, userId]
                );
              }
            }
          } else {
            // Fallback to AP account if no expense accounts available
            await client.query(
              `INSERT INTO journal_lines 
                (journal_id, line_number, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
              VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [journalId, lineNumber++, bill.ap_account_id, creditDescription, 0, refundAmountNum, null, null, null, null, userId]
            );
          }
        } else {
          // Insert debit line without line number
          await client.query(
            `INSERT INTO journal_lines 
              (journal_id, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [journalId, refund.refund_account_id, debitDescription, refundAmountNum, 0, null, null, null, null, userId]
          );
          
          // Insert credit lines for expense accounts
          if (expenseDistribution.length > 0) {
            // Use expense accounts proportionally
            for (const dist of expenseDistribution) {
              if (dist.amount > 0) {
                await client.query(
                  `INSERT INTO journal_lines 
                    (journal_id, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
                  VALUES 
                    ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                  [journalId, dist.account_id, creditDescription, 0, dist.amount, null, null, null, null, userId]
                );
              }
            }
          } else {
            // Fallback to AP account if no expense accounts available
            await client.query(
              `INSERT INTO journal_lines 
                (journal_id, account_id, description, debit, credit, category, location, vendor, funder, user_id) 
              VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [journalId, bill.ap_account_id, creditDescription, 0, refundAmountNum, null, null, null, null, userId]
            );
          }
        }
        
        console.log('Journal lines inserted successfully');
        
        // Now create the bill refund record
        const refundQuery = `
          INSERT INTO bill_refunds (
            bill_id,
            refund_date,
            amount,
            refund_account_id,
            refund_method,
            reference_number,
            journal_id,
            reason,
            user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `;
        
        const refundResult = await client.query(refundQuery, [
          refund.bill_id,
          refund.refund_date,
          refundAmountNum,
          refund.refund_account_id,
          refund.refund_method || null,
          refund.reference_number || null,
          journalId,
          refund.reason || 'Vendor refund',
          userId
        ]);
        
        const newRefund = refundResult.rows[0];
        
        // No longer update the bill's amount_paid or status
        // Refunds are tracked separately and don't modify the original bill
        
        // Commit the transaction
        await client.query('COMMIT');
        
        // Audit Log for Bill Refund Creation
        if (userId && newRefund && typeof newRefund.id !== 'undefined') {
          const auditEntry: AuditLogData = {
            timestamp: new Date().toISOString(),
            user_id: userId,
            action_type: 'BILL_REFUND_CREATED',
            entity_type: 'BillRefund',
            entity_id: newRefund.id,
            changes_made: [
              { field: 'bill_id', old_value: null, new_value: newRefund.bill_id },
              { field: 'refund_date', old_value: null, new_value: newRefund.refund_date },
              { field: 'amount', old_value: null, new_value: newRefund.amount },
              { field: 'refund_account_id', old_value: null, new_value: newRefund.refund_account_id },
              { field: 'journal_id', old_value: null, new_value: newRefund.journal_id },
            ],
            status: 'SUCCESS',
            context: { 
              related_bill_id: bill.id,
              related_bill_number: bill.bill_number 
            }
          };
          try {
            logAuditEvent(auditEntry);
          } catch (auditError) {
            console.error("Audit Log Error (BILL_REFUND_CREATED):", auditError);
          }
        }
        
        return NextResponse.json({
          success: true,
          refund: newRefund,
          journal_id: journalId
        }, { status: 201 });
      } catch (err) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error('Error in refund creation transaction:', err);
        throw err;
      } finally {
        // Release the client back to the pool
        client.release();
      }
    } catch (err) {
      console.error('Error creating refund with direct SQL:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({
        error: `Failed to create refund: ${errorMessage}`
      }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[bill-refunds] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to create refund' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bill-refunds?id=X - delete a bill refund
 */
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Get refund ID from query parameter
    const url = new URL(req.url);
    const refundId = url.searchParams.get('id');
    
    if (!refundId) {
      return NextResponse.json({ error: 'Refund ID is required' }, { status: 400 });
    }
    
    const id = parseInt(refundId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid refund ID' }, { status: 400 });
    }
    
    // Start a transaction
    const client = await sql.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the refund details
      const refundResult = await client.query(`
        SELECT * FROM bill_refunds WHERE id = $1 AND user_id = $2
      `, [id, userId]);
      
      if (refundResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json({ 
          error: 'Refund not found or you do not have permission to delete it' 
        }, { status: 404 });
      }
      
      const refund = refundResult.rows[0];
      
      // No longer update the bill when deleting a refund
      // Refunds are tracked separately and don't modify the original bill
      
      // Delete the associated journal entry
      if (refund.journal_id) {
        await client.query(`DELETE FROM journal_lines WHERE journal_id = $1`, [refund.journal_id]);
        await client.query(`DELETE FROM journals WHERE id = $1`, [refund.journal_id]);
      }
      
      // Delete the refund
      await client.query(`DELETE FROM bill_refunds WHERE id = $1`, [id]);
      
      // Commit the transaction
      await client.query('COMMIT');
      
      // Audit Log for Bill Refund Deletion
      if (userId) {
        const auditEntry: AuditLogData = {
          timestamp: new Date().toISOString(),
          user_id: userId,
          action_type: 'BILL_REFUND_DELETED',
          entity_type: 'BillRefund',
          entity_id: id,
          status: 'SUCCESS',
          context: { 
            bill_id: refund.bill_id,
            journal_id: refund.journal_id,
            note: 'Bill refund and associated journal entry deleted' 
          }
        };
        try {
          logAuditEvent(auditEntry);
        } catch (auditError) {
          console.error("Audit Log Error (BILL_REFUND_DELETED):", auditError);
        }
      }
      
      return NextResponse.json({
        success: true,
        message: 'Refund deleted successfully'
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('[bill-refunds] DELETE error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete refund' },
      { status: 500 }
    );
  }
}

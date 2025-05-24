import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { authenticateRequest } from '@/lib/authenticateRequest';

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const userId = auth.userId;
    
    // Extract the 'id' from the request URL
    const { pathname } = request.nextUrl;
    const segments = pathname.split('/');
    const idStr = segments[segments.length - 1]; // Assuming 'id' is the last segment
    const id = parseInt(idStr);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Get the bill credit
    const billCreditResult = await query(
      `SELECT 
        bc.*, 
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bill_credits bc
      LEFT JOIN vendors v ON bc.vendor_id = v.id
      LEFT JOIN accounts a ON bc.ap_account_id = a.id
      WHERE bc.id = $1 AND bc.user_id = $2`,
      [id, userId]
    );

    if (billCreditResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bill credit not found' }, { status: 404 });
    }

    // Get the bill credit lines
    const billCreditLines = await query(
      `SELECT 
        bcl.*, 
        a.name as expense_account_name
      FROM bill_credit_lines bcl
      LEFT JOIN accounts a ON bcl.expense_account_id = a.id
      WHERE bcl.bill_credit_id = $1`,
      [id]
    );

    const billCredit = {
      ...billCreditResult.rows[0],
      lines: billCreditLines.rows
    };

    return NextResponse.json(billCredit);
  } catch (err: any) {
    console.error(`[bill-credits/GET] Error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const userId = auth.userId;
    
    // Extract the 'id' from the request URL
    const { pathname } = request.nextUrl;
    const segments = pathname.split('/');
    const idStr = segments[segments.length - 1]; // Assuming 'id' is the last segment
    const id = parseInt(idStr);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Check if the bill credit exists and belongs to the user
    const checkResult = await query(
      `SELECT id FROM bill_credits 
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bill credit not found' }, { status: 404 });
    }

    const { bill, lines } = await request.json();

    // Update the bill credit
    await query(
      `UPDATE bill_credits SET
        vendor_id = $1,
        credit_number = $2,
        credit_date = $3,
        due_date = $4,
        total_amount = $5,
        status = $6,
        terms = $7,
        memo = $8,
        ap_account_id = $9,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $10`,
      [
        bill.vendor_id,
        bill.credit_number || null,
        bill.credit_date,
        bill.due_date || null,
        bill.total_amount,
        bill.status,
        bill.terms || null,
        bill.memo || null,
        bill.ap_account_id,
        id
      ]
    );

    // Delete existing line items to replace with new ones
    await query(`DELETE FROM bill_credit_lines WHERE bill_credit_id = $1`, [id]);

    // Insert new line items
    for (const line of lines) {
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
          id,
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

    // Get the updated bill credit with lines
    const updatedBillCreditResult = await query(
      `SELECT 
        bc.*, 
        v.name as vendor_name,
        a.name as ap_account_name
      FROM bill_credits bc
      LEFT JOIN vendors v ON bc.vendor_id = v.id
      LEFT JOIN accounts a ON bc.ap_account_id = a.id
      WHERE bc.id = $1`,
      [id]
    );

    const updatedBillCreditLines = await query(
      `SELECT 
        bcl.*, 
        a.name as expense_account_name
      FROM bill_credit_lines bcl
      LEFT JOIN accounts a ON bcl.expense_account_id = a.id
      WHERE bcl.bill_credit_id = $1`,
      [id]
    );

    const updatedBillCredit = {
      ...updatedBillCreditResult.rows[0],
      lines: updatedBillCreditLines.rows
    };

    return NextResponse.json(updatedBillCredit);
  } catch (err: any) {
    console.error(`[bill-credits/PUT] Error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const auth = await authenticateRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const userId = auth.userId;
    
    // Extract the 'id' from the request URL
    const { pathname } = request.nextUrl;
    const segments = pathname.split('/');
    const idStr = segments[segments.length - 1]; // Assuming 'id' is the last segment
    const id = parseInt(idStr);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Check if the bill credit exists and belongs to the user
    const checkResult = await query(
      `SELECT id FROM bill_credits 
      WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bill credit not found' }, { status: 404 });
    }

    // Delete the bill credit (this will cascade delete the line items)
    await query(`DELETE FROM bill_credits WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error(`[bill-credits/DELETE] Error:`, err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

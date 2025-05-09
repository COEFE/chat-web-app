import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/bank-accounts/[id] - Get a specific bank account by ID
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Get bank account with GL account details
    const bankAccountQuery = `
      SELECT 
        ba.*,
        a.name as gl_account_name,
        a.code as gl_account_code,
        COALESCE(
          (SELECT SUM(
            CASE WHEN bt.transaction_type = 'credit' THEN bt.amount ELSE -bt.amount END
          ) FROM bank_transactions bt 
           WHERE bt.bank_account_id = ba.id AND bt.is_deleted = false),
          0
        ) as current_balance
      FROM 
        bank_accounts ba
        JOIN accounts a ON ba.gl_account_id = a.id
      WHERE 
        ba.id = $1 AND ba.is_deleted = false
    `;
    
    const result = await query(bankAccountQuery, [id]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error(`Error fetching bank account:`, err);
    return NextResponse.json(
      { error: 'Failed to fetch bank account' },
      { status: 500 }
    );
  }
}

// PUT /api/bank-accounts/[id] - Update a bank account
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if bank account exists
    const checkQuery = `
      SELECT id FROM bank_accounts WHERE id = $1 AND is_deleted = false
    `;
    
    const checkResult = await query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    const body = await req.json();
    
    // Validate required fields
    if (!body.name) {
      return NextResponse.json({ error: 'Bank account name is required' }, { status: 400 });
    }
    
    if (!body.account_number) {
      return NextResponse.json({ error: 'Account number is required' }, { status: 400 });
    }
    
    if (!body.institution_name) {
      return NextResponse.json({ error: 'Institution name is required' }, { status: 400 });
    }
    
    if (!body.gl_account_id) {
      return NextResponse.json({ error: 'GL account ID is required' }, { status: 400 });
    }
    
    // Check if GL account exists
    const glAccountCheck = await query(
      'SELECT id FROM accounts WHERE id = $1 AND is_deleted = false',
      [body.gl_account_id]
    );
    
    if (glAccountCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid GL account ID' }, { status: 400 });
    }
    
    // Update the bank account
    const updateQuery = `
      UPDATE bank_accounts
      SET 
        name = $1,
        account_number = $2,
        routing_number = $3,
        institution_name = $4,
        gl_account_id = $5,
        is_active = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;
    
    const result = await query(updateQuery, [
      body.name,
      body.account_number,
      body.routing_number || null,
      body.institution_name,
      body.gl_account_id,
      body.is_active !== undefined ? body.is_active : true,
      id
    ]);
    
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error(`Error updating bank account:`, err);
    return NextResponse.json(
      { error: 'Failed to update bank account' },
      { status: 500 }
    );
  }
}

// DELETE /api/bank-accounts/[id] - Soft delete a bank account
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if bank account exists
    const checkQuery = `
      SELECT id FROM bank_accounts WHERE id = $1 AND is_deleted = false
    `;
    
    const checkResult = await query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    // Check if there are any active transactions for this account
    const transactionsQuery = `
      SELECT COUNT(*) FROM bank_transactions 
      WHERE bank_account_id = $1 AND is_deleted = false
    `;
    
    const transactionsResult = await query(transactionsQuery, [id]);
    const transactionCount = parseInt(transactionsResult.rows[0].count);
    
    if (transactionCount > 0) {
      // If there are transactions, perform soft delete
      const softDeleteQuery = `
        UPDATE bank_accounts
        SET 
          is_deleted = true,
          deleted_at = CURRENT_TIMESTAMP,
          is_active = false,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
      `;
      
      await query(softDeleteQuery, [id]);
    } else {
      // If no transactions, we could hard delete, but we'll keep soft delete for consistency
      const softDeleteQuery = `
        UPDATE bank_accounts
        SET 
          is_deleted = true,
          deleted_at = CURRENT_TIMESTAMP,
          is_active = false,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id
      `;
      
      await query(softDeleteQuery, [id]);
    }
    
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(`Error deleting bank account:`, err);
    return NextResponse.json(
      { error: 'Failed to delete bank account' },
      { status: 500 }
    );
  }
}

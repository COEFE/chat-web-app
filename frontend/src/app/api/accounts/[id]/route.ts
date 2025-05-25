import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { sql } from '@vercel/postgres';
import { type NextApiRequest } from 'next';

// PATCH /api/accounts/:id – update an account
export async function PATCH(req: NextRequest) {
  // Extract ID from URL
  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 });
  }
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    const { code, name, parent_id, notes, is_custom } = await req.json();

    const { rows } = await sql`
      UPDATE accounts
      SET
        code       = COALESCE(${code}, code),
        name       = COALESCE(${name}, name),
        parent_id  = COALESCE(${parent_id}, parent_id),
        notes      = COALESCE(${notes}, notes),
        is_custom  = COALESCE(${is_custom}, is_custom)
      WHERE id = ${id}
      RETURNING id, code, name, parent_id, notes, is_custom;
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json({ account: rows[0] });
  } catch (err: any) {
    console.error('[accounts/:id] PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

// DELETE /api/accounts/:id – delete an account
export async function DELETE(req: NextRequest) {
  // Extract ID from URL
  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid account ID' }, { status: 400 });
  }
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // ID already extracted above
    
    // First check if this account has child accounts
    const { rows: childRows } = await sql`
      SELECT COUNT(*) as count FROM accounts WHERE parent_id = ${id}
    `;
    
    if (parseInt(childRows[0].count, 10) > 0) {
      return NextResponse.json({ 
        error: 'Cannot delete an account with child accounts. Remove child accounts first.' 
      }, { status: 400 });
    }

    // Check if the account exists
    const { rows: accountRows } = await sql`
      SELECT id FROM accounts WHERE id = ${id}
    `;
    
    if (accountRows.length === 0) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    
    // Note: Previously restricted deletion to custom accounts only
    // This restriction has been removed to allow deletion of any account

    // Delete the account
    const { rows } = await sql`
      DELETE FROM accounts WHERE id = ${id} RETURNING id
    `;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Account not found or could not be deleted' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Account deleted successfully' });
  } catch (err: any) {
    console.error('[accounts/:id] DELETE error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/customers/[id] - fetch a specific customer
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
  }

  try {
    const customerQuery = `
      SELECT * FROM customers 
      WHERE id = $1 AND is_deleted = false AND user_id = $2
    `;
    
    const result = await query(customerQuery, [id, userId]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json({ customer: result.rows[0] });
  } catch (err: any) {
    console.error(`[customers/${id}] GET error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch customer' },
      { status: 500 }
    );
  }
}

// PUT /api/customers/[id] - update a specific customer
export async function PUT(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const {
      name,
      contact_person,
      email,
      phone,
      billing_address,
      shipping_address,
      default_revenue_account_id
    } = body.customer || {};
    
    if (!name) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }
    
    // Check if customer exists
    const checkQuery = `
      SELECT id FROM customers 
      WHERE id = $1 AND is_deleted = false AND user_id = $2
    `;
    
    const checkResult = await query(checkQuery, [id, userId]);
    
    if (checkResult.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    
    // Update customer
    const updateQuery = `
      UPDATE customers 
      SET 
        name = $1, 
        contact_person = $2, 
        email = $3, 
        phone = $4, 
        billing_address = $5, 
        shipping_address = $6, 
        default_revenue_account_id = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND user_id = $9
      RETURNING *
    `;
    
    const updateResult = await query(updateQuery, [
      name,
      contact_person || null,
      email || null,
      phone || null,
      billing_address || null,
      shipping_address || null,
      default_revenue_account_id || null,
      id,
      userId
    ]);
    
    return NextResponse.json({
      success: true,
      customer: updateResult.rows[0]
    });
  } catch (err: any) {
    console.error(`[customers/${id}] PUT error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to update customer' },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id] - soft delete a customer
export async function DELETE(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  const id = parseInt(req.nextUrl.pathname.split('/').pop() || '', 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid customer ID' }, { status: 400 });
  }

  try {
    // Check if customer has associated invoices
    const checkInvoicesQuery = `
      SELECT COUNT(*) FROM invoices 
      WHERE customer_id = $1 AND is_deleted = false AND user_id = $2
    `;
    
    const invoicesResult = await query(checkInvoicesQuery, [id, userId]);
    const invoiceCount = parseInt(invoicesResult.rows[0].count);
    
    if (invoiceCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete customer with ID ${id} because it has ${invoiceCount} associated invoice(s)` },
        { status: 409 }
      );
    }
    
    // Soft delete customer
    const deleteQuery = `
      UPDATE customers 
      SET is_deleted = true, deleted_at = CURRENT_TIMESTAMP 
      WHERE id = $1 AND is_deleted = false AND user_id = $2
      RETURNING id
    `;
    
    const deleteResult = await query(deleteQuery, [id, userId]);
    
    if (deleteResult.rows.length === 0) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (err: any) {
    console.error(`[customers/${id}] DELETE error:`, err);
    return NextResponse.json(
      { error: err.message || 'Failed to delete customer' },
      { status: 500 }
    );
  }
}

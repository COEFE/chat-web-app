import { NextRequest } from 'next/server';
import { query } from '@/lib/db';
import { getAuth } from '@/lib/firebaseAdmin';

// GET - List all customers
export async function GET(req: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAuth();
    await auth.verifyIdToken(token);
    
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    
    // Build SQL query based on parameters
    let customersQuery = `
      SELECT * FROM customers 
      WHERE is_deleted = false
    `;
    
    const queryParams: any[] = [];
    
    if (search) {
      customersQuery += ` AND name ILIKE $${queryParams.length + 1}`;
      queryParams.push(`%${search}%`);
    }
    
    customersQuery += ` ORDER BY name ASC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limit, offset);
    
    // Count total for pagination
    let countQuery = `
      SELECT COUNT(*) FROM customers 
      WHERE is_deleted = false
    `;
    
    if (search) {
      countQuery += ` AND name ILIKE $1`;
    }
    
    // Execute queries
    const [customersResult, countResult] = await Promise.all([
      query(customersQuery, queryParams),
      query(countQuery, search ? [`%${search}%`] : [])
    ]);
    
    const customers = customersResult.rows;
    const totalCount = parseInt(countResult.rows[0].count);
    
    // Return paginated response
    return new Response(
      JSON.stringify({
        customers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    return new Response(
      JSON.stringify({ error: 'Error fetching customers', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST - Create a new customer
export async function POST(req: NextRequest) {
  try {
    // Verify Firebase ID token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAuth();
    await auth.verifyIdToken(token);
    
    // Parse request body
    const body = await req.json();
    const {
      name,
      contact_person,
      email,
      phone,
      billing_address,
      shipping_address,
      default_revenue_account_id
    } = body;
    
    // Validate required fields
    if (!name) {
      return new Response(
        JSON.stringify({ error: 'Customer name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Insert customer record
    const insertQuery = `
      INSERT INTO customers (
        name, contact_person, email, phone, billing_address, 
        shipping_address, default_revenue_account_id
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await query(insertQuery, [
      name,
      contact_person || null,
      email || null, 
      phone || null,
      billing_address || null,
      shipping_address || null,
      default_revenue_account_id || null
    ]);
    
    // Return the created customer record
    return new Response(
      JSON.stringify({ customer: result.rows[0] }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error creating customer:', error);
    return new Response(
      JSON.stringify({ error: 'Error creating customer', details: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

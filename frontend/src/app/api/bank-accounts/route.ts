import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/bank-accounts - List all bank accounts
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Parse query parameters for filtering and pagination
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Check if we should include inactive accounts
    const includeInactive = searchParams.get('includeInactive') === 'true';
    
    // Build query based on filters
    let bankAccountsQuery = `
      SELECT 
        ba.*,
        a.name as gl_account_name,
        a.account_code as gl_account_code
      FROM 
        bank_accounts ba
        JOIN accounts a ON ba.gl_account_id = a.id
      WHERE 
        ba.is_deleted = false
        AND ba.user_id = $3
    `;
    
    // Only show active accounts unless explicitly asked for all
    if (!includeInactive) {
      bankAccountsQuery += ` AND ba.is_active = true`;
    }
    
    // Add sorting and pagination
    bankAccountsQuery += `
      ORDER BY ba.name ASC
      LIMIT $1 OFFSET $2
    `;
    
    // Count total for pagination
    let countQuery = `
      SELECT COUNT(*) FROM bank_accounts ba WHERE ba.is_deleted = false AND ba.user_id = $1
    `;
    
    if (!includeInactive) {
      countQuery += ` AND ba.is_active = true`;
    }
    
    // Log the user filtering for audit purposes
    console.log(`[bank-accounts] Fetching accounts for user: ${userId}`);
    
    // Execute queries with user ID filtering for data privacy
    const [bankAccountsResult, countResult] = await Promise.all([
      query(bankAccountsQuery, [limit, offset, userId]),
      query(countQuery, [userId])
    ]);
    
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    
    return NextResponse.json({
      bankAccounts: bankAccountsResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        pageSize: limit
      }
    });
  } catch (err) {
    console.error('Error fetching bank accounts:', err);
    return NextResponse.json(
      { error: 'Failed to fetch bank accounts' },
      { status: 500 }
    );
  }
}

// POST /api/bank-accounts - Create a new bank account
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
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
    
    // Insert the new bank account - use a more resilient approach with explicit column selection
    const insertQuery = `
      INSERT INTO bank_accounts (
        name, 
        account_number, 
        routing_number, 
        institution_name, 
        gl_account_id, 
        is_active,
        user_id,
        created_at,
        updated_at
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const result = await query(insertQuery, [
      body.name,
      body.account_number,
      body.routing_number || null,
      body.institution_name,
      body.gl_account_id,
      body.is_active !== undefined ? body.is_active : true,
      userId // Include the authenticated user's ID
    ]);
    
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating bank account:', err);
    // Return more detailed error information
    return NextResponse.json(
      { error: 'Failed to create bank account', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

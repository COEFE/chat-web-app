import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { query } from '@/lib/db';

// GET /api/bank-accounts/[id]/transactions - Get all transactions for a bank account
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Extract bank account ID from URL
    const pathParts = req.nextUrl.pathname.split('/');
    const bankAccountId = parseInt(pathParts[pathParts.indexOf('bank-accounts') + 1], 10);
    
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if bank account exists
    const bankAccountCheck = await query(
      'SELECT id FROM bank_accounts WHERE id = $1 AND is_deleted = false',
      [bankAccountId]
    );
    
    if (bankAccountCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    // Parse query parameters
    const searchParams = req.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Get filter parameters
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const searchTerm = searchParams.get('search');
    
    // Build transaction query
    let transactionsQuery = `
      SELECT *
      FROM bank_transactions
      WHERE bank_account_id = $1 AND is_deleted = false
    `;
    
    let queryParams: any[] = [bankAccountId];
    let paramIndex = 2;
    
    // Add filters
    if (startDate) {
      transactionsQuery += ` AND transaction_date >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      transactionsQuery += ` AND transaction_date <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }
    
    if (status) {
      transactionsQuery += ` AND status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }
    
    if (searchTerm) {
      transactionsQuery += ` AND (description ILIKE $${paramIndex} OR reference_number ILIKE $${paramIndex} OR check_number ILIKE $${paramIndex})`;
      queryParams.push(`%${searchTerm}%`);
      paramIndex++;
    }
    
    // Add sorting and pagination
    transactionsQuery += `
      ORDER BY transaction_date DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    
    // Count query for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM bank_transactions
      WHERE bank_account_id = $1 AND is_deleted = false
    `;
    
    let countParams: any[] = [bankAccountId];
    let countParamIndex = 2;
    
    // Apply the same filters to count query
    if (startDate) {
      countQuery += ` AND transaction_date >= $${countParamIndex}`;
      countParams.push(startDate);
      countParamIndex++;
    }
    
    if (endDate) {
      countQuery += ` AND transaction_date <= $${countParamIndex}`;
      countParams.push(endDate);
      countParamIndex++;
    }
    
    if (status) {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
      countParamIndex++;
    }
    
    if (searchTerm) {
      countQuery += ` AND (description ILIKE $${countParamIndex} OR reference_number ILIKE $${countParamIndex} OR check_number ILIKE $${countParamIndex})`;
      countParams.push(`%${searchTerm}%`);
    }
    
    // Execute queries
    const [transactionsResult, countResult] = await Promise.all([
      query(transactionsQuery, queryParams),
      query(countQuery, countParams)
    ]);
    
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    
    return NextResponse.json({
      transactions: transactionsResult.rows,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        pageSize: limit
      }
    });
  } catch (err) {
    console.error('Error fetching bank transactions:', err);
    return NextResponse.json(
      { error: 'Failed to fetch bank transactions' },
      { status: 500 }
    );
  }
}

// POST /api/bank-accounts/[id]/transactions - Manually add a transaction to a bank account
export async function POST(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // Extract bank account ID from URL
    const pathParts = req.nextUrl.pathname.split('/');
    const bankAccountId = parseInt(pathParts[pathParts.indexOf('bank-accounts') + 1], 10);
    
    if (isNaN(bankAccountId)) {
      return NextResponse.json({ error: 'Invalid bank account ID' }, { status: 400 });
    }

    // Check if bank account exists
    const bankAccountCheck = await query(
      'SELECT id FROM bank_accounts WHERE id = $1 AND is_deleted = false',
      [bankAccountId]
    );
    
    if (bankAccountCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Bank account not found' }, { status: 404 });
    }
    
    const body = await req.json();
    
    // Validate required fields
    if (!body.transaction_date) {
      return NextResponse.json({ error: 'Transaction date is required' }, { status: 400 });
    }
    
    if (!body.description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    
    if (isNaN(parseFloat(body.amount)) || parseFloat(body.amount) <= 0) {
      return NextResponse.json({ error: 'Valid positive amount is required' }, { status: 400 });
    }
    
    if (!['credit', 'debit'].includes(body.transaction_type)) {
      return NextResponse.json({ error: 'Transaction type must be credit or debit' }, { status: 400 });
    }
    
    // Insert the transaction
    const insertQuery = `
      INSERT INTO bank_transactions (
        bank_account_id,
        transaction_date,
        post_date,
        description,
        amount,
        transaction_type,
        status,
        reference_number,
        check_number,
        notes
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const result = await query(insertQuery, [
      bankAccountId,
      body.transaction_date,
      body.post_date || body.transaction_date,
      body.description,
      parseFloat(body.amount),
      body.transaction_type,
      body.status || 'unmatched',
      body.reference_number || null,
      body.check_number || null,
      body.notes || null
    ]);
    
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding bank transaction:', err);
    return NextResponse.json(
      { error: 'Failed to add bank transaction' },
      { status: 500 }
    );
  }
}

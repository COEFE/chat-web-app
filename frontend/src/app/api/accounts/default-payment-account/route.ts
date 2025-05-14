import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';
import { logAuditEvent } from '@/lib/auditLogger';

/**
 * GET /api/accounts/default-payment-account
 * Get or create a default payment account for the user
 */
export async function GET(request: Request) {
  try {
    // Verify user is authenticated
    const { userId, error } = await authenticateRequest(request);
    if (error) {
      console.log('[Default Payment Account API] Authentication failed');
      return error;
    }
    
    console.log('[Default Payment Account API] Authenticated user:', userId);

    // First try to find an existing bank account
    const bankAccountQuery = `
      SELECT id, name, account_type, code
      FROM accounts
      WHERE account_type = 'bank'
      AND user_id = $1
      AND is_deleted = false
      LIMIT 1
    `;
    
    const bankResult = await sql.query(bankAccountQuery, [userId]);
    
    if (bankResult.rows.length > 0) {
      console.log('[Default Payment Account API] Found existing bank account:', bankResult.rows[0].name);
      return NextResponse.json({
        success: true,
        account: bankResult.rows[0],
        message: 'Found existing bank account'
      });
    }
    
    // If no bank account, try to find a cash account
    const cashAccountQuery = `
      SELECT id, name, account_type, code
      FROM accounts
      WHERE account_type = 'cash'
      AND user_id = $1
      AND is_deleted = false
      LIMIT 1
    `;
    
    const cashResult = await sql.query(cashAccountQuery, [userId]);
    
    if (cashResult.rows.length > 0) {
      console.log('[Default Payment Account API] Found existing cash account:', cashResult.rows[0].name);
      return NextResponse.json({
        success: true,
        account: cashResult.rows[0],
        message: 'Found existing cash account'
      });
    }
    
    // If no cash or bank account, create a new bank account
    console.log('[Default Payment Account API] No existing payment account found, creating a new one');
    
    // Start a transaction
    await sql.query('BEGIN');
    
    try {
      // Check if we need to create a parent asset account first
      const assetAccountQuery = `
        SELECT id FROM accounts
        WHERE account_type = 'asset'
        AND user_id = $1
        AND is_deleted = false
        LIMIT 1
      `;
      
      const assetResult = await sql.query(assetAccountQuery, [userId]);
      let assetAccountId = null;
      
      if (assetResult.rows.length === 0) {
        // Create a parent asset account
        const createAssetQuery = `
          INSERT INTO accounts (
            code, name, account_type, is_custom, user_id
          ) VALUES (
            '1000', 'Assets', 'asset', true, $1
          ) RETURNING id
        `;
        
        const assetCreateResult = await sql.query(createAssetQuery, [userId]);
        assetAccountId = assetCreateResult.rows[0].id;
        console.log('[Default Payment Account API] Created parent asset account with ID:', assetAccountId);
      } else {
        assetAccountId = assetResult.rows[0].id;
      }
      
      // Create the bank account
      const createBankQuery = `
        INSERT INTO accounts (
          code, name, account_type, is_custom, user_id, parent_id
        ) VALUES (
          '1100', 'Bank Account', 'bank', true, $1, $2
        ) RETURNING id, name, account_type, code
      `;
      
      const bankCreateResult = await sql.query(createBankQuery, [userId, assetAccountId]);
      const newBankAccount = bankCreateResult.rows[0];
      
      // Commit the transaction
      await sql.query('COMMIT');
      
      // Log audit event
      await logAuditEvent({
        user_id: userId,
        action_type: 'ACCOUNT_CREATED',
        entity_type: 'ACCOUNT',
        entity_id: String(newBankAccount.id),
        context: {
          account_name: newBankAccount.name,
          account_type: newBankAccount.account_type,
          is_default_payment: true
        },
        status: 'SUCCESS',
        timestamp: new Date().toISOString()
      });
      
      console.log('[Default Payment Account API] Created new bank account:', newBankAccount.name);
      
      return NextResponse.json({
        success: true,
        account: newBankAccount,
        message: 'Created new default bank account'
      });
    } catch (txError) {
      // Rollback the transaction on error
      await sql.query('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('[Default Payment Account API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to get or create default payment account',
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

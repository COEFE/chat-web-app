import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

/**
 * API endpoint to fix the user_id in bill_credits table
 * This updates any bill credits with user_id = '0' to use the authenticated user's ID
 */
export async function GET(req: NextRequest) {
  // Authenticate the request
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    console.log(`[fixBillCreditUserId] Updating bill credits with user_id = '0' to use user_id = '${userId}'`);
    
    // First, check if there are any bill credits with user_id = '0'
    const checkResult = await sql`
      SELECT COUNT(*) as count
      FROM bill_credits
      WHERE user_id = '0'
    `;
    
    const count = parseInt(checkResult.rows[0].count);
    console.log(`[fixBillCreditUserId] Found ${count} bill credits with user_id = '0'`);
    
    if (count > 0) {
      // Update the bill credits
      const updateResult = await sql`
        UPDATE bill_credits
        SET user_id = ${userId}
        WHERE user_id = '0'
        RETURNING id
      `;
      
      console.log(`[fixBillCreditUserId] Updated ${updateResult.rows.length} bill credits`);
      console.log(`[fixBillCreditUserId] Updated bill credit IDs:`, updateResult.rows.map(row => row.id));
      
      return NextResponse.json({
        success: true,
        message: `Updated ${updateResult.rows.length} bill credits`,
        updatedIds: updateResult.rows.map(row => row.id)
      });
    } else {
      return NextResponse.json({
        success: true,
        message: 'No bill credits with user_id = 0 found'
      });
    }
  } catch (error: any) {
    console.error('[fixBillCreditUserId] Error updating bill credits:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}

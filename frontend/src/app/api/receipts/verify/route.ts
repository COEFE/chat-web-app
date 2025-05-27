import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    console.log('[Receipts Verify] Checking receipt embeddings table...');
    
    // Check if the table exists and get some basic info
    const tableInfo = await sql`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'receipt_embeddings' 
      ORDER BY ordinal_position
    `;
    
    const recordCount = await sql`
      SELECT COUNT(*) as count FROM receipt_embeddings
    `;
    
    return NextResponse.json({ 
      success: true, 
      message: 'Receipt embeddings table verified',
      tableExists: tableInfo.rows.length > 0,
      columns: tableInfo.rows,
      recordCount: recordCount.rows[0]?.count || 0
    });
    
  } catch (error) {
    console.error('[Receipts Verify] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to verify receipt embeddings table',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

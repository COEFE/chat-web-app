import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET(request: NextRequest) {
  try {
    console.log('[Database Tables] Fetching table information...');
    
    // Get all tables in the database
    const tablesResult = await sql`
      SELECT 
        table_name,
        table_type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    const tables = [];
    
    // For each table, get column information
    for (const table of tablesResult.rows) {
      const columnsResult = await sql`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = ${table.table_name}
        ORDER BY ordinal_position;
      `;
      
      // Get row count
      let rowCount = 0;
      try {
        const countResult = await sql.query(`SELECT COUNT(*) as count FROM "${table.table_name}"`);
        rowCount = parseInt(countResult.rows[0].count);
      } catch (countError) {
        console.warn(`Could not get row count for ${table.table_name}:`, countError);
      }
      
      tables.push({
        name: table.table_name,
        type: table.table_type,
        columns: columnsResult.rows,
        rowCount
      });
    }
    
    console.log(`[Database Tables] Found ${tables.length} tables`);
    
    return NextResponse.json({ 
      success: true, 
      tables,
      totalTables: tables.length
    });
    
  } catch (error) {
    console.error('[Database Tables] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch table information',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, 
      { status: 500 }
    );
  }
}

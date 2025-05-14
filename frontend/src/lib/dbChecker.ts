import { sql } from '@vercel/postgres';

export async function checkDatabaseStructure() {
  try {
    // Check tables in the database
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    
    console.log('=== Available Tables ===');
    tablesResult.rows.forEach(row => {
      console.log(row.table_name);
    });
    
    // Try to find bills table structure
    try {
      const billsColumnsResult = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'bills'
        ORDER BY ordinal_position;
      `;
      
      console.log('\n=== Bills Table Structure ===');
      billsColumnsResult.rows.forEach(row => {
        console.log(`${row.column_name}: ${row.data_type}`);
      });
    } catch (error) {
      console.error('Error checking bills table:', error);
    }
    
    // Check if there are any accounts_payable related tables
    const apTablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name LIKE '%payable%'
      ORDER BY table_name;
    `;
    
    console.log('\n=== AP Related Tables ===');
    apTablesResult.rows.forEach(row => {
      console.log(row.table_name);
    });
    
    return {
      success: true,
      tables: tablesResult.rows,
      apTables: apTablesResult.rows
    };
  } catch (error) {
    console.error('Error checking database structure:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function GET() {
  try {
    console.log('[Bill Lines Setup] Diagnosing bill_lines table and expense account IDs');
    
    const result = {
      billLinesStructure: null as any,
      validExpenseAccounts: [] as any[],
      foreignKeyInfo: null as any,
      testInsertResult: null as any,
    };
    
    // Check bill_lines table structure
    try {
      const columnsResult = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'bill_lines'
        ORDER BY ordinal_position
      `;
      
      result.billLinesStructure = columnsResult.rows;
      console.log('[Bill Lines Setup] Bill lines structure:', columnsResult.rows);
    } catch (structureError) {
      console.log('[Bill Lines Setup] Error checking bill_lines structure:', structureError);
    }
    
    // Check foreign key constraints for bill_lines
    try {
      const constraintResult = await sql`
        SELECT
          tc.constraint_name,
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM
          information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE
          tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = 'bill_lines'
      `;
      
      result.foreignKeyInfo = constraintResult.rows;
      console.log('[Bill Lines Setup] Foreign key constraints:', constraintResult.rows);
      
      // Find the target table for expense_account_id
      const expenseAccountConstraint = constraintResult.rows.find(row => 
        row.column_name === 'expense_account_id'
      );
      
      if (expenseAccountConstraint) {
        const targetTable = expenseAccountConstraint.foreign_table_name;
        const targetColumn = expenseAccountConstraint.foreign_column_name;
        
        console.log(`[Bill Lines Setup] Found expense_account_id references ${targetTable}.${targetColumn}`);
        
        // Get valid IDs from the referenced table
        const validIdsResult = await sql.query(
          `SELECT ${targetColumn} FROM "${targetTable}" LIMIT 10`
        );
        
        result.validExpenseAccounts = validIdsResult.rows.map(row => ({
          id: row[targetColumn],
          source: targetTable
        }));
        
        console.log('[Bill Lines Setup] Valid expense account IDs:', result.validExpenseAccounts);
        
        // Try to create a test bill line with the first valid ID
        if (result.validExpenseAccounts.length > 0) {
          try {
            const testId = result.validExpenseAccounts[0].id;
            // Just check if this would work, don't actually insert
            // Use a raw query since we need to use dynamic table and column names
            const insertCheckResult = await sql.query(
              `SELECT $1::text AS id
              WHERE EXISTS (
                SELECT 1 
                FROM "${targetTable}" 
                WHERE "${targetColumn}" = $1
              )`,
              [testId]
            );
            
            result.testInsertResult = {
              success: insertCheckResult.rows.length > 0,
              message: insertCheckResult.rows.length > 0 
                ? `Confirmed ID ${testId} is valid for ${targetTable}.${targetColumn}` 
                : `ID ${testId} not found in ${targetTable}.${targetColumn}`
            };
            
            console.log('[Bill Lines Setup] Test result:', result.testInsertResult);
          } catch (testError) {
            console.log('[Bill Lines Setup] Error testing ID:', testError);
            result.testInsertResult = {
              success: false,
              error: testError instanceof Error ? testError.message : String(testError)
            };
          }
        }
      }
    } catch (constraintError) {
      console.log('[Bill Lines Setup] Error checking constraints:', constraintError);
    }
    
    return NextResponse.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[Bill Lines Setup] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }, 
      { status: 500 }
    );
  }
}

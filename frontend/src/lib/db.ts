import { sql } from '@vercel/postgres';

/**
 * Execute a database query with parameters
 * 
 * @param text SQL query text with parameterized values ($1, $2, etc.)
 * @param params Array of parameter values
 * @returns Query result
 */
export async function query(text: string, params?: any[]) {
  try {
    const result = await sql.query(text, params || []);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

/**
 * Execute a transaction with multiple queries
 * 
 * @param queries Array of query objects with text and params
 * @returns Array of query results
 */
export async function transaction(queries: { text: string; params?: any[] }[]) {
  try {
    await sql.query('BEGIN');
    
    const results = [];
    for (const query of queries) {
      const result = await sql.query(query.text, query.params || []);
      results.push(result);
    }
    
    await sql.query('COMMIT');
    return results;
  } catch (error) {
    await sql.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  }
}

/**
 * Verify database connection
 * 
 * @returns Boolean indicating if connection is successful
 */
/**
 * Execute a raw SQL script (useful for migrations)
 * 
 * @param sqlScript Complete SQL script to execute
 * @returns Result of execution
 */
export async function executeQuery(sqlScript: string) {
  try {
    // For raw scripts, use direct execution
    const result = await sql.query(sqlScript);
    return result;
  } catch (error) {
    console.error('SQL script execution error:', error);
    throw error;
  }
}

/**
 * Verify database connection
 * 
 * @returns Boolean indicating if connection is successful
 */
export async function testConnection() {
  try {
    await sql.query('SELECT NOW()');
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

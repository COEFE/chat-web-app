/**
 * Helper function to generate a unique 5-digit numeric credit card account code
 * This replaces the old "CC" + random number format with proper 5-digit codes
 */
export async function generateCreditCardAccountCode(): Promise<string> {
  const { sql } = await import('@vercel/postgres');
  
  // Get the highest existing credit card account code in the liability range
  const result = await sql`
    SELECT code FROM accounts 
    WHERE account_type IN ('credit_card', 'liability') 
    AND code ~ '^[0-9]+$'
    AND CAST(code AS INTEGER) BETWEEN 20000 AND 29999
    ORDER BY CAST(code AS INTEGER) DESC
    LIMIT 1
  `;

  let nextCode = 20000; // Start of liability account range
  
  if (result.rows.length > 0) {
    const lastCode = parseInt(result.rows[0].code);
    nextCode = lastCode + 1;
    
    // If we've exceeded the liability range, wrap around or use a different strategy
    if (nextCode > 29999) {
      // Find the first available code in the range
      const allCodesResult = await sql`
        SELECT code FROM accounts 
        WHERE account_type IN ('credit_card', 'liability') 
        AND code ~ '^[0-9]+$'
        AND CAST(code AS INTEGER) BETWEEN 20000 AND 29999
        ORDER BY CAST(code AS INTEGER) ASC
      `;
      
      const existingCodes = allCodesResult.rows.map(row => parseInt(row.code));
      
      // Find first gap in the sequence
      for (let i = 20000; i <= 29999; i++) {
        if (!existingCodes.includes(i)) {
          nextCode = i;
          break;
        }
      }
      
      // If no gaps found, use 30000+ range (equity range start)
      if (nextCode > 29999) {
        nextCode = 30000;
      }
    }
  }

  return nextCode.toString().padStart(5, '0');
}

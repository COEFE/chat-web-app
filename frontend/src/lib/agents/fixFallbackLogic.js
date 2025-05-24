/**
 * Fix the fallback logic in creditCardAgent.ts
 * The issue is using 'return' inside forEach doesn't skip the iteration properly
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixFallbackLogic() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix the forEach logic to properly skip the id column
    const fallbackLogicPattern = /requiredColumns\.forEach\(\(value, column\) => \{\s*if \(!fallbackColumns\.includes\(column\)\) \{\s*fallbackColumns\.push\(column\);\s*\/\/ Provide appropriate default values based on column name[\s\S]*?if \(column === 'id'\) \{\s*\/\/ Skip id column in fallback as it should be auto-generated\s*return;\s*\}/g;
    
    const improvedFallbackLogic = `requiredColumns.forEach((value, column) => {
              if (!fallbackColumns.includes(column)) {
                // Skip id column as it should be auto-generated
                if (column === 'id') {
                  return;
                }
                
                fallbackColumns.push(column);
                
                // Provide appropriate default values based on column name
                if (column === 'date' || column.includes('date')) {
                  fallbackValues.push(transaction.date || new Date().toISOString().split('T')[0]);
                } else if (column === 'amount') {
                  fallbackValues.push(String(Math.abs(transaction.amount) || 0));
                } else if (column === 'debit_amount' || column.includes('debit')) {
                  fallbackValues.push(String(Math.abs(transaction.amount) || 0));
                } else if (column === 'credit_amount' || column.includes('credit')) {
                  fallbackValues.push(String(Math.abs(transaction.amount) || 0));
                } else if (column === 'is_posted') {
                  fallbackValues.push('true');
                } else if (column === 'journal_type') {
                  fallbackValues.push('CCY');
                } else {
                  // String default for other columns
                  fallbackValues.push('');
                }`;
    
    // Apply the fix
    const fixedContent = content.replace(fallbackLogicPattern, improvedFallbackLogic);
    
    if (fixedContent !== content) {
      fs.writeFileSync(filePath, fixedContent, 'utf8');
      console.log('✅ Successfully fixed fallback logic');
      return {
        success: true,
        message: 'Fallback logic fixed',
        fixesApplied: 1
      };
    } else {
      // Try a simpler approach - just fix the return statement position
      const simplePattern = /if \(column === 'id'\) \{\s*\/\/ Skip id column in fallback as it should be auto-generated\s*return;\s*\}/g;
      
      const simpleFixedContent = content.replace(simplePattern, `if (column === 'id') {
                  // Skip id column in fallback as it should be auto-generated
                  return;
                }
                
                fallbackColumns.push(column);
                
                // Provide appropriate default values based on column name`);
      
      if (simpleFixedContent !== content) {
        fs.writeFileSync(filePath, simpleFixedContent, 'utf8');
        console.log('✅ Successfully applied simple fallback fix');
        return {
          success: true,
          message: 'Simple fallback fix applied',
          fixesApplied: 1
        };
      } else {
        console.log('ℹ️  No fallback logic issues found to fix');
        return {
          success: true,
          message: 'No fixes needed',
          fixesApplied: 0
        };
      }
    }
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
const result = fixFallbackLogic();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixFallbackLogic };

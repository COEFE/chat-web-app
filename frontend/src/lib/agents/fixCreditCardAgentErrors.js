/**
 * Fix script for credit card agent errors:
 * 1. Fix placeholder syntax error for is_posted column
 * 2. Fix fallback logic to handle different column types properly
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixCreditCardAgentErrors() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix 1: Fix the placeholder syntax error for is_posted column
    // Look for the line with missing $ in placeholder
    const placeholderFix = content.replace(
      /placeholders\.push\(`\$\{paramIndex\+\+\}`\);/g,
      'placeholders.push(`$${paramIndex++}`);'
    );
    
    if (placeholderFix !== content) {
      console.log('✅ Fixed placeholder syntax error');
      content = placeholderFix;
    }
    
    // Fix 2: Improve fallback logic to handle different column types
    const fallbackLogicPattern = /(\s+)\/\/ Generic default for other required columns\s+fallbackValues\.push\(''\);/g;
    
    const improvedFallbackLogic = `$1// Generic default for other required columns based on type
$1if (column === 'id') {
$1  // Skip id column in fallback as it should be auto-generated
$1  return;
$1} else if (column.includes('amount') || column.includes('price')) {
$1  fallbackValues.push('0');
$1} else if (column.includes('date')) {
$1  fallbackValues.push(transaction.date || new Date().toISOString().split('T')[0]);
$1} else if (column === 'is_posted') {
$1  fallbackValues.push('true');
$1} else if (column === 'journal_type') {
$1  fallbackValues.push('CCY');
$1} else {
$1  // String default for other columns
$1  fallbackValues.push('');
$1}`;
    
    const fallbackFixed = content.replace(fallbackLogicPattern, improvedFallbackLogic);
    
    if (fallbackFixed !== content) {
      console.log('✅ Fixed fallback logic for different column types');
      content = fallbackFixed;
    }
    
    // Fix 3: Ensure we don't include 'id' column in the fallback required columns
    const idColumnFix = content.replace(
      /requiredColumns\.forEach\(\(column\) => \{/g,
      `requiredColumns.forEach((column) => {
        // Skip id column as it should be auto-generated
        if (column === 'id') return;`
    );
    
    if (idColumnFix !== content) {
      console.log('✅ Fixed id column handling in fallback');
      content = idColumnFix;
    }
    
    // Write the fixed content back
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Successfully applied all fixes to creditCardAgent.ts');
    
    return {
      success: true,
      message: 'All fixes applied successfully'
    };
    
  } catch (error) {
    console.error('❌ Error applying fixes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
const result = fixCreditCardAgentErrors();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixCreditCardAgentErrors };

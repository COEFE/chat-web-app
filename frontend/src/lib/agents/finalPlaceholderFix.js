/**
 * Final fix for placeholder syntax - direct string replacement
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function finalPlaceholderFix() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Direct string replacement for the specific problematic lines
    const originalContent = content;
    
    // Replace the specific patterns that are causing issues
    content = content.replace(
      /placeholders\.push\(`\$\{paramIndex\+\+\}`\);/g,
      'placeholders.push(`$${paramIndex++}`);'
    );
    
    // Also fix any instances where the $ is missing entirely
    content = content.replace(
      /placeholders\.push\(`\{paramIndex\+\+\}`\);/g,
      'placeholders.push(`$${paramIndex++}`);'
    );
    
    const changesMade = content !== originalContent;
    
    if (changesMade) {
      // Write the fixed content back
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('✅ Successfully applied placeholder fixes');
    } else {
      console.log('ℹ️  No placeholder syntax issues found to fix');
    }
    
    return {
      success: true,
      message: changesMade ? 'Fixes applied' : 'No fixes needed',
      changesMade
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
const result = finalPlaceholderFix();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { finalPlaceholderFix };

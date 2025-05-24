/**
 * Final fix for placeholder syntax in creditCardAgent.ts
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixPlaceholderSyntax() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Fix the specific lines that have incorrect placeholder syntax
    // Line 2668 and 2675 need to have $ added to the placeholder
    const fixes = [
      {
        search: "placeholders.push(`${paramIndex++}`);",
        replace: "placeholders.push(`$${paramIndex++}`);"
      }
    ];
    
    let fixesApplied = 0;
    
    fixes.forEach((fix, index) => {
      const beforeCount = (content.match(new RegExp(fix.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      content = content.replace(new RegExp(fix.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fix.replace);
      const afterCount = (content.match(new RegExp(fix.replace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      
      if (beforeCount > 0) {
        console.log(`✅ Fix ${index + 1}: Replaced ${beforeCount} occurrence(s) of placeholder syntax`);
        fixesApplied++;
      }
    });
    
    // Write the fixed content back
    fs.writeFileSync(filePath, content, 'utf8');
    
    if (fixesApplied > 0) {
      console.log(`✅ Successfully applied ${fixesApplied} fixes to creditCardAgent.ts`);
    } else {
      console.log('ℹ️  No placeholder syntax issues found to fix');
    }
    
    return {
      success: true,
      message: `Applied ${fixesApplied} fixes`,
      fixesApplied
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
const result = fixPlaceholderSyntax();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixPlaceholderSyntax };

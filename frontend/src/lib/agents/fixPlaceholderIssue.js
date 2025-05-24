/**
 * Fix the specific placeholder issue in creditCardAgent.ts
 * The issue is that placeholders.push(`${paramIndex++}`) should be placeholders.push(`$${paramIndex++}`)
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixPlaceholderIssue() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Split into lines for precise fixing
    const lines = content.split('\n');
    let fixesApplied = 0;
    
    // Find and fix lines that have the placeholder issue
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for the specific pattern that's causing the issue
      if (line.includes('placeholders.push(`${paramIndex++}`)')) {
        const originalLine = line;
        lines[i] = line.replace(
          'placeholders.push(`${paramIndex++}`)',
          'placeholders.push(`$${paramIndex++}`)'
        );
        console.log(`✅ Fixed line ${i + 1}:`);
        console.log(`   Before: ${originalLine.trim()}`);
        console.log(`   After:  ${lines[i].trim()}`);
        fixesApplied++;
      }
    }
    
    // Also check for any fallback logic issues
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Fix the fallback query construction to skip id column properly
      if (line.includes('requiredColumns.forEach((column) => {')) {
        // Look for the next few lines to see if we need to add the id skip logic
        let foundIdSkip = false;
        for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].includes('if (column === \'id\')') || lines[j].includes('Skip id column')) {
            foundIdSkip = true;
            break;
          }
        }
        
        if (!foundIdSkip) {
          // Add the id skip logic right after the forEach line
          const indentation = line.match(/^(\s*)/)[1] + '  '; // Match indentation and add 2 more spaces
          lines.splice(i + 1, 0, `${indentation}// Skip id column as it should be auto-generated`);
          lines.splice(i + 2, 0, `${indentation}if (column === 'id') return;`);
          lines.splice(i + 3, 0, '');
          console.log(`✅ Added id column skip logic at line ${i + 2}`);
          fixesApplied++;
          break; // Only fix the first occurrence
        }
      }
    }
    
    // Join lines back together
    const fixedContent = lines.join('\n');
    
    // Write the fixed content back
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    
    console.log(`\n✅ Successfully applied ${fixesApplied} fixes to creditCardAgent.ts`);
    
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
const result = fixPlaceholderIssue();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixPlaceholderIssue };

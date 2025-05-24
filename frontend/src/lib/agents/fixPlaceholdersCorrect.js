/**
 * Fix the exact placeholder lines based on grep results
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixPlaceholdersCorrect() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Split into lines for precise fixing
    const lines = content.split('\n');
    let fixesApplied = 0;
    
    // Based on grep results, lines 2669 and 2676 need fixing
    const linesToFix = [2669, 2676]; // 1-indexed line numbers from grep
    
    linesToFix.forEach(lineNum => {
      const index = lineNum - 1; // Convert to 0-indexed
      if (index < lines.length) {
        const originalLine = lines[index];
        console.log(`Checking line ${lineNum}: ${originalLine.trim()}`);
        
        if (originalLine.includes('placeholders.push(`${paramIndex++}`)')) {
          lines[index] = originalLine.replace(
            'placeholders.push(`${paramIndex++}`)',
            'placeholders.push(`$${paramIndex++}`)'
          );
          console.log(`✅ Fixed line ${lineNum}: ${originalLine.trim()} -> ${lines[index].trim()}`);
          fixesApplied++;
        } else {
          console.log(`Line ${lineNum} doesn't match expected pattern`);
        }
      }
    });
    
    // Join lines back together
    const fixedContent = lines.join('\n');
    
    // Write the fixed content back
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    
    console.log(`✅ Successfully applied ${fixesApplied} placeholder fixes`);
    
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
const result = fixPlaceholdersCorrect();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixPlaceholdersCorrect };

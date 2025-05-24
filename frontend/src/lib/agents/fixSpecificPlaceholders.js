/**
 * Fix specific placeholder lines in creditCardAgent.ts
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixSpecificPlaceholders() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Split into lines for precise fixing
    const lines = content.split('\n');
    let fixesApplied = 0;
    
    // Fix lines 2668 and 2675 (0-indexed, so 2667 and 2674)
    const linesToFix = [2668, 2675]; // 1-indexed line numbers
    
    linesToFix.forEach(lineNum => {
      const index = lineNum - 1; // Convert to 0-indexed
      if (index < lines.length) {
        const originalLine = lines[index];
        if (originalLine.includes('placeholders.push(`${paramIndex++}`)')) {
          lines[index] = originalLine.replace(
            'placeholders.push(`${paramIndex++}`)',
            'placeholders.push(`$${paramIndex++}`)'
          );
          console.log(`✅ Fixed line ${lineNum}: ${originalLine.trim()} -> ${lines[index].trim()}`);
          fixesApplied++;
        }
      }
    });
    
    // Join lines back together
    const fixedContent = lines.join('\n');
    
    // Write the fixed content back
    fs.writeFileSync(filePath, fixedContent, 'utf8');
    
    console.log(`✅ Successfully applied ${fixesApplied} specific placeholder fixes`);
    
    return {
      success: true,
      message: `Applied ${fixesApplied} specific fixes`,
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
const result = fixSpecificPlaceholders();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixSpecificPlaceholders };

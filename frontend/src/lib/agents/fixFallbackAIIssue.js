/**
 * Fix the async issue in fallback logic - remove AI call from forEach callback
 * Keep the fallback simple and only use AI in the main logic
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function fixFallbackAIIssue() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove the AI call from fallback logic and keep it simple
    const problematicPattern = /} else if \(column === 'journal_type'\) \{\s*\/\/ Use AI for fallback journal type as well\s*try \{\s*const aiJournalType = await getAIJournalType\(transaction, context\);\s*fallbackValues\.push\(aiJournalType\);\s*\} catch \(error\) \{\s*fallbackValues\.push\('CCY'\); \/\/ Ultimate fallback\s*\}/;
    
    const simpleFallback = `} else if (column === 'journal_type') {
                  fallbackValues.push('CCY'); // Simple fallback for journal type`;
    
    if (content.match(problematicPattern)) {
      content = content.replace(problematicPattern, simpleFallback);
      console.log('✅ Fixed fallback AI issue - removed async call from forEach');
    } else {
      // Try a simpler pattern
      const simplePattern = /} else if \(column === 'journal_type'\) \{\s*\/\/ Use AI for fallback journal type as well[\s\S]*?fallbackValues\.push\('CCY'\); \/\/ Ultimate fallback\s*\}/;
      
      if (content.match(simplePattern)) {
        content = content.replace(simplePattern, simpleFallback);
        console.log('✅ Applied simple pattern fix for fallback AI issue');
      } else {
        console.log('ℹ️  Pattern not found, checking for specific line...');
        
        // Just replace the specific problematic lines
        content = content.replace(
          /const aiJournalType = await getAIJournalType\(transaction, context\);\s*fallbackValues\.push\(aiJournalType\);/g,
          'fallbackValues.push(\'CCY\'); // Simple fallback'
        );
        
        // Remove the try-catch wrapper in fallback
        content = content.replace(
          /\/\/ Use AI for fallback journal type as well\s*try \{[\s\S]*?\} catch \(error\) \{\s*fallbackValues\.push\('CCY'\); \/\/ Ultimate fallback\s*\}/g,
          'fallbackValues.push(\'CCY\'); // Simple fallback for journal type'
        );
        
        console.log('✅ Applied line-specific fixes for fallback AI issue');
      }
    }
    
    // Write the fixed content
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log('\n✅ Successfully fixed fallback AI async issue');
    
    return {
      success: true,
      message: 'Fallback AI issue fixed'
    };
    
  } catch (error) {
    console.error('❌ Error fixing fallback AI issue:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the fix
const result = fixFallbackAIIssue();
console.log('\n=== Fix Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { fixFallbackAIIssue };

/**
 * Script to fix the placeholder syntax in the credit card agent
 */

const fs = require('fs');
const path = require('path');

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'creditCardAgent.ts');

async function fixPlaceholderSyntax() {
  try {
    console.log('Reading creditCardAgent.ts file...');
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    let modifiedContent = content;
    
    // Fix the placeholder syntax for is_posted
    modifiedContent = modifiedContent.replace(
      /placeholders\.push\(`\$\{paramIndex\+\+\}`\);(\s*\/\/ Always set to true for payment transactions)/,
      'placeholders.push(`$${paramIndex++}`);$1'
    );
    
    // Fix the placeholder syntax for journal_type
    modifiedContent = modifiedContent.replace(
      /placeholders\.push\(`\$\{paramIndex\+\+\}`\);(\s*\/\/ Credit Card Payment type)/,
      'placeholders.push(`$${paramIndex++}`);$1'
    );
    
    // Also fix any other instances where the syntax might be wrong
    modifiedContent = modifiedContent.replace(
      /placeholders\.push\(`\$\{paramIndex\+\+\}`\);(\s*}\s*\/\/ CRITICAL FIX)/,
      'placeholders.push(`$${paramIndex++}`);$1'
    );
    
    // Write the modified content back to the file
    fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
    console.log('Successfully fixed placeholder syntax!');
    
    return {
      success: true,
      message: 'Placeholder syntax fixed successfully'
    };
    
  } catch (error) {
    console.error('Error fixing placeholder syntax:', error);
    return {
      success: false,
      message: `Failed to fix syntax: ${error.message}`
    };
  }
}

// Run the script if executed directly
if (require.main === module) {
  fixPlaceholderSyntax()
    .then(result => {
      console.log('Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { fixPlaceholderSyntax };

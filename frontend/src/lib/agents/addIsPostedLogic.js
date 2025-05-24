/**
 * Script to add the is_posted and journal_type logic to the credit card agent
 */

const fs = require('fs');
const path = require('path');

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'creditCardAgent.ts');

async function addIsPostedLogic() {
  try {
    console.log('Reading creditCardAgent.ts file...');
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    let modifiedContent = content;
    
    // Find the exact location after the created_by logic and before "// Construct the SQL query dynamically"
    const insertPattern = /(\/\/ Add created_by if available or required\s*if \(hasCreatedBy \|\| requiredColumns\.has\('created_by'\)\) \{\s*columns\.push\('created_by'\);\s*values\.push\(context\.userId \|\| 'system'\);\s*placeholders\.push\(`\$\{paramIndex\+\+\}`\);\s*\}\s*)(\/\/ Construct the SQL query dynamically)/;
    
    const replacement = `$1
        // CRITICAL FIX: Add is_posted column for payment transactions
        if (hasIsPosted) {
          columns.push('is_posted');
          values.push(true); // Always set to true for payment transactions
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        // CRITICAL FIX: Add journal_type column for payment transactions
        if (hasJournalType && isPayment) {
          columns.push('journal_type');
          values.push('CCY'); // Credit Card Payment type
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        $2`;
    
    if (insertPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(insertPattern, replacement);
      console.log('Successfully added is_posted and journal_type logic');
    } else {
      console.log('Pattern not found, trying alternative approach...');
      
      // Alternative: look for the exact text pattern
      const altPattern = /(\s+}\s+)(\/\/ Construct the SQL query dynamically)/;
      const altReplacement = `$1
        // CRITICAL FIX: Add is_posted column for payment transactions
        if (hasIsPosted) {
          columns.push('is_posted');
          values.push(true); // Always set to true for payment transactions
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        // CRITICAL FIX: Add journal_type column for payment transactions
        if (hasJournalType && isPayment) {
          columns.push('journal_type');
          values.push('CCY'); // Credit Card Payment type
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        $2`;
      
      if (altPattern.test(modifiedContent)) {
        modifiedContent = modifiedContent.replace(altPattern, altReplacement);
        console.log('Successfully added is_posted and journal_type logic (alternative method)');
      } else {
        console.log('Could not find insertion point');
        return { success: false, message: 'Could not find insertion point' };
      }
    }
    
    // Write the modified content back to the file
    fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
    console.log('Successfully added is_posted logic to credit card agent!');
    
    return {
      success: true,
      message: 'is_posted logic added successfully'
    };
    
  } catch (error) {
    console.error('Error adding is_posted logic:', error);
    return {
      success: false,
      message: `Failed to add logic: ${error.message}`
    };
  }
}

// Run the script if executed directly
if (require.main === module) {
  addIsPostedLogic()
    .then(result => {
      console.log('Result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { addIsPostedLogic };

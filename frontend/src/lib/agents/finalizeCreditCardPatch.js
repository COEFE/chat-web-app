/**
 * Script to finalize the credit card agent patch by adding the missing variables and logic
 */

const fs = require('fs');
const path = require('path');

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'creditCardAgent.ts');

async function finalizeCreditCardPatch() {
  try {
    console.log('Reading creditCardAgent.ts file...');
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    let modifiedContent = content;
    
    // 1. Add the missing column variables after hasCreatedBy
    const hasCreatedByPattern = /const hasCreatedBy = columnsCheck\.rows\[0\]\.has_created_by;/;
    const newColumnVariables = `const hasCreatedBy = columnsCheck.rows[0].has_created_by;
        const hasIsPosted = columnsCheck.rows[0].has_is_posted;
        const hasJournalType = columnsCheck.rows[0].has_journal_type;`;
    
    if (hasCreatedByPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(hasCreatedByPattern, newColumnVariables);
      console.log('Added hasIsPosted and hasJournalType variables');
    }
    
    // 2. Update the console.log to include the new variables
    const consoleLogPattern = /console\.log\(`\[CreditCardAgent\] \[\$\{timestamp\}\] Journals table schema check:`, \{[\s\S]*?requiredColumns: Array\.from\(requiredColumns\.keys\(\)\)\s*\}\);/;
    const newConsoleLog = `console.log(\`[CreditCardAgent] [\${timestamp}] Journals table schema check:\`, {
          hasDate,
          hasTransactionDate,
          hasDescription,
          hasMemo,
          hasNotes,
          hasDebitAmount,
          hasCreditAmount,
          hasAmount,
          hasCreatedBy,
          hasIsPosted,
          hasJournalType,
          requiredColumns: Array.from(requiredColumns.keys())
        });`;
    
    if (consoleLogPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(consoleLogPattern, newConsoleLog);
      console.log('Updated console.log to include new variables');
    }
    
    // 3. Find the created_by section and add the is_posted and journal_type logic after it
    const createdByLogicPattern = /(\/\/ Add created_by if available or required\s*if \(hasCreatedBy \|\| requiredColumns\.has\('created_by'\)\) \{\s*columns\.push\('created_by'\);\s*values\.push\(context\.userId \|\| 'system'\);\s*placeholders\.push\(`\$\{paramIndex\+\+\}`\);\s*\})/;
    
    const createdByReplacement = `$1
        
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
        }`;
    
    if (createdByLogicPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(createdByLogicPattern, createdByReplacement);
      console.log('Added is_posted and journal_type logic after created_by section');
    } else {
      console.log('Could not find created_by pattern, trying alternative approach...');
      
      // Alternative: look for the line just before "// Construct the SQL query dynamically"
      const beforeConstructPattern = /(placeholders\.push\(`\$\{paramIndex\+\+\}`\);\s*\}\s*)(\/\/ Construct the SQL query dynamically)/;
      const beforeConstructReplacement = `$1
        
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
      
      if (beforeConstructPattern.test(modifiedContent)) {
        modifiedContent = modifiedContent.replace(beforeConstructPattern, beforeConstructReplacement);
        console.log('Added is_posted and journal_type logic before SQL construction');
      }
    }
    
    // Write the modified content back to the file
    fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
    console.log('Successfully finalized credit card agent patch!');
    
    return {
      success: true,
      message: 'Credit card agent patch finalized successfully'
    };
    
  } catch (error) {
    console.error('Error finalizing credit card agent patch:', error);
    return {
      success: false,
      message: `Failed to finalize patch: ${error.message}`
    };
  }
}

// Run the patch if this script is executed directly
if (require.main === module) {
  finalizeCreditCardPatch()
    .then(result => {
      console.log('Finalize result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Finalize failed:', error);
      process.exit(1);
    });
}

module.exports = { finalizeCreditCardPatch };

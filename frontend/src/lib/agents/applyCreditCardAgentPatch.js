/**
 * Script to apply the credit card agent patch to ensure payment journal entries are posted
 * 
 * This script modifies the creditCardAgent.ts file to include the is_posted column
 * in the dynamic SQL generation for journal entries.
 */

const fs = require('fs');
const path = require('path');

const CREDIT_CARD_AGENT_PATH = path.join(__dirname, 'creditCardAgent.ts');

async function applyCreditCardAgentPatch() {
  try {
    console.log('Reading creditCardAgent.ts file...');
    const content = fs.readFileSync(CREDIT_CARD_AGENT_PATH, 'utf8');
    
    // Add import for the patch functions at the top of the file
    const importLine = `import { getEnhancedColumnsCheck, buildEnhancedJournalColumns } from './creditCardAgentPatch';`;
    
    // Find the existing imports section and add our import
    let modifiedContent = content;
    
    // Look for the last import statement and add our import after it
    const lastImportMatch = modifiedContent.match(/^import.*from.*['"];$/gm);
    if (lastImportMatch && lastImportMatch.length > 0) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const lastImportIndex = modifiedContent.lastIndexOf(lastImport);
      const insertIndex = lastImportIndex + lastImport.length;
      
      modifiedContent = modifiedContent.slice(0, insertIndex) + '\n' + importLine + modifiedContent.slice(insertIndex);
      console.log('Added import statement for patch functions');
    }
    
    // Replace the columnsCheck query (around line 2545)
    const oldColumnsCheckPattern = /const columnsCheck = await sql`\s*SELECT\s+EXISTS.*?has_created_by\s*`;/gs;
    const newColumnsCheck = `const columnsCheck = await getEnhancedColumnsCheck();`;
    
    if (oldColumnsCheckPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(oldColumnsCheckPattern, newColumnsCheck);
      console.log('Replaced columnsCheck query with enhanced version');
    } else {
      console.log('Could not find columnsCheck pattern to replace');
    }
    
    // Replace the dynamic column building logic
    // Look for the section that starts with "// Build dynamic SQL based on available columns"
    // and ends with "// Construct the SQL query dynamically"
    const oldColumnBuildingPattern = /\/\/ Build dynamic SQL based on available columns[\s\S]*?\/\/ Add created_by if available or required[\s\S]*?placeholders\.push\(`\$\{paramIndex\+\+\}`\);\s*\}/;
    
    const newColumnBuilding = `// Build dynamic SQL based on available columns using enhanced logic
        const columnData = buildEnhancedJournalColumns(
          context,
          transaction,
          accountName,
          isPayment,
          columnsCheck,
          requiredColumns
        );
        
        const columns = columnData.columns;
        const values = columnData.values;
        const placeholders = columnData.placeholders;
        let paramIndex = columnData.paramIndex;`;
    
    if (oldColumnBuildingPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(oldColumnBuildingPattern, newColumnBuilding);
      console.log('Replaced column building logic with enhanced version');
    } else {
      console.log('Could not find column building pattern to replace');
      
      // Try a more specific pattern for the created_by section
      const createdByPattern = /\/\/ Add created_by if available or required\s*if \(hasCreatedBy \|\| requiredColumns\.has\('created_by'\)\) \{\s*columns\.push\('created_by'\);\s*values\.push\(context\.userId \|\| 'system'\);\s*placeholders\.push\(`\$\{paramIndex\+\+\}`\);\s*\}/;
      
      if (createdByPattern.test(modifiedContent)) {
        const createdByReplacement = `// Add created_by if available or required
        if (hasCreatedBy || requiredColumns.has('created_by')) {
          columns.push('created_by');
          values.push(context.userId || 'system');
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        // CRITICAL FIX: Add is_posted column for payment transactions
        const hasIsPosted = columnsCheck.rows[0].has_is_posted;
        if (hasIsPosted) {
          columns.push('is_posted');
          values.push(true); // Always set to true for payment transactions
          placeholders.push(\`$\${paramIndex++}\`);
        }
        
        // CRITICAL FIX: Add journal_type column for payment transactions
        const hasJournalType = columnsCheck.rows[0].has_journal_type;
        if (hasJournalType && isPayment) {
          columns.push('journal_type');
          values.push('CCY'); // Credit Card Payment type
          placeholders.push(\`$\${paramIndex++}\`);
        }`;
        
        modifiedContent = modifiedContent.replace(createdByPattern, createdByReplacement);
        console.log('Applied targeted fix for is_posted and journal_type columns');
      }
    }
    
    // Also need to update the schema check to include the new columns
    const oldSchemaPattern = /EXISTS \(SELECT 1 FROM information_schema\.columns WHERE table_name = 'journals' AND column_name = 'created_by'\) as has_created_by/;
    const newSchemaAddition = `EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'created_by') as has_created_by,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'is_posted') as has_is_posted,
            EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'journals' AND column_name = 'journal_type') as has_journal_type`;
    
    if (oldSchemaPattern.test(modifiedContent)) {
      modifiedContent = modifiedContent.replace(oldSchemaPattern, newSchemaAddition);
      console.log('Added is_posted and journal_type to schema check');
    }
    
    // Write the modified content back to the file
    fs.writeFileSync(CREDIT_CARD_AGENT_PATH, modifiedContent);
    console.log('Successfully applied credit card agent patch!');
    
    return {
      success: true,
      message: 'Credit card agent patch applied successfully'
    };
    
  } catch (error) {
    console.error('Error applying credit card agent patch:', error);
    return {
      success: false,
      message: `Failed to apply patch: ${error.message}`
    };
  }
}

// Run the patch if this script is executed directly
if (require.main === module) {
  applyCreditCardAgentPatch()
    .then(result => {
      console.log('Patch result:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Patch failed:', error);
      process.exit(1);
    });
}

module.exports = { applyCreditCardAgentPatch };

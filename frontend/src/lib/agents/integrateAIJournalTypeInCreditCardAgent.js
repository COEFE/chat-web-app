/**
 * Integrate AI-powered journal type selection into creditCardAgent.ts
 * This replaces the hardcoded 'CCY' with Claude 3.5 AI-determined journal types
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'creditCardAgent.ts');

function integrateAIJournalType() {
  try {
    console.log('Reading creditCardAgent.ts...');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Step 1: Add the import for AI journal type selector at the top
    const importPattern = /import.*from.*'\.\.\/\.\.\/types\/agents';/;
    const aiImport = `import { getAIJournalType } from './integrateAIJournalTypeSelector';`;
    
    if (!content.includes('getAIJournalType')) {
      content = content.replace(importPattern, (match) => {
        return match + '\n' + aiImport;
      });
      console.log('✅ Added AI journal type import');
    }
    
    // Step 2: Replace the hardcoded journal type logic with AI-powered logic
    const hardcodedPattern = /\/\/ CRITICAL FIX: Add journal_type column for payment transactions\s*if \(hasJournalType && isPayment\) \{\s*columns\.push\('journal_type'\);\s*values\.push\('CCY'\); \/\/ Credit Card Payment type\s*placeholders\.push\(`\$\$\{paramIndex\+\+\}`\);\s*\}/;
    
    const aiPoweredLogic = `// AI-POWERED: Add journal_type column for payment transactions
        if (hasJournalType && isPayment) {
          columns.push('journal_type');
          
          // Use AI to determine the appropriate journal type
          try {
            const aiJournalType = await getAIJournalType(transaction, context);
            values.push(aiJournalType);
            console.log(\`[CreditCardAgent] AI determined journal type: \${aiJournalType} for payment: \${transaction.description}\`);
          } catch (error) {
            console.warn(\`[CreditCardAgent] AI journal type failed, using fallback 'CCY': \${error.message}\`);
            values.push('CCY'); // Fallback to Credit Card Payment type
          }
          
          placeholders.push(\`$\${paramIndex++}\`);
        }`;
    
    if (content.match(hardcodedPattern)) {
      content = content.replace(hardcodedPattern, aiPoweredLogic);
      console.log('✅ Replaced hardcoded journal type with AI-powered logic');
    } else {
      console.log('ℹ️  Hardcoded pattern not found, trying alternative approach...');
      
      // Alternative pattern - look for the specific lines
      const altPattern = /values\.push\('CCY'\); \/\/ Credit Card Payment type/;
      if (content.match(altPattern)) {
        content = content.replace(altPattern, `// Use AI to determine the appropriate journal type
          try {
            const aiJournalType = await getAIJournalType(transaction, context);
            values.push(aiJournalType);
            console.log(\`[CreditCardAgent] AI determined journal type: \${aiJournalType} for payment: \${transaction.description}\`);
          } catch (error) {
            console.warn(\`[CreditCardAgent] AI journal type failed, using fallback 'CCY': \${error.message}\`);
            values.push('CCY'); // Fallback to Credit Card Payment type
          }`);
        console.log('✅ Applied alternative AI journal type integration');
      }
    }
    
    // Step 3: Also update the fallback logic to use AI
    const fallbackPattern = /} else if \(column === 'journal_type'\) \{\s*fallbackValues\.push\('CCY'\);/;
    const aiFallbackLogic = `} else if (column === 'journal_type') {
                  // Use AI for fallback journal type as well
                  try {
                    const aiJournalType = await getAIJournalType(transaction, context);
                    fallbackValues.push(aiJournalType);
                  } catch (error) {
                    fallbackValues.push('CCY'); // Ultimate fallback
                  }`;
    
    if (content.match(fallbackPattern)) {
      content = content.replace(fallbackPattern, aiFallbackLogic);
      console.log('✅ Updated fallback logic to use AI as well');
    }
    
    // Step 4: Update the function signature to be async if it's not already
    const functionPattern = /createTransactionJournalEntry\(\s*transaction: CreditCardTransaction,\s*context: AgentContext,\s*isPayment: boolean = false\s*\)/;
    const asyncFunctionPattern = /async createTransactionJournalEntry\(\s*transaction: CreditCardTransaction,\s*context: AgentContext,\s*isPayment: boolean = false\s*\)/;
    
    if (content.match(functionPattern) && !content.match(asyncFunctionPattern)) {
      content = content.replace(functionPattern, 'async createTransactionJournalEntry(\n    transaction: CreditCardTransaction,\n    context: AgentContext,\n    isPayment: boolean = false\n  )');
      console.log('✅ Made createTransactionJournalEntry function async');
    }
    
    // Write the updated content
    fs.writeFileSync(filePath, content, 'utf8');
    
    console.log('\n✅ Successfully integrated AI journal type selector into creditCardAgent.ts');
    
    return {
      success: true,
      message: 'AI journal type integration completed'
    };
    
  } catch (error) {
    console.error('❌ Error integrating AI journal type:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the integration
const result = integrateAIJournalType();
console.log('\n=== Integration Result ===');
console.log(JSON.stringify(result, null, 2));

module.exports = { integrateAIJournalType };

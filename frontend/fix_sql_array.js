// This script fixes the SQL array handling issue
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/lib/agents/apAgent.ts');
const fileContent = fs.readFileSync(filePath, 'utf8');

// Replace the problematic SQL query that uses sql.array with a standard approach
const updatedContent = fileContent.replace(
  /WHERE id = ANY\(\${sql\.array\(billIds\)}\)/,
  `WHERE id IN (${billIds.map((_, i) => `$\${i + 1}`).join(', ')})`
);

fs.writeFileSync(filePath, updatedContent, 'utf8');
console.log('Fixed SQL array handling in apAgent.ts');

// Script to run the bill_refunds table migration
const fetch = require('node-fetch');

async function runMigration() {
  try {
    const response = await fetch('http://localhost:3002/api/db-migrations/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // This will fail auth, but we can see the error
      },
      body: JSON.stringify({
        migrationFile: '037_create_bill_refunds_table.sql'
      })
    });
    
    console.log('Status:', response.status);
    const result = await response.json();
    console.log('Result:', result);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

runMigration();

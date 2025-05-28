// Simple test script to check the refunds endpoint
const fetch = require('node-fetch');

async function testRefunds() {
  try {
    // Test with a sample bill ID
    const response = await fetch('http://localhost:3002/api/bills/1/refunds', {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    const text = await response.text();
    console.log('Response:', text);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testRefunds();

// Test script for GL Codes functionality
require('dotenv').config({ path: './.env.local' });
const fetch = require('node-fetch');
const { getAuth, signInWithCustomToken } = require('firebase/auth');
const { initializeApp } = require('firebase/app');

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Server URL - adjust as needed
const SERVER_URL = 'http://localhost:3000';

// Sample GL codes to test
const sampleGLCodes = [
  { code: '1000', description: 'Cash', notes: 'Assets - Current Assets' },
  { code: '1100', description: 'Accounts Receivable', notes: 'Assets - Current Assets' },
  { code: '1200', description: 'Inventory', notes: 'Assets - Current Assets' },
  { code: '2000', description: 'Accounts Payable', notes: 'Liabilities - Current Liabilities' },
  { code: '3000', description: 'Equity', notes: 'Equity' },
  { code: '4000', description: 'Revenue', notes: 'Income' },
  { code: '5000', description: 'Cost of Goods Sold', notes: 'Expenses' },
  { code: '6000', description: 'Operating Expenses', notes: 'Expenses' },
];

async function getTestToken() {
  try {
    console.log('Getting test token...');
    const response = await fetch(`${SERVER_URL}/api/debug/get-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      throw new Error(`Error getting token: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Got custom token:', data.token.substring(0, 20) + '...');
    return data.token;
  } catch (error) {
    console.error('Error getting test token:', error);
    process.exit(1);
  }
}

async function signInWithToken(customToken) {
  try {
    const userCredential = await signInWithCustomToken(auth, customToken);
    const idToken = await userCredential.user.getIdToken();
    console.log('Signed in and got ID token:', idToken.substring(0, 20) + '...');
    return idToken;
  } catch (error) {
    console.error('Error signing in with custom token:', error);
    process.exit(1);
  }
}

async function setupDatabase(idToken) {
  try {
    console.log('Setting up GL codes database...');
    const response = await fetch(`${SERVER_URL}/api/gl-codes/db-setup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Error setting up database: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Database setup response:', data);
    return data.success;
  } catch (error) {
    console.error('Error setting up database:', error);
    return false;
  }
}

async function addGLCodes(idToken, glCodes) {
  try {
    console.log(`Adding ${glCodes.length} GL codes...`);
    const response = await fetch(`${SERVER_URL}/api/gl-codes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ glCodes }),
    });
    
    if (!response.ok) {
      throw new Error(`Error adding GL codes: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Added GL codes response:', data);
    return data.success;
  } catch (error) {
    console.error('Error adding GL codes:', error);
    return false;
  }
}

async function getGLCodes(idToken) {
  try {
    console.log('Fetching GL codes...');
    const response = await fetch(`${SERVER_URL}/api/gl-codes`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${idToken}`,
      },
    });
    
    if (!response.ok) {
      throw new Error(`Error fetching GL codes: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Fetched ${data.glCodes?.length || 0} GL codes`);
    return data.glCodes || [];
  } catch (error) {
    console.error('Error fetching GL codes:', error);
    return [];
  }
}

async function testChat(idToken, query) {
  try {
    console.log(`Testing chat with query: "${query}"`);
    const response = await fetch(`${SERVER_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: query }],
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`Error in chat: ${response.status} ${response.statusText}`);
    }
    
    // In a real test we'd parse the streaming response
    console.log('Chat request sent successfully');
    return true;
  } catch (error) {
    console.error('Error testing chat:', error);
    return false;
  }
}

async function main() {
  console.log('Starting GL codes test...');
  
  // Get test token and sign in
  const customToken = await getTestToken();
  const idToken = await signInWithToken(customToken);
  
  // Set up database
  const dbSuccess = await setupDatabase(idToken);
  if (!dbSuccess) {
    console.error('Failed to set up database. Exiting.');
    process.exit(1);
  }
  
  // Add sample GL codes
  const addSuccess = await addGLCodes(idToken, sampleGLCodes);
  if (!addSuccess) {
    console.error('Failed to add GL codes. Exiting.');
    process.exit(1);
  }
  
  // Fetch GL codes
  const glCodes = await getGLCodes(idToken);
  if (glCodes.length === 0) {
    console.error('Failed to fetch GL codes. Exiting.');
    process.exit(1);
  }
  
  // Test chat with GL code question
  await testChat(idToken, 'What is GL code 1000 used for?');
  
  console.log('GL codes test completed successfully!');
  process.exit(0);
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

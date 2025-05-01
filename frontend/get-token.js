// Simple helper script to get a test authentication token
// This uses Firebase REST API to get a token for the test user

const fetch = require('node-fetch');

// Replace with your test user credentials
const email = process.env.TEST_EMAIL || 'test@example.com';
const password = process.env.TEST_PASSWORD || 'testpassword';
const apiKey = process.env.FIREBASE_API_KEY || 'AIzaXXXXXXXXXXXXXXXXXXXXXX'; // Your Firebase API key

async function getToken() {
  try {
    // If credentials aren't set, return an empty token as a placeholder
    if (email === 'test@example.com' || password === 'testpassword') {
      console.log('WARNING: Using test credentials. Set TEST_EMAIL and TEST_PASSWORD env vars for real testing.');
      console.log('For now, returning a placeholder token that will not work for authentication.');
      return 'test-token-placeholder';
    }

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true
        })
      }
    );

    const data = await response.json();
    if (data.idToken) {
      console.log(data.idToken);
      return data.idToken;
    } else {
      console.error('Authentication failed:', data.error);
      return '';
    }
  } catch (error) {
    console.error('Error getting token:', error);
    return '';
  }
}

getToken();

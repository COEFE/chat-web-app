// GL Codes Setup Script
// This script helps set up the GL codes database and test the API
require('dotenv').config({ path: '../.env.local' });

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Firebase configuration - getting directly from the app
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

// Server URL
const SERVER_URL = 'http://localhost:3000';

async function getToken() {
  // Check if credentials are in env
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  
  if (!email || !password) {
    console.error('Error: TEST_EMAIL and TEST_PASSWORD must be set in .env.local');
    process.exit(1);
  }
  
  try {
    // Sign in with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const token = await userCredential.user.getIdToken();
    return token;
  } catch (error) {
    console.error('Authentication error:', error.message);
    process.exit(1);
  }
}

async function setupDatabase(token) {
  console.log('Setting up GL codes database...');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/gl-codes/db-setup`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('Database setup successful:', data);
      return true;
    } else {
      console.error('Database setup failed:', data);
      return false;
    }
  } catch (error) {
    console.error('Error setting up database:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('Starting GL codes setup...');
  
  // Get authentication token
  const token = await getToken();
  console.log('Authenticated successfully');
  
  // Set up database
  const dbSetupSuccess = await setupDatabase(token);
  if (!dbSetupSuccess) {
    console.error('Failed to set up database. Exiting.');
    process.exit(1);
  }
  
  console.log('GL codes setup complete!');
  process.exit(0);
}

// Run the main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

let adminInstance: admin.app.App;

function initializeFirebaseAdmin() {
  // Return existing instance if already initialized
  if (adminInstance) {
    return adminInstance;
  }

  // Log environment variables for debugging (excluding sensitive data)
  console.log('Environment variables check:');
  console.log('- FIREBASE_PROJECT_ID exists:', !!process.env.FIREBASE_PROJECT_ID);
  console.log('- FIREBASE_CLIENT_EMAIL exists:', !!process.env.FIREBASE_CLIENT_EMAIL);
  console.log('- FIREBASE_PRIVATE_KEY exists:', !!process.env.FIREBASE_PRIVATE_KEY);
  console.log('- NEXT_PUBLIC_FIREBASE_PROJECT_ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  // Get environment variables for Firebase Admin SDK
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  
  // Log environment variable availability (without revealing sensitive data)
  console.log('Firebase Admin SDK Environment Variables:');
  console.log(`- FIREBASE_PROJECT_ID: ${projectId ? 'Set' : 'Not set'}`);
  console.log(`- FIREBASE_CLIENT_EMAIL: ${clientEmail ? 'Set' : 'Not set'}`);
  console.log(`- FIREBASE_PRIVATE_KEY: ${privateKey ? 'Set' : 'Not set'}`);

  // Check if required environment variables are present
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID environment variable is not set.');
    throw new Error('FIREBASE_PROJECT_ID environment variable is not set.');
  }

  if (!clientEmail) {
    console.error('FIREBASE_CLIENT_EMAIL environment variable is not set.');
    throw new Error('FIREBASE_CLIENT_EMAIL environment variable is not set.');
  }

  if (!privateKey) {
    console.error('FIREBASE_PRIVATE_KEY environment variable is not set.');
    throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set.');
  }

  // Define a variable to hold the formatted private key
  let formattedPrivateKey = '';
  
  // Handle the private key with a completely different approach
  if (privateKey) {
    try {
      // Extract the raw key content without any formatting
      // First remove quotes and trim whitespace
      let rawKey = privateKey
        .replace(/^"|"$/g, '')  // Remove surrounding quotes if present
        .trim();                 // Trim any extra whitespace
      
      // Replace escaped newlines with actual newlines
      rawKey = rawKey.replace(/\\n/g, '\n');
      
      // Log the raw key format (safely)
      console.log('Raw key format (first 15 chars):', rawKey.substring(0, 15) + '...');
      
      // For Firebase Admin SDK, the key must be in the exact PEM format
      // We'll manually construct it with the correct format
      if (rawKey.includes('-----BEGIN PRIVATE KEY-----')) {
        // The key already has PEM headers, extract just the base64 content
        const base64Content = rawKey
          .replace(/-----BEGIN PRIVATE KEY-----/g, '')
          .replace(/-----END PRIVATE KEY-----/g, '')
          .replace(/\s/g, '');
        
        // Reconstruct with proper PEM format
        formattedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${base64Content}\n-----END PRIVATE KEY-----`;
      } else {
        // The key is just the base64 content, add the PEM headers
        formattedPrivateKey = `-----BEGIN PRIVATE KEY-----\n${rawKey}\n-----END PRIVATE KEY-----`;
      }
      
      console.log('Private key properly formatted with PEM headers');
      
      // Additional check: ensure there are no extra newlines or spaces that could cause issues
      formattedPrivateKey = formattedPrivateKey
        .replace(/\n\s*\n/g, '\n')  // Replace multiple newlines with a single newline
        .replace(/\s+$/gm, '');     // Remove trailing whitespace on each line
    } catch (error) {
      console.error('Error formatting private key:', error);
      throw new Error('Failed to format private key properly');
    }
  }
  
  // Create a clean service account object
  // Using the most reliable method for handling private keys in environment variables
  const serviceAccount: ServiceAccount = {
    projectId,
    clientEmail,
    // Use String.raw to properly handle newlines in the private key
    // This is a more reliable approach based on Stack Overflow solutions
    privateKey: process.env.FIREBASE_PRIVATE_KEY ? 
      process.env.FIREBASE_PRIVATE_KEY.split(String.raw`\n`).join('\n') : '',
  };
  
  // Log successful key formatting
  console.log('Private key formatted using String.raw split/join method');
  
  // Log service account info (without revealing the full key)
  console.log('Service account configured with:');
  console.log(`- Project ID: ${serviceAccount.projectId}`);
  console.log(`- Client Email: ${serviceAccount.clientEmail}`);
  console.log(`- Private Key present: ${serviceAccount.privateKey ? 'Yes' : 'No'}`);
  if (serviceAccount.privateKey) {
    console.log(`- Private Key starts with: ${serviceAccount.privateKey.substring(0, 27)}...`);
  }

  // Initialize Firebase Admin SDK only if it hasn't been initialized yet
  // Note: The admin.apps.length check might be redundant with the adminInstance check,
  // but it's safe to keep both for extra certainty.
  if (!admin.apps.length) {
    try {
      adminInstance = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Optionally add storageBucket if needed for Admin Storage operations
        // storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
      // Depending on the error, you might want to throw it or handle it differently
      throw new Error('Failed to initialize Firebase Admin SDK');
    }
  } else {
    // If admin.apps has length but adminInstance is not set, get the existing app
    adminInstance = admin.app(); 
    console.log('Firebase Admin SDK already initialized. Using existing instance.');
  }
  
  return adminInstance;
}

// Export functions to get specific services, ensuring initialization first
function getAdminAuth() {
  const app = initializeFirebaseAdmin();
  return app.auth();
}

function getAdminDb() {
  const app = initializeFirebaseAdmin();
  return app.firestore();
}

function getAdminStorage() {
  const app = initializeFirebaseAdmin();
  return app.storage();
}

// Keep the admin export if needed elsewhere, but ensure it's initialized
const getAdmin = () => {
    initializeFirebaseAdmin();
    return admin; 
}

export { getAdminAuth, getAdminDb, getAdminStorage, getAdmin };

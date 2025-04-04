import * as admin from 'firebase-admin';
import { ServiceAccount } from 'firebase-admin';

let adminInstance: admin.app.App;

function initializeFirebaseAdmin() {
  // Return existing instance if already initialized
  if (adminInstance) {
    return adminInstance;
  }

  // Ensure the necessary environment variables are set
  if (!process.env.FIREBASE_PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID environment variable is not set.');
  }
  if (!process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error('FIREBASE_CLIENT_EMAIL environment variable is not set.');
  }
  if (!process.env.FIREBASE_PRIVATE_KEY) {
    throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set.');
  }

  // Define the credentials object using environment variables
  const serviceAccount: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Replace escaped newlines in the private key from the env variable
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  };

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

import admin, { ServiceAccount } from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

// Create a service account from environment variables or direct JSON
function loadServiceAccount(): ServiceAccount | undefined {
  let serviceAccountContent: string | undefined;
  // For Vercel, try reading from the root first if env var fails.
  // For local, read from the root relative to the CWD where node is run (usually project root).
  const serviceAccountPath = './firebase-service-account.json'; 

  try {
    // Try to load the service account from the environment variable first
    serviceAccountContent = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountContent) {
      console.log('[FirebaseAdmin] Loaded service account from environment variable.');
    } else {
      // If not found in environment variable, try to load from file
      // Resolve path relative to the current working directory, which should be the project root in most deployments
      const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
      console.log(`[FirebaseAdmin] Env var not found. Attempting to load from file: ${resolvedPath}`);
      serviceAccountContent = fs.readFileSync(resolvedPath, 'utf8');
      console.log(`[FirebaseAdmin] Loaded service account from file: ${resolvedPath}`);
    }
  } catch (error: any) {
    // Log specific errors for file vs env var
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      console.error('[FirebaseAdmin] Error parsing service account from environment variable:', error.message);
    } else {
      console.warn(`[FirebaseAdmin] Failed to load service account from file (${serviceAccountPath}): ${error.message}. Will attempt ADC.`);
    }
  }

  if (serviceAccountContent) {
    try {
      // Parse the service account JSON
      const serviceAccount: ServiceAccount = JSON.parse(serviceAccountContent);
      return serviceAccount;
    } catch (error) {
      console.error('[FirebaseAdmin] Failed to parse service account JSON:', error);
    }
  }

  return undefined;
}

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses a direct service account configuration.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  // Use admin.apps to check length and admin.app() to get default
  if (admin.apps.length > 0) { 
    console.log('Firebase Admin SDK already initialized.');
    // If duplicate, return the existing default app
    return admin.app(); // Use admin.app() to get default app
  }

  console.log('Attempting to initialize Firebase Admin SDK...');
  const serviceAccount = loadServiceAccount();

  // Try initializing with the service account first
  if (serviceAccount) {
    console.log('Found service account file/variable. Attempting initialization...');
    try {
      // Initialize using the main 'admin' object
      const app = admin.initializeApp({ 
        // Cast to ServiceAccount to satisfy type checker
        credential: admin.credential.cert(serviceAccount as ServiceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app',
      });
      console.log(`Firebase Admin SDK initialized successfully with project ID: ${serviceAccount.projectId}`);
      return app;
    } catch (error: any) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
      
      // Fallback to Application Default Credentials if available
      try {
        console.log('Trying to initialize with Application Default Credentials as fallback...');
        // Use the same storage bucket name for consistency
        const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
        console.log(`Using storage bucket with ADC: ${storageBucket}`);
        
        // Use initializeApp from the main 'admin' object
        const app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          storageBucket: storageBucket
        }); 
        console.log('Firebase Admin SDK initialized successfully with Application Default Credentials.');
        return app;
      } catch (adcError) {
        console.error('Application Default Credentials also failed:', adcError);
      }
      
      throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
    }
  } else {
    // Fallback to Application Default Credentials if no service account is found
    try {
      console.log('Trying to initialize with Application Default Credentials...');
      // Use the same storage bucket name for consistency
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
      console.log(`Using storage bucket with ADC: ${storageBucket}`);
      
      // Use initializeApp from the main 'admin' object
      const app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        storageBucket: storageBucket
      }); 
      console.log('Firebase Admin SDK initialized successfully with Application Default Credentials.');
      return app;
    } catch (adcError) {
      console.error('Application Default Credentials failed:', adcError);
      throw new Error('Failed to initialize Firebase Admin SDK');
    }
  }
}

/**
 * Gets the initialized Firebase Admin SDK instance.
 * Initializes it if it hasn't been initialized yet.
 */
export function getFirebaseAdmin(): admin.app.App { 
  // Simply call initializeFirebaseAdmin - it handles the check internally now
  return initializeFirebaseAdmin(); 
}

/**
 * Gets the Firestore database instance.
 */
export function getAdminDb(): admin.firestore.Firestore {
  const app = getFirebaseAdmin();
  // Correctly get Firestore instance from 'admin' namespace, passing the app
  return admin.firestore(app);
}

/**
 * Gets the Firebase Storage instance.
 */
export function getAdminStorage(): admin.storage.Storage {
  const app = getFirebaseAdmin();
  // Correctly get Storage instance from 'admin' namespace, passing the app
  return admin.storage(app);
}

/**
 * Gets the Firebase Auth instance.
 */
export function getAdminAuth(): admin.auth.Auth {
  const app = getFirebaseAdmin();
  // Correctly get Auth instance from 'admin' namespace, passing the app
  return admin.auth(app);
}

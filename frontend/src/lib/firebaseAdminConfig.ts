import admin, { ServiceAccount } from 'firebase-admin';
import path from 'path';
import fs from 'fs';

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

// --- Service Account Loading ---

/**
 * Loads the Firebase Service Account configuration.
 * Tries FIREBASE_SERVICE_ACCOUNT environment variable first, then falls back to a local file.
 */
function loadServiceAccount(): ServiceAccount | undefined {
  let serviceAccountContent: string | undefined;
  // Path for local fallback file
  const serviceAccountPath = './firebase-service-account.json'; 

  try {
    // Try to load the service account from the environment variable first
    serviceAccountContent = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountContent) {
      console.log('[FirebaseAdmin] Attempting to load from environment variable FIREBASE_SERVICE_ACCOUNT.');
      // Log preview for debugging
      const previewLength = 30;
      if (serviceAccountContent.length > previewLength * 2) {
          console.log(`[FirebaseAdmin] Env Var Content (Preview): ${serviceAccountContent.substring(0, previewLength)}...${serviceAccountContent.substring(serviceAccountContent.length - previewLength)}`);
      } else {
          console.log(`[FirebaseAdmin] Env Var Content (Full): ${serviceAccountContent}`);
      }
      // Attempt to parse immediately after confirming it exists
      console.log('[FirebaseAdmin] Attempting to parse service account JSON from environment variable...');
      const serviceAccount: ServiceAccount = JSON.parse(serviceAccountContent);
      console.log('[FirebaseAdmin] Successfully parsed service account JSON from environment variable.');
      return serviceAccount;
    } else {
      console.log('[FirebaseAdmin] Environment variable FIREBASE_SERVICE_ACCOUNT not found.');
      // Fallback to file loading (primarily for local dev)
      const resolvedPath = path.resolve(process.cwd(), serviceAccountPath);
      console.log(`[FirebaseAdmin] Attempting to load from file: ${resolvedPath}`);
      if (fs.existsSync(resolvedPath)) { // Check if file exists before reading
        serviceAccountContent = fs.readFileSync(resolvedPath, 'utf8');
        console.log(`[FirebaseAdmin] Loaded service account from file: ${resolvedPath}`);
        // Attempt to parse immediately after loading from file
        console.log('[FirebaseAdmin] Attempting to parse service account JSON from file...');
        const serviceAccount: ServiceAccount = JSON.parse(serviceAccountContent);
        console.log('[FirebaseAdmin] Successfully parsed service account JSON from file.');
        return serviceAccount;
      } else {
        console.log(`[FirebaseAdmin] Service account file not found at ${resolvedPath}.`);
      }
    }
  } catch (error: any) {
    // Log specific errors
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // Error likely happened during JSON parsing from env var
        console.error('[FirebaseAdmin] Failed to parse service account JSON from env var:', error.message);
        // Log preview again in case of parse error
        const content = process.env.FIREBASE_SERVICE_ACCOUNT;
        const previewLength = 30;
        if (content.length > previewLength * 2) {
            console.error(`[FirebaseAdmin] Env Var Content during parse failure (Preview): ${content.substring(0, previewLength)}...${content.substring(content.length - previewLength)}`);
        } else {
            console.error(`[FirebaseAdmin] Env Var Content during parse failure (Full): ${content}`);
        }
    } else if (serviceAccountContent) {
        // Error likely happened during JSON parsing from file
        console.error('[FirebaseAdmin] Failed to parse service account JSON from file:', error.message);
    } else {
        // Error happened trying to read the file (e.g., permissions, not found already logged)
        console.warn(`[FirebaseAdmin] Failed to load service account from file (${serviceAccountPath}) or environment variable.`);
    }
  }

  // If we reached here, loading/parsing failed via all methods
  console.log('[FirebaseAdmin] Service account could not be loaded or parsed successfully.');
  return undefined;
}

// --- Firebase Admin Initialization ---

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses a service account configuration derived from environment variables or ADC.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  // Check if already initialized
  if (admin.apps.length > 0) {
    console.log('[FirebaseAdmin] Firebase Admin SDK already initialized.');
    return admin.app();
  }

  console.log('[FirebaseAdmin] Attempting to initialize Firebase Admin SDK...');
  const serviceAccount = loadServiceAccount();

  // Try initializing with the service account first
  if (serviceAccount) {
    try {
      console.log('[FirebaseAdmin] Attempting initialization with loaded/parsed service account...');
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount), // Pass the loaded object
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app',
      });
      console.log(`[FirebaseAdmin] Firebase Admin SDK initialized successfully with project ID: ${serviceAccount.projectId}`);
      return app;
    } catch (error: any) {
      console.error('[FirebaseAdmin] Failed to initialize with loaded service account:', error.message);
      // Fall through to try ADC
    }
  } else {
    console.log('[FirebaseAdmin] Service account could not be loaded/parsed.');
  }

  // Fallback to Application Default Credentials
  try {
    console.log('[FirebaseAdmin] Trying to initialize with Application Default Credentials...');
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
    console.log(`[FirebaseAdmin] Using storage bucket with ADC: ${storageBucket}`);
    const app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: storageBucket
    });
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully with Application Default Credentials.');
    return app;
  } catch (adcError: any) {
    console.error('[FirebaseAdmin] Application Default Credentials failed:', adcError.message);
    throw new Error('Failed to initialize Firebase Admin SDK using any method.');
  }
}

// --- Singleton Accessor ---

/**
 * Gets the initialized Firebase Admin App instance.
 */
export function getFirebaseAdmin(): admin.app.App {
  return initializeFirebaseAdmin();
}

// --- Service Getters ---

/**
 * Gets the Firestore database instance.
 */
export function getAdminDb(): admin.firestore.Firestore {
  const app = getFirebaseAdmin();
  return admin.firestore(app);
}

/**
 * Gets the Firebase Storage instance.
 */
export function getAdminStorage(): admin.storage.Storage {
  const app = getFirebaseAdmin();
  return admin.storage(app);
}

/**
 * Gets the Firebase Auth instance.
 */
export function getAdminAuth(): admin.auth.Auth {
  const app = getFirebaseAdmin();
  return admin.auth(app);
}

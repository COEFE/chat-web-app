import admin from 'firebase-admin';
import { getApps, cert } from 'firebase-admin/app';

// For singleton pattern
let firebaseApp: admin.app.App | undefined;

/**
 * Detects the current environment
 */
function getEnvironmentInfo() {
  const isVercel = process.env.VERCEL === '1';
  const environment = isVercel ? 'Vercel' : 'Local';
  console.log(`[FirebaseAdmin] Running in ${environment} environment`);
  return { isVercel, environment };
}

/**
 * Initializes the Firebase Admin SDK for server-side operations.
 * Uses environment variables for configuration.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  // Check if already initialized
  if (getApps().length > 0) {
    console.log('[FirebaseAdmin] Using existing Firebase Admin instance');
    return admin.apps[0]!;
  }

  const { environment } = getEnvironmentInfo();
  console.log(`[FirebaseAdmin] Initializing Firebase Admin SDK in ${environment} environment...`);

  // Get configuration from environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'web-chat-app-fa7f0';
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com';
  
  console.log(`[FirebaseAdmin] Using project ID: ${projectId}`);
  console.log(`[FirebaseAdmin] Using storage bucket: ${storageBucket}`);

  try {
    // Initialize with configuration for Next.js
    const appConfig: admin.AppOptions = {
      projectId,
      storageBucket
    };

    // If service account key JSON is available, use it
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountKey) {
      try {
        console.log('[FirebaseAdmin] Found service account key, attempting to parse...');
        const serviceAccount = JSON.parse(serviceAccountKey);
        appConfig.credential = cert(serviceAccount);
        console.log('[FirebaseAdmin] Successfully parsed service account key');
      } catch (parseError) {
        console.error('[FirebaseAdmin] Error parsing service account key:', parseError);
        // Continue without the credential
      }
    } else {
      console.log('[FirebaseAdmin] No service account key found, using default credentials');
    }
    
    // Initialize the app
    firebaseApp = admin.initializeApp(appConfig);
    
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('[FirebaseAdmin] Error initializing Firebase Admin SDK:', error);
    throw error; // Re-throw to propagate the error
  }
}

/**
 * Gets the initialized Firebase Admin App instance.
 */
export function getFirebaseAdmin(): admin.app.App {
  return initializeFirebaseAdmin();
}

/**
 * Gets the Firestore database instance.
 */
export function getAdminDb(): admin.firestore.Firestore {
  const app = getFirebaseAdmin();
  return app.firestore();
}

/**
 * Gets the Firebase Storage instance.
 */
export function getAdminStorage(): admin.storage.Storage {
  const app = getFirebaseAdmin();
  return app.storage();
}

/**
 * Gets the Firebase Auth instance.
 */
export function getAdminAuth(): admin.auth.Auth {
  const app = getFirebaseAdmin();
  return app.auth();
}

export default admin;

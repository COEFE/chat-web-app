import * as admin from 'firebase-admin';

// For singleton pattern
let firebaseApp: admin.app.App | undefined;

/**
 * Initializes the Firebase Admin SDK for server-side operations.
 * Uses environment variables for configuration.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  console.log('[FirebaseAdmin] ENV VARs]', { hasServiceAccount: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT), hasEnvCreds: Boolean(process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) });
  // Check if already initialized
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  try {
    // Check if the service account JSON is available
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        // Parse the service account JSON
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('[FirebaseAdmin] Using service account from FIREBASE_SERVICE_ACCOUNT');
        credential = admin.credential.cert(serviceAccount);
      } catch (parseError) {
        console.error('[FirebaseAdmin] Error parsing FIREBASE_SERVICE_ACCOUNT:', parseError);
        // Continue without credential - will fall back to Application Default Credentials
      }
    } else {
      console.log('[FirebaseAdmin] No service account JSON found, using Application Default Credentials');
    }

    // Build options without credential if undefined
    const appOptions: admin.AppOptions = {
      projectId: process.env.FIREBASE_PROJECT_ID || 'web-chat-app-fa7f0',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com',
    };
    if (credential) {
      appOptions.credential = credential;
    }
    firebaseApp = admin.initializeApp(appOptions);
    
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

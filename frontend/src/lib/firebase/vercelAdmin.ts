import admin from 'firebase-admin';
import { cert } from 'firebase-admin/app';

// Track initialization status
let isInitialized = false;

/**
 * Initializes Firebase Admin SDK specifically for Vercel environment
 * with robust error handling and logging
 */
export function initVercelFirebaseAdmin() {
  if (admin.apps.length > 0) {
    console.log('[VercelAdmin] Using existing Firebase Admin instance');
    isInitialized = true;
    return admin.apps[0]!;
  }

  try {
    console.log('[VercelAdmin] Initializing Firebase Admin SDK...');
    
    // Get configuration from environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    
    if (!projectId) {
      throw new Error('Missing FIREBASE_PROJECT_ID environment variable');
    }
    
    console.log(`[VercelAdmin] Using project ID: ${projectId}`);
    
    // Initialize with minimal config first
    const appConfig: admin.AppOptions = {
      projectId
    };
    
    // Add storage bucket if available
    if (storageBucket) {
      appConfig.storageBucket = storageBucket;
      console.log(`[VercelAdmin] Using storage bucket: ${storageBucket}`);
    }
    
    // Try to use service account key if available
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    console.log(`[VercelAdmin] Checking FIREBASE_SERVICE_ACCOUNT_KEY: Defined=${!!serviceAccountKey}, Length=${serviceAccountKey?.length ?? 0}`);

    if (serviceAccountKey) {
      try {
        console.log('[VercelAdmin] Found service account key, attempting to parse...');
        const serviceAccount = JSON.parse(serviceAccountKey);
        appConfig.credential = cert(serviceAccount);
        console.log('[VercelAdmin] Successfully parsed service account key');
      } catch (parseError) {
        console.error('[VercelAdmin] Error parsing service account key:', parseError);
        // Continue without the credential - will use Application Default Credentials
      }
    } else {
      console.log('[VercelAdmin] No service account key found, using Application Default Credentials');
    }
    
    // Initialize the app
    const app = admin.initializeApp(appConfig);
    isInitialized = true;
    console.log('[VercelAdmin] Firebase Admin SDK initialized successfully');
    return app;
  } catch (error) {
    console.error('[VercelAdmin] Error initializing Firebase Admin SDK:', error);
    throw error;
  }
}

/**
 * Gets Firestore database instance
 */
export function getVercelFirestore() {
  const app = initVercelFirebaseAdmin();
  return app.firestore();
}

/**
 * Gets Firebase Storage instance
 */
export function getVercelStorage() {
  const app = initVercelFirebaseAdmin();
  return app.storage();
}

/**
 * Gets Firebase Auth instance
 */
export function getVercelAuth() {
  const app = initVercelFirebaseAdmin();
  return app.auth();
}

/**
 * Checks if Firebase Admin has been successfully initialized
 */
export function isFirebaseAdminInitialized() {
  return isInitialized;
}

export default {
  initVercelFirebaseAdmin,
  getVercelFirestore,
  getVercelStorage,
  getVercelAuth,
  isFirebaseAdminInitialized
};

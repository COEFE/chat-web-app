import { initializeApp, getApps, getApp, cert, AppOptions, ServiceAccount } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

// Singleton Firebase Admin App
let firebaseApp;

/**
 * Parse service account credentials from environment variables.
 */
function getServiceAccount(): ServiceAccount | undefined {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error('[FirebaseAdmin] Error parsing FIREBASE_SERVICE_ACCOUNT:', e);
    }
  }
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
      const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString();
      return JSON.parse(decoded);
    } catch (e) {
      console.error('[FirebaseAdmin] Error parsing FIREBASE_SERVICE_ACCOUNT_BASE64:', e);
    }
  }
  if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
    const rawKey = process.env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, '');
    const privateKey = rawKey.replace(/\\n/g, '\n');
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    } as ServiceAccount;
  }
  return undefined;
}

/**
 * Initialize or return existing Firebase Admin App.
 */
export function initializeFirebaseAdmin(): ReturnType<typeof initializeApp> {
  if (getApps().length > 0) {
    return getApp();
  }
  const serviceAccount = getServiceAccount();
  const options: AppOptions = {};
  if (serviceAccount) {
    options.credential = cert(serviceAccount);
  }
  if (process.env.FIREBASE_PROJECT_ID) options.projectId = process.env.FIREBASE_PROJECT_ID;
  if (process.env.FIREBASE_STORAGE_BUCKET) options.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  firebaseApp = initializeApp(options);
  console.log('[FirebaseAdmin] Initialized with options:', Object.keys(options));
  return firebaseApp;
}

/**
 * Get Auth client.
 */
export function getAdminAuth(): Auth {
  return getAuth(initializeFirebaseAdmin());
}

/**
 * Get Firestore client.
 */
export function getAdminDb(): Firestore {
  return getFirestore(initializeFirebaseAdmin());
}

/**
 * Get Storage client.
 */
export function getAdminStorage(): Storage {
  return getStorage(initializeFirebaseAdmin());
}

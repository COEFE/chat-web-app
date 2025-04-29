// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';
import { getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { getStorage as getFirebaseStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';

let isInitialized = false;

/**
 * Initializes the Firebase Admin SDK if it hasn't been already.
 * Uses environment variables for credentials.
 */
export function initializeAdminApp() {
  if (isInitialized || admin.apps.length > 0) {
    console.log('[firebaseAdmin] Firebase Admin SDK already initialized.');
    isInitialized = true;
    return;
  }

  try {
    console.log('[firebaseAdmin] ENV vars:', {
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? '<SET>' : '<NONE>',
      FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ? '<SET>' : '<NONE>',
    });

    const tryInit = (serviceAccount: any) => {
      if (isInitialized || admin.apps.length > 0) return true;
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
      });
      isInitialized = true;
      return true;
    };

    // 1) Service account JSON string in env (preferred on Vercel)
    if (!isInitialized && process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('[firebaseAdmin] Initializing using FIREBASE_SERVICE_ACCOUNT env var');
        tryInit(serviceAccount);
      } catch (jsonErr) {
        console.error('[firebaseAdmin] Failed parsing FIREBASE_SERVICE_ACCOUNT JSON:', jsonErr);
      }
    }

    // 2) Individual env var credentials
    if (!isInitialized && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('[firebaseAdmin] Initializing using individual environment variables.');
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'); // Handle escaped newline sequences correctly

      tryInit({ project_id: process.env.FIREBASE_PROJECT_ID, client_email: process.env.FIREBASE_CLIENT_EMAIL, private_key: privateKey });
    } else {
      // 3) GOOGLE_APPLICATION_CREDENTIALS path if file exists
      if (!isInitialized && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (fs.existsSync(credPath)) {
          console.log('[firebaseAdmin] Initializing using GOOGLE_APPLICATION_CREDENTIALS file path');
          const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
          tryInit(serviceAccount);
        } else {
          console.warn('[firebaseAdmin] GOOGLE_APPLICATION_CREDENTIALS path not found, skipping:', credPath);
        }
      }

      // 4) Local JSON fallback (for dev)
      if (!isInitialized) {
        console.warn('[firebaseAdmin] Using bundled JSON fallback credentials');
        try {
          const fallbackPath = path.join(process.cwd(), 'web-chat-app-fa7f0-86be58d508da.json');
          if (fs.existsSync(fallbackPath)) {
            const serviceAccount = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
            tryInit(serviceAccount);
          } else {
            console.error('[firebaseAdmin] Fallback credential file not found at', fallbackPath);
          }
        } catch (fallbackError) {
          console.error('[firebaseAdmin] JSON fallback failed:', fallbackError);
          throw new Error('Missing Firebase Admin credentials after all strategies.');
        }
      }
    }

    if (!isInitialized) {
      console.error('[firebaseAdmin] Firebase Admin SDK failed all init strategies.');
      throw new Error('Firebase Admin SDK initialization failed.');
    }

    console.log('[firebaseAdmin] Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('[firebaseAdmin] Firebase Admin SDK Initialization Error:', error);
    // Decide how to handle: re-throw, return null, etc.
    // For now, we log and potentially let subsequent calls fail if initialization failed.
    isInitialized = false; // Ensure state reflects failure
    // Optionally re-throw if initialization is critical: throw error;
  }
}

/**
 * Ensures the Admin SDK is initialized and returns the Firestore instance.
 */
export function getFirestore() {
  if (!isInitialized) {
    initializeAdminApp();
    if (!isInitialized) { // Check again after attempting init
        throw new Error("Firebase Admin SDK failed to initialize. Cannot get Firestore.")
    }
  }
  return getFirebaseFirestore();
}

/**
 * Ensures the Admin SDK is initialized and returns the Auth instance.
 */
export function getAuth() {
  if (!isInitialized) {
    initializeAdminApp();
     if (!isInitialized) {
        throw new Error("Firebase Admin SDK failed to initialize. Cannot get Auth.")
    }
  }
  return getFirebaseAuth();
}

/**
 * Ensures the Admin SDK is initialized and returns the Storage instance.
 */
export function getStorage() {
  if (!isInitialized) {
    initializeAdminApp();
     if (!isInitialized) {
        throw new Error("Firebase Admin SDK failed to initialize. Cannot get Storage.")
    }
  }
  return getFirebaseStorage();
}

// Initialize on module load (optional, can rely on lazy init in getters)
// initializeAdminApp();

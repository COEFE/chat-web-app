// src/lib/firebaseAdmin.ts
import admin from 'firebase-admin';
import { getFirestore as getFirebaseFirestore } from 'firebase-admin/firestore';
import { getAuth as getFirebaseAuth } from 'firebase-admin/auth';
import { getStorage as getFirebaseStorage } from 'firebase-admin/storage';

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
    });

    // Prefer service account key JSON if path is provided
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('[firebaseAdmin] Initializing using GOOGLE_APPLICATION_CREDENTIALS path.');
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        // Add storageBucket if necessary, e.g., from process.env.FIREBASE_STORAGE_BUCKET
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
      });
    } 
    // Fallback to individual environment variables (common in Vercel)
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      console.log('[firebaseAdmin] Initializing using individual environment variables.');
      const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'); // Handle escaped newline sequences correctly
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
      });
    } else {
      console.warn('[firebaseAdmin] No credentials in env. Trying JSON fallback...');
      try {
        const serviceAccount = require(process.cwd() + '/web-chat-app-fa7f0-86be58d508da.json');
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`,
        });
        console.log('[firebaseAdmin] Firebase Admin SDK initialized via JSON fallback.');
        isInitialized = true;
      } catch (fallbackError) {
        console.error('[firebaseAdmin] JSON fallback failed:', fallbackError);
        throw new Error('Missing Firebase Admin credentials and JSON fallback failed.');
      }
    }

    console.log('[firebaseAdmin] Firebase Admin SDK initialized successfully.');
    isInitialized = true;
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

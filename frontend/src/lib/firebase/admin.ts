import * as admin from 'firebase-admin';
import { getApps } from 'firebase-admin/app';

// For singleton initialization
let firebaseAdmin: admin.app.App;

export const initializeFirebaseAdmin = () => {
  if (getApps().length > 0) {
    // Use existing instance
    return admin;
  }
  
  try {
    // Initialize with default configuration for Next.js
    firebaseAdmin = admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'web-chat-app-fa7f0',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.appspot.com'
    });
    
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('[FirebaseAdmin] Error initializing Firebase Admin SDK:', error);
    throw error;
  }
  
  return admin;
};

export const getStorageBucket = () => {
  // Ensure Firebase Admin is initialized
  initializeFirebaseAdmin();
  
  // Get the default bucket
  const bucket = admin.storage().bucket();
  console.log(`Using storage bucket: ${bucket.name}`);
  
  return bucket;
};

export const getFirestore = () => {
  // Ensure Firebase Admin is initialized
  initializeFirebaseAdmin();
  
  // Get Firestore instance
  return admin.firestore();
};

export default admin;

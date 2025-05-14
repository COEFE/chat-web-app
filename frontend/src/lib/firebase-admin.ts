import { initializeApp, getApps, cert } from 'firebase-admin/app';

export function initializeFirebaseAdmin() {
  const apps = getApps();
  
  if (apps.length === 0) {
    // Initialize Firebase Admin with service account
    try {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      };
      
      if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        console.error('Firebase Admin credentials are missing. Check your environment variables.');
        throw new Error('Firebase Admin credentials are missing');
      }
      
      initializeApp({
        credential: cert(serviceAccount)
      });
      
      console.log('Firebase Admin initialized successfully');
    } catch (error) {
      console.error('Error initializing Firebase Admin:', error);
      throw error;
    }
  } else {
    console.log('Firebase Admin already initialized');
  }
}

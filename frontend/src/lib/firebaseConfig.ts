import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Helper function to determine the correct authDomain based on environment
const getAuthDomain = () => {
  // Default to the environment variable
  const configuredDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // For Vercel deployments - use the current hostname
    if (window.location.hostname.includes('vercel.app')) {
      console.log('Using Vercel deployment domain for auth:', window.location.hostname);
      // Allow Firebase to use the current Vercel domain
      return window.location.hostname;
    }
  }
  
  // Fall back to configured domain for local development
  return configuredDomain;
};

// Your web app's Firebase configuration using environment variables with dynamic authDomain
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: getAuthDomain(), // Use the dynamic domain function
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// DEBUG: Log the API key being used
console.log("Firebase Config Object:", firebaseConfig);
console.log("Attempting to use API Key:", process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

// Initialize Firebase for SSR and SSG, prevent initializing again
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth: Auth = getAuth(app);
const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

// Optional: Initialize Analytics if measurementId is provided
// Note: Analytics might require specific handling in SSR/App Router environments
// import { getAnalytics } from "firebase/analytics";
// if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
//   getAnalytics(app);
// }

export { app, auth, db, storage };

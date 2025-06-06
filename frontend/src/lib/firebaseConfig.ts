import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, Functions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getStorage, FirebaseStorage, connectStorageEmulator } from "firebase/storage";
import { getMessaging, Messaging } from "firebase/messaging";
import { getPerformance } from "firebase/performance";
import { getRemoteConfig, RemoteConfig } from "firebase/remote-config";
import { getAnalytics, Analytics } from "firebase/analytics";
import { getAuthDomain } from "./authDomainConfig";

// Function to detect ad blockers or privacy tools
const detectAdBlocker = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  
  try {
    // Try to fetch a known ad-related URL
    const testUrl = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
    const response = await fetch(testUrl, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
    });
    return false; // No ad blocker detected
  } catch (error) {
    console.log('Ad blocker or privacy tool detected');
    return true; // Ad blocker detected
  }
};

// Your web app's Firebase configuration using environment variables with dynamic authDomain
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: getAuthDomain(), // Use our centralized domain management
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // Remove measurement ID if ad blocker is detected
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// DEBUG: Log the API key being used (but mask most of it for security)
if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
  console.log("Using Firebase API Key:", maskedKey);
}

// Initialize Firebase for SSR and SSG, prevent initializing again
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;
let functionsInstance: Functions;
let messaging: Messaging | null = null;
let performance: any | null = null;
let remoteConfig: RemoteConfig | null = null;
let analytics: Analytics | null = null;

// Initialize Firebase immediately (not async)
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);
storage = getStorage(app);
functionsInstance = getFunctions(app);

// Initialize optional services only on client side and with error handling
if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.warn('Firebase Messaging not supported:', error);
  }
  
  try {
    performance = getPerformance(app);
  } catch (error) {
    console.warn('Firebase Performance not supported:', error);
  }
  
  try {
    remoteConfig = getRemoteConfig(app);
  } catch (error) {
    console.warn('Firebase Remote Config not supported:', error);
  }
  
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    console.warn('Firebase Analytics not supported:', error);
  }
}

// Check if we're in development mode to use emulators
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
  console.log('Using Firebase emulators');
  try {
    connectAuthEmulator(auth, 'http://localhost:9099');
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectStorageEmulator(storage, 'localhost', 9199);
    connectFunctionsEmulator(functionsInstance, 'localhost', 5001);
  } catch (error) {
    console.warn('Emulator connection failed:', error);
  }
}

console.log('Firebase initialized successfully');

// ==============================================
// NEW: Callable Cloud Function Wrappers
// ==============================================

interface CreateFolderPayload {
  name: string;
  parentFolderId?: string | null;
}

interface CreateFolderResult {
  success: boolean;
  folderId: string;
}

/**
 * Calls the 'createFolder' Cloud Function.
 */
export const createFolderAPI = async (payload: CreateFolderPayload): Promise<CreateFolderResult> => {
  if (!functionsInstance) throw new Error("Firebase Functions not initialized.");
  const createFolderFunction = httpsCallable<CreateFolderPayload, CreateFolderResult>(functionsInstance, 'createFolder');
  try {
    const result = await createFolderFunction(payload);
    return result.data;
  } catch (error) {
    console.error("Error calling createFolder function:", error);
    // Consider more specific error handling/throwing
    throw error;
  }
};

interface MoveDocumentPayload {
  documentId: string;
  targetFolderId: string | null;
}

interface MoveDocumentResult {
  success: boolean;
}

/**
 * Calls the 'moveDocument' Cloud Function.
 */
export const moveDocumentAPI = async (payload: MoveDocumentPayload): Promise<MoveDocumentResult> => {
  if (!functionsInstance) throw new Error("Firebase Functions not initialized.");
  const moveDocumentFunction = httpsCallable<MoveDocumentPayload, MoveDocumentResult>(functionsInstance, 'moveDocument');
  try {
    const result = await moveDocumentFunction(payload);
    return result.data;
  } catch (error) {
    console.error("Error calling moveDocument function:", error);
    // Consider more specific error handling/throwing
    throw error;
  }
};

export { app, auth, db, storage, functionsInstance, messaging, performance, remoteConfig, analytics };

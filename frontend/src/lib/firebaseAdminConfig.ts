import admin, { ServiceAccount } from 'firebase-admin';

let firebaseAdminInstance: admin.app.App | null = null;

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses environment variables for configuration.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseAdminInstance) {
    // console.log('Firebase Admin SDK already initialized.');
    return firebaseAdminInstance;
  }

  console.log('Attempting to initialize Firebase Admin SDK...');

  try {
    // First attempt: Try using Google Application Default Credentials
    try {
      console.log('Trying to initialize with Application Default Credentials...');
      firebaseAdminInstance = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('Firebase Admin SDK initialized successfully with Application Default Credentials.');
      return firebaseAdminInstance;
    } catch (adcError) {
      console.log('Application Default Credentials not available, falling back to environment variables.');
    }

    // Second attempt: Try using individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Validate required environment variables
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Required Firebase environment variables are not set.');
    }

    console.log('Found Firebase environment variables');

    // Process the private key if needed
    if (privateKey && privateKey.startsWith('"') && privateKey.endsWith('"')) {
      try {
        const parsedKey = JSON.parse(privateKey);
        if (typeof parsedKey === 'string') {
          privateKey = parsedKey;
          console.log('Successfully parsed private key from JSON string');
        }
      } catch (e) {
        console.log('Failed to parse private key as JSON, using as-is');
      }
    }

    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
      console.log('Replaced escaped newlines in private key');
    }

    // Initialize with environment variables
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      } as ServiceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully with environment variables.');
    return firebaseAdminInstance;
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    
    // Special handling for Vercel environment
    if (isVercel) {
      try {
        console.log('Trying alternative approach for Vercel environment...');
        
        // Get raw environment variables
        const rawProjectId = process.env.FIREBASE_PROJECT_ID;
        const rawClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
        
        if (!rawProjectId || !rawClientEmail || !rawPrivateKey) {
          throw new Error('Missing required Firebase credentials');
        }
        
        // Use the raw private key directly without processing
        firebaseAdminInstance = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: rawProjectId,
            clientEmail: rawClientEmail,
            privateKey: rawPrivateKey,
          } as ServiceAccount),
        });
        
        console.log('Firebase Admin SDK initialized with alternative approach for Vercel.');
        return firebaseAdminInstance;
      } catch (vercelError) {
        console.error('Alternative initialization for Vercel failed:', vercelError);
      }
    }
    
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

/**
 * Gets the initialized Firebase Admin SDK instance.
 * Throws an error if the SDK hasn't been initialized.
 */
export function getFirebaseAdmin(): admin.app.App {
  if (!firebaseAdminInstance) {
    // Attempt initialization if not already done (e.g., in edge cases)
    console.warn('Firebase Admin SDK was not initialized. Attempting initialization now...');
    try {
      return initializeFirebaseAdmin();
    } catch (initError) {
      console.error('Failed to auto-initialize Firebase Admin SDK.', initError);
      throw new Error('Firebase Admin SDK has not been initialized. Call initializeFirebaseAdmin first.');
    }
  }
  return firebaseAdminInstance;
}

// Export functions to get specific services, ensuring initialization first
export function getAdminAuth() {
  const app = initializeFirebaseAdmin();
  return app.auth();
}

export function getAdminDb() {
  const app = initializeFirebaseAdmin();
  return app.firestore();
}

export function getAdminStorage() {
  const app = initializeFirebaseAdmin();
  return app.storage();
}

// Keep the admin export if needed elsewhere, but ensure it's initialized
export const getAdmin = () => {
  initializeFirebaseAdmin();
  return admin; 
}

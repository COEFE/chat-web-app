import admin, { ServiceAccount } from 'firebase-admin';

let firebaseAdminInstance: admin.app.App | null = null;

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses a Base64 encoded service account key for reliable initialization across environments.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseAdminInstance) {
    // console.log('Firebase Admin SDK already initialized.');
    return firebaseAdminInstance;
  }

  console.log('Attempting to initialize Firebase Admin SDK...');

  try {
    // First attempt: Try using Base64 encoded service account (most reliable method)
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    
    if (serviceAccountBase64) {
      try {
        console.log('Found FIREBASE_SERVICE_ACCOUNT_BASE64, attempting to decode and initialize...');
        
        // Decode the Base64 string to get the JSON string
        let serviceAccountJson: string;
        
        // In Node.js environment
        if (typeof Buffer !== 'undefined') {
          serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
        } 
        // In browser or edge environment
        else {
          serviceAccountJson = atob(serviceAccountBase64);
        }
        
        // Parse the JSON string to get the service account object
        const serviceAccount = JSON.parse(serviceAccountJson);
        
        // Initialize Firebase Admin with the service account
        firebaseAdminInstance = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount as ServiceAccount),
        });
        
        console.log('Firebase Admin SDK initialized successfully with Base64 encoded service account.');
        return firebaseAdminInstance;
      } catch (base64Error) {
        console.error('Failed to initialize with Base64 encoded service account:', base64Error);
      }
    } else {
      console.log('FIREBASE_SERVICE_ACCOUNT_BASE64 not found, trying other methods...');
    }
    
    // Second attempt: Try using Google Application Default Credentials
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

    // Third attempt: Try using individual environment variables
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // Validate required environment variables
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Required Firebase environment variables are not set.');
    }

    console.log('Found individual Firebase environment variables');

    // Process the private key if needed
    if (privateKey && privateKey.startsWith('"') && privateKey.endsWith('"')) {
      try {
        const parsedKey = JSON.parse(privateKey);
        if (typeof parsedKey === 'string') {
          privateKey = parsedKey;
        }
      } catch (e) {
        // Continue with the original value if parsing fails
      }
    }

    if (privateKey && privateKey.includes('\\n')) {
      privateKey = privateKey.replace(/\\n/g, '\n');
    }

    // Initialize with individual environment variables
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      } as ServiceAccount),
    });

    console.log('Firebase Admin SDK initialized successfully with individual environment variables.');
    return firebaseAdminInstance;
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
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

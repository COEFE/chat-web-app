import admin, { ServiceAccount } from 'firebase-admin';

let firebaseAdminInstance: admin.app.App | null = null;

// Define the expected structure for credentials from environment variables
interface FirebaseCredentials {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses individual environment variables suitable for Vercel deployments.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseAdminInstance) {
    // console.log('Firebase Admin SDK already initialized.');
    return firebaseAdminInstance;
  }

  console.log('Attempting to initialize Firebase Admin SDK using individual environment variables...');

  // Retrieve credentials from environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // Validate required environment variables
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID environment variable is not set.');
  }
  if (!clientEmail) {
    throw new Error('FIREBASE_CLIENT_EMAIL environment variable is not set.');
  }
  if (!privateKey) {
    throw new Error('FIREBASE_PRIVATE_KEY environment variable is not set.');
  }

  console.log('Found required Firebase environment variables:');
  console.log(`- FIREBASE_PROJECT_ID: ${projectId}`);
  console.log(`- FIREBASE_CLIENT_EMAIL: ${clientEmail}`);
  console.log(`- FIREBASE_PRIVATE_KEY length: ${privateKey.length}`);
  console.log(`- FIREBASE_PRIVATE_KEY starts with: ${privateKey.substring(0, 50)}...`);
  console.log(`- FIREBASE_PRIVATE_KEY ends with: ${privateKey.slice(-50)}`);

  // IMPORTANT: Replace the literal \n characters (and potentially escaped \\n)
  // in the private key ENV var with actual newline characters for the SDK.
  // The key from ENV is expected to be like: "-----BEGIN PRIVATE KEY-----\nMIIE...\n...\n-----END PRIVATE KEY-----\n"
  // First, remove surrounding quotes if present.
  // Then, replace both \\n (escaped backslash + n) and \n (literal backslash + n) with actual newlines.
  privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').replace(/\n/g, '\n');

  console.log('Private Key after replacing \\n/\n and removing quotes:');
  console.log(`- Length: ${privateKey.length}`);
  console.log(`- Starts with: ${privateKey.substring(0, 50)}...`);
  console.log(`- Ends with: ${privateKey.slice(-50)}`);


  // Construct the credentials object for the SDK (expects camelCase)
  const credentials: FirebaseCredentials = {
    projectId,
    clientEmail,
    privateKey, 
  };

  try {
    // Initialize Firebase Admin SDK with the constructed credentials
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert(credentials as ServiceAccount), // Cast needed as our interface is simpler
    });

    console.log('Firebase Admin SDK initialized successfully using individual environment variables.');
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK using individual ENV vars:', error);
    // Log credentials details (excluding full private key) for debugging
    console.error('Credentials used:');
    console.error(`- Project ID: ${credentials.projectId}`);
    console.error(`- Client Email: ${credentials.clientEmail}`);
    console.error(`- Private Key Length: ${credentials.privateKey?.length}`);
    console.error(`- Private Key Start: ${credentials.privateKey?.substring(0, 30)}...`);
    console.error(`- Private Key End: ${credentials.privateKey?.slice(-30)}`);
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }

  return firebaseAdminInstance;
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

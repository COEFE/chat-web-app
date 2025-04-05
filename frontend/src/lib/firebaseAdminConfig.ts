import admin, { ServiceAccount } from 'firebase-admin';

let firebaseAdminInstance: admin.app.App | null = null;

// Function to initialize Firebase Admin SDK
function initializeFirebaseAdmin() {
  if (firebaseAdminInstance) {
    console.log('Firebase Admin SDK already initialized.');
    return firebaseAdminInstance;
  }

  console.log('Initializing Firebase Admin SDK...');

  // Check for the Base64 encoded service account key
  const base64EncodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!base64EncodedServiceAccount) {
    console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 environment variable is not set.');
  }

  try {
    // Decode the Base64 string to get the JSON service account key
    const decodedServiceAccount = Buffer.from(base64EncodedServiceAccount, 'base64').toString('utf-8');
    
    // Parse the JSON string into a raw object (using snake_case keys as in the JSON)
    const rawServiceAccount = JSON.parse(decodedServiceAccount);

    // Detailed logging of the *raw* service account structure (as parsed from JSON)
    console.log('Raw Service Account Object Structure (from JSON):');
    console.log(`- Type: ${typeof rawServiceAccount}`);
    console.log(`- Keys: ${Object.keys(rawServiceAccount).join(', ')}`);
    console.log(`- project_id: ${rawServiceAccount.project_id}`); 
    console.log(`- client_email: ${rawServiceAccount.client_email}`); 
    console.log(`- private_key type: ${typeof rawServiceAccount.private_key}`);
    console.log(`- private_key length: ${rawServiceAccount.private_key?.length}`);
    console.log(`- private_key starts with: ${rawServiceAccount.private_key?.substring(0, 30)}...`);
    console.log(`- private_key ends with: ${rawServiceAccount.private_key?.slice(-30)}`);

    console.log('Attempting to initialize Firebase Admin with raw snake_case object...');

    // Initialize Firebase Admin SDK with the credential object
    // Pass the raw object directly, as the error asks for 'project_id'
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert(rawServiceAccount as any), // Use raw object, cast to any to bypass TS type check
      // databaseURL: `https://${rawServiceAccount.project_id}.firebaseio.com` // Adjust if needed
    });

    console.log('Firebase Admin SDK initialized successfully using Base64 encoded service account.');
    return firebaseAdminInstance;

  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK from Base64 variable:', error);
    if (error instanceof SyntaxError) {
      console.error('Error parsing decoded JSON. Ensure the Base64 variable contains valid JSON.');
    } else if (error.message.includes('base64')) {
       console.error('Error decoding Base64 string. Ensure the environment variable is correctly encoded.');
    }
    throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
  }
}

// Export functions to get specific services, ensuring initialization first
function getAdminAuth() {
  const app = initializeFirebaseAdmin();
  return app.auth();
}

function getAdminDb() {
  const app = initializeFirebaseAdmin();
  return app.firestore();
}

function getAdminStorage() {
  const app = initializeFirebaseAdmin();
  return app.storage();
}

// Keep the admin export if needed elsewhere, but ensure it's initialized
const getAdmin = () => {
    initializeFirebaseAdmin();
    return admin; 
}

export { getAdminAuth, getAdminDb, getAdminStorage, getAdmin };

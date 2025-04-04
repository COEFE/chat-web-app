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
    
    // Parse the JSON string into a raw object (since keys are snake_case)
    const rawServiceAccount = JSON.parse(decodedServiceAccount);

    // Map snake_case keys from JSON to camelCase keys for ServiceAccount type
    const serviceAccount: ServiceAccount = {
      projectId: rawServiceAccount.project_id,
      clientEmail: rawServiceAccount.client_email,
      privateKey: rawServiceAccount.private_key,
      // Include other potential fields if necessary, mapping them similarly
      // client_id: rawServiceAccount.client_id,
      // auth_uri: rawServiceAccount.auth_uri, 
      // etc.
    };

    // Detailed logging of the *mapped* service account structure
    console.log('Mapped Service Account Object Structure (for SDK): ');
    console.log(`- Type: ${typeof serviceAccount}`);
    console.log(`- Keys: ${Object.keys(serviceAccount).join(', ')}`);
    console.log(`- projectId: ${serviceAccount.projectId}`); // Use mapped camelCase
    console.log(`- clientEmail: ${serviceAccount.clientEmail}`); // Use mapped camelCase
    console.log(`- privateKey type: ${typeof serviceAccount.privateKey}`);
    console.log(`- privateKey length: ${serviceAccount.privateKey?.length}`);
    console.log(`- privateKey starts with: ${serviceAccount.privateKey?.substring(0, 30)}...`); // Check start
    console.log(`- privateKey ends with: ${serviceAccount.privateKey?.slice(-30)}`); // Check end

    // Log basic info for verification (avoid logging the full key)
    console.log('Successfully decoded and parsed service account from Base64 variable.');
    console.log(`- Project ID: ${serviceAccount.projectId}`);
    console.log(`- Client Email: ${serviceAccount.clientEmail}`);
    
    // Initialize Firebase Admin with the decoded service account object
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Optionally add databaseURL if needed, typically inferred
      // databaseURL: `https://${serviceAccount.projectId}.firebaseio.com` 
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

import admin, { ServiceAccount } from 'firebase-admin';

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

/**
 * Loads the Firebase Service Account configuration from individual environment variables.
 */
function loadServiceAccount(): ServiceAccount | undefined {
  console.log('[FirebaseAdmin] Attempting to load service account from individual environment variables...');

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'); // Replace \n with actual newlines
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  // Add other necessary fields if they are set as env vars
  const privateKeyId = process.env.FIREBASE_PRIVATE_KEY_ID;
  const clientId = process.env.FIREBASE_CLIENT_ID;
  // Optional fields often used by the SDK, provide defaults or read from env if set
  const authUri = process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth';
  const tokenUri = process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token';
  const authProviderX509CertUrl = process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL || 'https://www.googleapis.com/oauth2/v1/certs';
  const clientX509CertUrl = process.env.FIREBASE_CLIENT_X509_CERT_URL;

  // Basic check for required fields
  if (!projectId || !privateKey || !clientEmail) {
    console.warn('[FirebaseAdmin] Missing required environment variables for service account (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL).');
    return undefined;
  }

  console.log('[FirebaseAdmin] Found required individual environment variables.');

  // Construct the ServiceAccount object
  const serviceAccount: ServiceAccount = {
    projectId: projectId,
    privateKey: privateKey,
    clientEmail: clientEmail,
    // Include optional fields if found, otherwise SDK might infer or not need them
    ...(privateKeyId && { private_key_id: privateKeyId }), // Note: SDK might expect snake_case here
    ...(clientId && { client_id: clientId }), // Note: SDK might expect snake_case here
    type: 'service_account', // This is standard
    auth_uri: authUri, // Use snake_case as per typical JSON format
    token_uri: tokenUri,
    auth_provider_x509_cert_url: authProviderX509CertUrl,
    ...(clientX509CertUrl && { client_x509_cert_url: clientX509CertUrl }),
  };

  // Log constructed object structure (excluding private key for safety)
  console.log(`[FirebaseAdmin] Constructed ServiceAccount object with projectId: ${serviceAccount.projectId}, clientEmail: ${serviceAccount.clientEmail}`);

  return serviceAccount;
}

/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses a service account configuration derived from environment variables or ADC.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  // Check if already initialized
  if (admin.apps.length > 0) {
    console.log('[FirebaseAdmin] Firebase Admin SDK already initialized.');
    return admin.app();
  }

  console.log('[FirebaseAdmin] Attempting to initialize Firebase Admin SDK...');
  const serviceAccount = loadServiceAccount();

  // Try initializing with the constructed service account first
  if (serviceAccount) {
    try {
      console.log('[FirebaseAdmin] Attempting initialization with constructed service account...');
      const app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount), // Pass the constructed object
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app',
      });
      console.log(`[FirebaseAdmin] Firebase Admin SDK initialized successfully with project ID: ${serviceAccount.projectId}`);
      return app;
    } catch (error: any) {
      console.error('[FirebaseAdmin] Failed to initialize with constructed service account:', error.message);
      // Fall through to try ADC
    }
  } else {
    console.log('[FirebaseAdmin] Service account details not found in environment variables.');
  }

  // Fallback to Application Default Credentials
  try {
    console.log('[FirebaseAdmin] Trying to initialize with Application Default Credentials...');
    const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'web-chat-app-fa7f0.firebasestorage.app';
    console.log(`[FirebaseAdmin] Using storage bucket with ADC: ${storageBucket}`);
    const app = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      storageBucket: storageBucket
    });
    console.log('[FirebaseAdmin] Firebase Admin SDK initialized successfully with Application Default Credentials.');
    return app;
  } catch (adcError: any) {
    console.error('[FirebaseAdmin] Application Default Credentials failed:', adcError.message);
    throw new Error('Failed to initialize Firebase Admin SDK using any method.');
  }
}

/**
 * Gets the initialized Firebase Admin App instance.
 */
export function getFirebaseAdmin(): admin.app.App {
  return initializeFirebaseAdmin();
}

/**
 * Gets the Firestore database instance.
 */
export function getAdminDb(): admin.firestore.Firestore {
  const app = getFirebaseAdmin();
  return admin.firestore(app);
}

/**
 * Gets the Firebase Storage instance.
 */
export function getAdminStorage(): admin.storage.Storage {
  const app = getFirebaseAdmin();
  return admin.storage(app);
}

/**
 * Gets the Firebase Auth instance.
 */
export function getAdminAuth(): admin.auth.Auth {
  const app = getFirebaseAdmin();
  return admin.auth(app);
}

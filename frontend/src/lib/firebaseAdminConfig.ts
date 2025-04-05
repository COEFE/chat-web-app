import admin, { ServiceAccount } from 'firebase-admin';

let firebaseAdminInstance: admin.app.App | null = null;

// For debugging Vercel environment issues
const isVercel = process.env.VERCEL === '1';
const environment = isVercel ? 'Vercel' : 'Local';
console.log(`Running in ${environment} environment`);

// Create a service account from environment variables or direct JSON
const serviceAccount = {
  type: 'service_account',
  project_id: 'web-chat-app-fa7f0',
  private_key_id: '99a5d24a3efee832bf078cd21c1463eb24bb5846',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC64uQKBVr6G7ER\n4rHiMa+QqwBIKzLGixq87K8Oim1dAeXvO4C30eeV8x8dQDHGmJ58exnFX4ixS9OH\nP43sRwfOjl2QLu9ty0T3YWhep6+DAAazZX6OHmcv2OIdV3BR5VvWIR7vzE6ACIwm\nC1YpyQBQcrOt56ySuuf14uj0BWLBcerxspT9hwulMNRjfXlTlDOMMPwe1/h0qQZt\ny4wUDtBh0Fuz4XpYDBknQ9k+XzDW+KFRTW5noRZlg91IBvrm5r1JHX2Mn2cYXbGk\nNaRIDIeJLEzFrXR4b24/GDvIjOEzgd0hWX1/x3AcL5X0qMr2MBvcRncVgFWdHq7w\nEkWNq8DrAgMBAAECggEACbU1hqERQRgP0k+wpoD8OgtCoCfA+Hf2CJr8MPOB4NNI\nwBea2nGd57fRsEb1uaI97ADHrZgGgBHh8rmbbrWgiIX0Au8H4u/XLPPeDw9Y2k41\ntZCadVl2ShGoapZwhYs2LQuwEWF528QV5k1adCCL0qH9XBWXwlDRMdWlUjUMFI5L\n0iz6osILpdQ9Bh0jRwntbVU/uHxMNfPcuGIuW5XpAYLqXRwX0GySdybH/mN+kZWN\nKKmW1XwzKc31crOmJlxlAnDx+zlCVwXWDbuNfh4xBa0jltT/xAAJKlSQS1etsnU+\n/0gQgFM8W6clPNUUAiCmGgflQSGHxnBU5pa0t1G02QKBgQDzeHGhjOYOtwAFQiwl\nqvdPrC8Thef4nDBMKUFIMaGLzCSaHwDSzp3nAeQHdNPbEl2o0WByVTmn53qrMzAs\nmjGoyOy8lb3h/CBeY3LaI3fJZPxMMkR7x1Twebckx1xyVyrIpMGRc2wZVzGf/pgS\nmL0Kcbf3KXFCRQPqQUvqk4GVBwKBgQDEgP02IrKA9oVrEJyLt9zZTXhqwrI7/EKv\nRTMBJqlhzhnBbeP4CQm213NI8E9Ue9RXW9l4kc/70ItYSFe09QKhvEb7DgyKh0iZ\nZS+8J90F1x9Jy8oiADOyAZu/Z9yowMv6p21AN0oq3LEXYD8hJqFyuMnCcg2nYwZ9\nRoEf/qt//QKBgF2dTxvN4FuCE9jxw6XMIgGZdBRupW4bKBrwtfA7XSEyolQ8XYWw\n+lfrizEuw5L1cdvKfeoYSO39fFY9fWV4+GUstJIihXtSBWQlmvCzOIjQco4dueVa\nFJfORRQ4L5yrVYEGkIMLvWHU+/jH3NMxtWZBqXm4jprrjIDTEIymoOmbAoGABghf\nvbW6/TKUTgEojTGL2jACrmRjzGumMHNTaYmiUZpeOA4Dna3JWo+qvmaCSPm0PypW\nttjjJbv1SzSNXMTY29ZH55U61VXp6Kuul3wx0OgV0dIr1ndjHuflvC6YG6YvnPZe\n6EXKRR6ZYTpXNdFVy4vYxdtyh90GafosJKtQ4JECgYEAsROBTEaT5A4JXVW7jt7b\nvKXOCgne9vek0QRpnaAlQWc8O0vc5HwYdXWmfjiXhNGnWbX67QALeODMP+DA6tGT\nz093eG0RBDdmrYH6pvI89D5kd1asenIEn56HaBiMtDO3vk/GyZmy7lD3XQw0YcLd\n/UFewzsu6jEjOHg1aVLMq4k=\n-----END PRIVATE KEY-----\n',
  client_email: 'firebase-adminsdk-fbsvc@web-chat-app-fa7f0.iam.gserviceaccount.com',
  client_id: '110858865888826309936',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40web-chat-app-fa7f0.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com'
};

console.log(`Using service account for project: ${serviceAccount.project_id}`);
console.log(`Service account email: ${serviceAccount.client_email}`);


/**
 * Initializes the Firebase Admin SDK if it hasn't been initialized yet.
 * Uses a direct service account configuration.
 */
export function initializeFirebaseAdmin(): admin.app.App {
  if (firebaseAdminInstance) {
    // console.log('Firebase Admin SDK already initialized.');
    return firebaseAdminInstance;
  }

  console.log('Attempting to initialize Firebase Admin SDK...');

  try {
    // Initialize with the hardcoded service account
    console.log('Initializing with direct service account configuration...');
    
    // Use the service account directly
    firebaseAdminInstance = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as ServiceAccount),
      storageBucket: `${serviceAccount.project_id}.appspot.com`
    });
    
    console.log(`Firebase Admin SDK initialized successfully with project ID: ${serviceAccount.project_id}`);
    return firebaseAdminInstance;
  } catch (error: any) {
    console.error('Failed to initialize Firebase Admin SDK:', error);
    
    // Fallback to Application Default Credentials if available
    try {
      console.log('Trying to initialize with Application Default Credentials as fallback...');
      firebaseAdminInstance = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      console.log('Firebase Admin SDK initialized successfully with Application Default Credentials.');
      return firebaseAdminInstance;
    } catch (adcError) {
      console.error('Application Default Credentials also failed:', adcError);
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

import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, getApps, cert, AppOptions } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (!getApps().length) {
  /**
   * Gracefully initialize Firebase Admin.
   * If a service account key is provided, use it.
   * Otherwise fall back to Application Default Credentials so that
   * the build process does not crash when the env var is missing.
   */
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    let options: AppOptions | undefined;

    if (serviceAccountJson) {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed && typeof parsed === 'object' && parsed.project_id) {
        options = { credential: cert(parsed as any) };
      }
    }

    if (options) {
      initializeApp(options);
    } else {
      // Fall back – will use ADC or emulator creds
      initializeApp();
    }
  } catch (e) {
    console.warn('[FirebaseAdmin] Failed to parse service account JSON, falling back to default credentials. Error:', e);
    initializeApp();
  }
}

/**
 * Authenticate a request using Firebase Auth token
 * @returns The authenticated user or null if not authenticated
 */
export async function auth(req?: NextRequest) {
  try {
    // Get token from Authorization header or cookies
    let token;
    
    if (req) {
      // Get from Authorization header
      const authHeader = req.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split('Bearer ')[1];
      }
    } else {
      // Get from cookies in server component
      const cookieStore = await cookies();
      token = cookieStore.get('token')?.value;
    }
    
    if (!token) {
      return null;
    }
    
    // Verify token with Firebase
    const decodedToken = await getAuth().verifyIdToken(token);
    
    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || '',
      picture: decodedToken.picture || '',
      getIdToken: async () => token,
    };
  } catch (error) {
    console.error('Auth error:', error);
    return null;
  }
}

/**
 * Get the current user from cookies
 * @returns The current user or null if not authenticated
 */
export async function getCurrentUser() {
  return auth();
}

/**
 * Check if a user is authenticated
 * @returns True if authenticated, false otherwise
 */
export async function isAuthenticated() {
  const user = await auth();
  return !!user;
}

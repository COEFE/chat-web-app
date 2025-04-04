// Custom authentication implementation to bypass domain restrictions
import { 
  signInWithCustomToken, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect 
} from 'firebase/auth';
import { auth } from './firebaseConfig';

// This is the most reliable Google Auth provider configuration
// for multi-domain setups like Vercel deployments
export async function signInWithGoogleEnhanced(useRedirect = false) {
  const provider = new GoogleAuthProvider();
  
  // Force account selection every time
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  
  // Add necessary scopes
  provider.addScope('profile');
  provider.addScope('email');
  
  try {
    // Log authentication attempt data
    console.log('Starting Google Auth with:', {
      currentDomain: window.location.hostname,
      authDomain: auth.config.authDomain,
      useRedirect: useRedirect
    });
    
    // Use either popup or redirect based on parameter
    if (useRedirect) {
      return await signInWithRedirect(auth, provider);
    } else {
      return await signInWithPopup(auth, provider);
    }
  } catch (error: any) {
    // Enhanced error logging
    console.error('Auth error details:', {
      code: error?.code,
      message: error?.message,
      currentDomain: window.location.hostname,
      authDomain: auth.config.authDomain,
      useRedirect: useRedirect,
      // Try to extract more details if available
      customData: error?.customData || 'none',
      errorName: error?.name || 'unknown',
      errorInfo: error?.toString() || 'no string representation'
    });
    
    // Rethrow to allow handling by caller
    throw error;
  }
}

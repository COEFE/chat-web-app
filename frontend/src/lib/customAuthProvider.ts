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
    // Enhanced logging for debugging
    const currentDomain = window.location.hostname;
    const currentOrigin = window.location.origin;
    const authDomain = auth.config.authDomain;
    
    console.log('🔍 DETAILED AUTH DEBUG:', {
      currentDomain,
      currentOrigin,
      authDomain,
      useRedirect,
      fullURL: window.location.href,
      protocol: window.location.protocol,
      port: window.location.port
    });
    
    if (useRedirect) {
      await signInWithRedirect(auth, provider);
      return null; // Redirect doesn't return immediately
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

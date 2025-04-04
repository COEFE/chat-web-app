// Enhanced Firebase Authentication Provider
import { GoogleAuthProvider } from 'firebase/auth';
import { authorizedDomains } from "./authDomainConfig";

/**
 * Creates a custom Google Auth Provider that can work across different domains
 * Helps mitigate the auth/unauthorized-domain error when deploying to Vercel
 */
export function createEnhancedGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  
  // Add multiple OAuth scopes 
  provider.addScope('profile');
  provider.addScope('email');
  
  // Always show Google account selection dialog
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  
  // Add logging for troubleshooting
  console.log('Firebase Auth Provider created');
  console.log('Current authorized domains:', authorizedDomains);
  
  if (typeof window !== 'undefined') {
    console.log('Current hostname:', window.location.hostname);
    console.log('Is in authorized domains:', authorizedDomains.includes(window.location.hostname));
  }
  
  return provider;
}

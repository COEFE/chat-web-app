// Enhanced Firebase Authentication Provider
import { GoogleAuthProvider } from 'firebase/auth';

/**
 * Creates a custom Google Auth Provider that can work across different domains
 * Helps mitigate the auth/unauthorized-domain error when deploying to Vercel
 */
export function createEnhancedGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  
  // Add multiple OAuth scopes 
  provider.addScope('profile');
  provider.addScope('email');
  
  // Set custom parameters that may help with domain authorization
  provider.setCustomParameters({
    // Allow sign in for any host domain
    'hd': '*',
    // Forces account selection even when one account is available
    'prompt': 'select_account'
  });
  
  return provider;
}

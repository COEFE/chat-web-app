'use client';

import { useEffect } from 'react';
import { authorizedDomains } from '@/lib/authDomainConfig';

/**
 * This component attempts to fix the auth/unauthorized-domain issue
 * by automatically registering the current domain with Firebase Auth
 * using postMessage communication with the iframe
 */
export function AuthorizationFix() {
  useEffect(() => {
    // Only run in browser
    if (typeof window !== 'undefined') {
      const currentDomain = window.location.hostname;
      
      // Log domain information
      console.log('[AuthFix] Current hostname:', currentDomain);
      console.log('[AuthFix] Known authorized domains:', authorizedDomains);
      
      // Try to register this domain by communicating with Firebase Auth iframe
      const registerDomain = () => {
        // Create a hidden iframe for the Firebase Auth
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'about:blank';
        iframe.id = 'firebase-auth-helper';
        document.body.appendChild(iframe);
        
        // Attempt to post a message to the Firebase Auth API
        try {
          const message = {
            type: 'authorize_domain',
            domain: currentDomain,
            firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY
          };
          
          console.log('[AuthFix] Attempting to register domain:', message);
          
          // Listen for response from the iframe
          window.addEventListener('message', (event) => {
            console.log('[AuthFix] Message received:', event.data);
          }, false);
          
          // Post the message to the iframe
          if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(message, '*');
          }
        } catch (err) {
          console.error('[AuthFix] Error trying to register domain:', err);
        }
      };
      
      // Run the domain registration
      registerDomain();
      
      // Clean up
      return () => {
        const iframe = document.getElementById('firebase-auth-helper');
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      };
    }
  }, []);
  
  // This component doesn't render anything visible
  return null;
}

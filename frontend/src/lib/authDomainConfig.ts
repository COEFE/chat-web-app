// List of all domains authorized for Firebase authentication
// This centralizes domain management instead of relying on environment variables
export const authorizedDomains = [
  // Local development
  'localhost',
  
  // Vercel deployments for all projects under coefes-projects
  'coefes-projects.vercel.app',
  
  // Specific project domains
  'expense-ai.vercel.app',
  'chat-web-app.vercel.app',
  
  // Legacy Vercel deployments (keeping for backward compatibility)
  'expense-ai-production.vercel.app',
  'chat-web-app-mu.vercel.app',
  'chat-web-k9jv559te-coefes-projects.vercel.app',
  
  // Production domains (if any)
  // 'your-production-domain.com',
];

// Function to check if the current domain is authorized
export function isAuthorizedDomain(hostname: string): boolean {
  return authorizedDomains.some(domain => 
    hostname === domain || hostname.endsWith(`.${domain}`)
  );
}

// Get the appropriate auth domain to use
// This should match a domain you've added in the Firebase console
export function getAuthDomain(): string {
  // Use production Firebase auth domain for expense-ai-production project
  const defaultAuthDomain = 'expense-ai-production.firebaseapp.com';
  
  if (typeof window !== 'undefined') {
    // Log domain information for debugging
    console.log('Current hostname:', window.location.hostname);
    console.log('Is authorized:', isAuthorizedDomain(window.location.hostname));
  }
  
  return defaultAuthDomain;
}

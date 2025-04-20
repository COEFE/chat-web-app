// frontend/src/lib/firebase/shares.ts
import { functionsInstance } from "../firebaseConfig"; // Correct import path
import { httpsCallable } from "firebase/functions";
import {
  CreateShareInput,
  CreateShareOutput,
  VerifySharePasswordInput,
  VerifySharePasswordOutput,
  GetShareDetailsInput,
  GetShareDetailsOutput,
  SendShareInviteInput,
  SendShareInviteOutput
} from "@/types/share";

/**
 * Calls the 'createShare' Firebase Cloud Function to generate a share link.
 *
 * @param options - The configuration options for the share link.
 * @returns A promise that resolves with the result containing the share ID.
 */
export const createShareLink = async (
  options: CreateShareInput
): Promise<CreateShareOutput> => {
  if (!functionsInstance) {
    throw new Error("Firebase Functions is not initialized.");
  }
  // Ensure the function name matches exactly what you deploy in Firebase Functions
  const createShareFunction = httpsCallable<CreateShareInput, CreateShareOutput>(
    functionsInstance,
    'createShare' // This name MUST match the deployed function name
  );

  try {
    console.log("Calling createShare function with options:", options);
    const result = await createShareFunction(options);
    console.log("Cloud Function result:", result.data);

    if (!result.data || !result.data.id) {
      throw new Error("Invalid response from createShare function.");
    }
    return result.data; // Contains { id: 'shareId' }
  } catch (error: any) {
    console.error("Error calling createShare function:", error);
    let errorMessage = "Failed to create share link.";
    if (error.code === 'unauthenticated') {
      errorMessage = "You must be logged in to share documents.";
    } else if (error.details?.message) {
        errorMessage = error.details.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
};

/**
 * Gets the base URL for API calls, ensuring it works in both development and production
 */
export const getBaseUrl = (): string => {
  // In production, we use the host from the window location
  // In development, we use localhost:3000
  const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  
  if (isLocalhost) {
    return 'http://localhost:3000';
  }
  
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  
  // Fallback for server-side rendering
  return 'https://your-production-domain.com';
};

/**
 * Sends an email invitation for a shared document.
 * 
 * @param options - Contains shareId, recipientEmail, and documentName.
 * @returns A promise that resolves with the result indicating success.
 */
export const sendShareInvite = async (
  options: SendShareInviteInput
): Promise<SendShareInviteOutput> => {
  if (!functionsInstance) {
    throw new Error("Firebase Functions is not initialized.");
  }

  // Create the cloud function reference
  const sendShareInviteFunction = httpsCallable<SendShareInviteInput, SendShareInviteOutput>(
    functionsInstance,
    'sendShareInvite' // This will be the name of the Firebase Function to implement
  );

  try {
    console.log("Calling sendShareInvite function with options:", options);
    const result = await sendShareInviteFunction(options);
    console.log("Cloud Function result:", result.data);

    if (!result.data || !result.data.success) {
      throw new Error("Failed to send invitation email.");
    }
    
    return result.data;
  } catch (error: any) {
    console.error("Error calling sendShareInvite function:", error);
    let errorMessage = "Failed to send invitation email.";
    
    if (error.code === 'unauthenticated') {
      errorMessage = "You must be logged in to share documents.";
    } else if (error.details?.message) {
      errorMessage = error.details.message;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
};

/**
 * Verifies a share password using the server-side API route.
 */
export const verifySharePassword = async (
    shareId: string,
    passwordAttempt: string
): Promise<VerifySharePasswordOutput> => {
    try {
        console.log(`Calling verifySharePassword for shareId: ${shareId}`);
        
        const baseUrl = getBaseUrl();
        console.log(`Using base URL: ${baseUrl}`);
        
        // Use our server-side API route instead of calling the Cloud Function directly
        const response = await fetch(`${baseUrl}/api/verify-share-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ shareId, password: passwordAttempt }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.log("Verification failed with message:", errorData.error);
            return {
                accessGranted: false,
            };
        }
        
        const data = await response.json();
        console.log("verifySharePassword result:", data);
        
        // Returns { accessGranted: boolean, token?: string }
        return data;
    } catch (error: any) {
        console.error("Error calling verifySharePassword function:", error);
        const message = error.message || 'Verification failed';
        console.log("Verification failed with message:", message);
        return {
            accessGranted: false,
        };
    }
};


/**
 * Gets share details using the server-side API route.
 * Handles password verification implicitly if needed via passwordToken.
 * 
 * This version uses a simplified API route that's more reliable in production.
 */
export const getShareDetails = async (
    shareId: string,
    passwordToken?: string
): Promise<GetShareDetailsOutput> => {
     try {
         console.log(`Calling getShareDetails for shareId: ${shareId}`);
         
         const baseUrl = getBaseUrl();
         console.log(`Using base URL for share details: ${baseUrl}`);
         
         // Try the simplified API route first for better reliability
         const response = await fetch(`${baseUrl}/api/share-details-simple`, {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
             },
             body: JSON.stringify({ shareId, passwordToken }),
         });
         
         if (!response.ok) {
             const errorData = await response.json();
             throw new Error(errorData.error || 'Failed to get share details');
         }
         
         const data = await response.json();
         console.log("getShareDetails result:", data);
         
         return data;
     } catch (error: any) {
         console.error("Error calling getShareDetails function:", error);
         throw error;
     }
};

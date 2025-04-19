// frontend/src/lib/firebase/shares.ts
import { functionsInstance } from "../firebaseConfig"; // Correct import path
import { httpsCallable } from "firebase/functions";
import {
  CreateShareInput,
  CreateShareOutput,
  VerifySharePasswordInput,
  VerifySharePasswordOutput,
  GetShareDetailsInput,
  GetShareDetailsOutput
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
 * Verifies a share password using the server-side API route.
 */
export const verifySharePassword = async (
    shareId: string,
    passwordAttempt: string
): Promise<VerifySharePasswordOutput> => {
    try {
        console.log(`Calling verifySharePassword for shareId: ${shareId}`);
        
        // Use our server-side API route instead of calling the Cloud Function directly
        const response = await fetch('/api/verify-share-password', {
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
 */
export const getShareDetails = async (
    shareId: string,
    passwordToken?: string
): Promise<GetShareDetailsOutput> => {
     try {
         console.log(`Calling getShareDetails for shareId: ${shareId}`);
         
         // Use our server-side API route instead of calling the Cloud Function directly
         const response = await fetch('/api/share-details', {
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

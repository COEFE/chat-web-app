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
 * Calls the 'verifySharePassword' Firebase Cloud Function.
 */
export const verifySharePassword = async (
    shareId: string,
    passwordAttempt: string
): Promise<VerifySharePasswordOutput> => {
    if (!functionsInstance) throw new Error("Firebase Functions not initialized.");

    const verifyPasswordFunction = httpsCallable<VerifySharePasswordInput, VerifySharePasswordOutput>(
        functionsInstance,
        'verifySharePassword' // MUST match deployed function name
    );

    try {
        console.log(`Calling verifySharePassword for shareId: ${shareId}`);
        const result = await verifyPasswordFunction({ shareId, passwordAttempt });
        console.log("verifySharePassword result:", result.data);

        if (!result.data) {
            throw new Error("Invalid response from verifySharePassword function.");
        }
        // Returns { accessGranted: boolean, token?: string }
        return result.data;
    } catch (error: any) {
        console.error("Error calling verifySharePassword function:", error);
        // Return access denied on error to be safe, maybe include error message?
        // Check if the error structure includes a specific message from the function
        const message = error.details?.message || error.message || 'Verification failed';
        console.log("Verification failed with message:", message);
        return {
            accessGranted: false,
            // Pass the error message back if available
            // error: message
         };
    }
};


/**
 * Calls the 'getShareDetails' Firebase Cloud Function.
 * Handles password verification implicitly if needed via passwordToken.
 */
export const getShareDetails = async (
    shareId: string,
    passwordToken?: string
): Promise<GetShareDetailsOutput> => {
     if (!functionsInstance) throw new Error("Firebase Functions not initialized.");

     const getDetailsFunction = httpsCallable<GetShareDetailsInput, GetShareDetailsOutput>(
         functionsInstance,
         'getShareDetails' // MUST match deployed function name
     );

     try {
         console.log(`Calling getShareDetails for shareId: ${shareId} ${passwordToken ? 'with token' : ''}`);
         const result = await getDetailsFunction({ shareId, passwordToken });
         console.log("getShareDetails result:", result.data);

         if (!result.data || !result.data.id) {
            throw new Error("Invalid response from getShareDetails function.");
         }

         return result.data; // Contains ShareDetails + requiresPassword
     } catch (error: any) {
         console.error("Error calling getShareDetails function:", error);
         // Rethrow or handle specific errors (e.g., 'not-found', 'permission-denied', 'invalid-password-token')
         // Let the caller handle the error based on code/message
         throw error;
     }
 };

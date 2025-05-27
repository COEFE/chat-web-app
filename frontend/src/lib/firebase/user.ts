import { db, auth } from '@/lib/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';

/**
 * Interface for user data
 */
export interface UserData {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: number;
  lastLogin?: number;
}

/**
 * Gets the current user's data from Firestore
 * 
 * @returns A promise that resolves with the user data or null if not found
 */
export const getUserData = async (): Promise<UserData | null> => {
  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      console.warn('No user is currently signed in');
      return null;
    }
    
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      console.warn(`User document not found for uid: ${currentUser.uid}`);
      
      // Return basic data from auth if Firestore document doesn't exist
      return {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || undefined,
        photoURL: currentUser.photoURL || undefined,
      };
    }
    
    // Return the user data from Firestore
    return {
      uid: currentUser.uid,
      ...userDoc.data(),
    } as UserData;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

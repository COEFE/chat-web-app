'use client'; // Provider needs client-side hooks (useState, useEffect)

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { auth } from '@/lib/firebaseConfig'; // Import your initialized auth instance
import { useRouter } from 'next/navigation';

// Define the shape of the context data
interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

// Create the context with a default value (or null)
// Using 'undefined' initially to better distinguish between loading and no user
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Define the props for the provider component
interface AuthProviderProps {
  children: ReactNode;
}

// Create the provider component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Start loading until auth state is determined
  const router = useRouter();

  useEffect(() => {
    // Subscribe to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
      console.log('Auth State Changed:', currentUser?.email);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []); // Empty dependency array ensures this runs only once on mount

  const logout = async () => {
    setLoading(true); // Optionally set loading during logout
    try {
      await signOut(auth);
      setUser(null); // Clear user state immediately
      router.push('/login'); // Redirect to login after logout
      console.log('User logged out successfully');
    } catch (error) {
      console.error('Logout Error:', error);
      // Handle logout error (e.g., display a message)
    } finally {
      setLoading(false);
    }
  };

  // Value object passed to the provider
  const value = {
    user,
    loading,
    logout,
  };

  // Render the provider with the context value, wrapping the children
  // Don't render children until loading is finished to prevent flashes of incorrect UI
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// Create a custom hook for easy consumption of the context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

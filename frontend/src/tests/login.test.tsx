import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LoginPage from '../app/login/page';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { signInWithPopup } from 'firebase/auth';

// Mock the Next.js router
jest.mock('next/navigation', () => ({
  useRouter: jest.fn()
}));

// Mock the auth context
jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn()
}));

// Mock Firebase auth
jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn().mockImplementation(() => ({
    addScope: jest.fn(),
    setCustomParameters: jest.fn()
  }))
}));

// Mock our enhanced provider
jest.mock('@/lib/firebaseAuthProvider', () => ({
  createEnhancedGoogleProvider: jest.fn().mockImplementation(() => ({
    addScope: jest.fn(),
    setCustomParameters: jest.fn()
  }))
}));

// Mock the Firebase config
jest.mock('@/lib/firebaseConfig', () => ({
  auth: {}
}));

describe('LoginPage', () => {
  const mockPush = jest.fn();
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock router
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush
    });
    
    // Default auth context values
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      loading: false
    });
  });

  test('renders the login button', () => {
    render(<LoginPage />);
    expect(screen.getByText(/sign in with google/i)).toBeInTheDocument();
  });

  test('redirects to dashboard when user is already logged in', () => {
    // Mock a logged-in user
    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: '123' },
      loading: false
    });
    
    render(<LoginPage />);
    
    // Should immediately redirect
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  test('calls signInWithPopup when login button is clicked', async () => {
    // Mock successful authentication
    (signInWithPopup as jest.Mock).mockResolvedValue({
      user: { uid: '123', email: 'test@example.com' }
    });
    
    render(<LoginPage />);
    
    // Click the login button
    fireEvent.click(screen.getByText(/sign in with google/i));
    
    // Wait for auth to complete
    await waitFor(() => {
      expect(signInWithPopup).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('displays error message when login fails', async () => {
    // Mock authentication failure
    const authError = new Error('auth/unauthorized-domain');
    (authError as any).code = 'auth/unauthorized-domain';
    (signInWithPopup as jest.Mock).mockRejectedValue(authError);
    
    render(<LoginPage />);
    
    // Click the login button
    fireEvent.click(screen.getByText(/sign in with google/i));
    
    // Wait for error message to appear
    await waitFor(() => {
      expect(screen.getByText(/auth\/unauthorized-domain/i)).toBeInTheDocument();
    });
  });
});

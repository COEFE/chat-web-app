// EmailTemplateProvider.tsx
'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ensureEmailTemplatesExist } from '@/lib/firebase/emailTemplates';

/**
 * This component initializes email templates when the app loads
 * and the user is authenticated
 */
export function EmailTemplateProvider() {
  const { user } = useAuth();

  useEffect(() => {
    // Only initialize templates when user is authenticated
    if (user) {
      // Initialize email templates in the background
      ensureEmailTemplatesExist().catch(error => {
        console.error('Failed to initialize email templates:', error);
      });
    }
  }, [user]);

  // This is a utility component that doesn't render anything
  return null;
}

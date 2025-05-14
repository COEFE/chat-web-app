import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';

export function RunJournalUserIdMigration() {
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { user } = useAuth();

  // Check authentication status when component mounts
  useEffect(() => {
    const checkAuth = async () => {
      if (user) {
        try {
          const token = await user.getIdToken();
          if (token) {
            setIsAuthenticated(true);
          }
        } catch (error) {
          console.error('Error getting auth token:', error);
        }
      }
    };
    
    checkAuth();
  }, [user]);

  const runMigration = async () => {
    setIsLoading(true);
    try {
      // Check if user is available
      if (!user) {
        toast({
          title: 'Authentication Error',
          description: 'You must be logged in to run this migration. Please refresh the page and try again.',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      let token;
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error('Error getting token:', error);
        toast({
          title: 'Authentication Error',
          description: 'Failed to get authentication token. Please refresh the page and try again.',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      if (!token) {
        toast({
          title: 'Authentication Error',
          description: 'Authentication token is missing. Please refresh the page and try again.',
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }

      const response = await fetch('/api/journals/add-user-id-column', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run migration');
      }

      if (data.alreadyExists) {
        toast({
          title: 'Migration Already Applied',
          description: 'The user_id column already exists and has been configured.',
          variant: 'default'
        });
      } else {
        toast({
          title: 'Migration Successful',
          description: 'Successfully added user_id column to journals table and associated existing journals with your user account.',
          variant: 'default'
        });
      }
    } catch (error: any) {
      console.error('Migration error:', error);
      toast({
        title: 'Migration Failed',
        description: error.message || 'An error occurred while running the migration',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={runMigration} 
      disabled={isLoading || !isAuthenticated}
      variant="default"
    >
      {isLoading ? 'Running Migration...' : 
       !isAuthenticated ? 'Waiting for Authentication...' : 
       'Associate Existing Journals with Current User'}
    </Button>
  );
}

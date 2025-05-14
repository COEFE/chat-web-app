"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, BookOpen } from "lucide-react";
import { getAuth } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

interface FixJournalsUserIdButtonProps {
  onComplete?: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  disabled?: boolean;
}

export function FixJournalsUserIdButton({
  onComplete,
  variant = "outline",
  disabled = false
}: FixJournalsUserIdButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [results, setResults] = useState<{
    success: boolean;
    message: string;
    error?: string;
    details?: any;
  } | null>(null);
  const { toast } = useToast();
  
  // Check authentication status when component mounts
  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthChecking(true);
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (user) {
          try {
            // Verify we can get a token
            const token = await user.getIdToken();
            if (token) {
              setIsAuthenticated(true);
              console.log('User authenticated for journal user_id fix');
            }
          } catch (error) {
            console.error('Error getting auth token:', error);
            setIsAuthenticated(false);
          }
        } else {
          console.log('No user is currently signed in');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking authentication:', error);
        setIsAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    };
    
    checkAuth();
  }, []);

  const handleRunFix = async () => {
    setIsRunning(true);
    setResults(null);
    
    try {
      // Check authentication first
      if (!isAuthenticated) {
        // Try to refresh authentication
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          toast({
            title: "Authentication Error",
            description: "You must be logged in to run this fix. Please refresh the page and try again.",
            variant: "destructive",
          });
          setIsRunning(false);
          return;
        }
        
        try {
          await user.getIdToken(true); // Force token refresh
          setIsAuthenticated(true);
        } catch (error) {
          toast({
            title: "Authentication Error",
            description: "Failed to refresh authentication. Please log out and log back in.",
            variant: "destructive",
          });
          setIsRunning(false);
          return;
        }
      }
      
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to run this fix. Please refresh the page and try again.",
          variant: "destructive",
        });
        setIsRunning(false);
        return;
      }
      
      let token;
      try {
        token = await user.getIdToken();
      } catch (error) {
        console.error("Error getting token:", error);
        toast({
          title: "Authentication Error",
          description: "Failed to get authentication token. Please refresh the page and try again.",
          variant: "destructive",
        });
        setIsRunning(false);
        return;
      }
      
      const response = await fetch("/api/journals/fix-journals-user-id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Error running journal user_id fix: ${response.status}`);
      }
      
      setResults({
        success: data.success,
        message: data.message,
        details: data.results
      });
      
      toast({
        title: "Success",
        description: "Journal entries data isolation fix completed successfully.",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (error: any) {
      console.error("Error running journal user_id fix:", error);
      setResults({
        success: false,
        message: "Failed to run journal user_id fix",
        error: error.message
      });
      
      toast({
        title: "Error",
        description: error.message || "Failed to run journal user_id fix",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setShowDialog(true)}
        disabled={disabled || authChecking}
        className="flex items-center gap-2"
      >
        {authChecking ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <BookOpen className="h-4 w-4" />
        )}
        Fix Journal Entries Data Isolation
      </Button>
      
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fix Journal Entries Data Isolation</DialogTitle>
            <DialogDescription>
              This will update all journal entries to ensure they are properly associated with your user account.
              This is necessary to prevent data leakage between different user accounts.
            </DialogDescription>
          </DialogHeader>
          
          {!isAuthenticated && !authChecking && (
            <Alert variant="destructive">
              <AlertTitle>Authentication Required</AlertTitle>
              <AlertDescription>
                You must be logged in to run this fix. Please refresh the page and try again.
              </AlertDescription>
            </Alert>
          )}
          
          {results && (
            <div className="max-h-[300px] overflow-y-auto border rounded-md p-4 bg-muted/20">
              <h3 className={`font-medium ${results.success ? 'text-green-600' : 'text-red-600'}`}>
                {results.success ? 'Success' : 'Error'}
              </h3>
              <p className="text-sm mt-1">{results.message}</p>
              
              {results.error && (
                <Alert variant="destructive" className="mt-2">
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="text-xs">{results.error}</AlertDescription>
                </Alert>
              )}
              
              {results.details && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Details:</h4>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {JSON.stringify(results.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setShowDialog(false)}
              disabled={isRunning}
            >
              Cancel
            </Button>
            
            <Button
              variant="destructive"
              onClick={handleRunFix}
              disabled={isRunning || !isAuthenticated}
              className="flex items-center gap-2"
            >
              {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
              {isRunning ? "Running..." : "Run Fix"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Database } from "lucide-react";
import { getAuth } from "firebase/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface RunMigrationButtonProps {
  migrationFile: string;
  buttonText?: string;
  onComplete?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  disabled?: boolean;
}

export function RunMigrationButton({ 
  migrationFile,
  buttonText = "Run Migration",
  onComplete,
  variant = "default",
  disabled = false
}: RunMigrationButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [results, setResults] = useState<{
    success: boolean;
    message: string;
    error?: string;
    details?: string;
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
              console.log('User authenticated for database migrations');
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

  const handleRunMigration = async () => {
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
            description: "You must be logged in to run database migrations. Please refresh the page and try again.",
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
          description: "You must be logged in to run database migrations. Please refresh the page and try again.",
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
      
      const response = await fetch("/api/db-migrations/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ migrationFile })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to run migration");
      }
      
      setResults({
        success: true,
        message: data.message || "Migration completed successfully"
      });
      
      toast({
        title: "Migration Successful",
        description: "Database schema has been updated.",
        variant: "default",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      console.error("Error running migration:", err);
      setResults({
        success: false,
        message: "Failed to run migration",
        error: err.message,
        details: err.details
      });
      
      toast({
        title: "Migration Failed",
        description: err.message || "An error occurred while updating database schema",
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
        disabled={isRunning || authChecking || !isAuthenticated || disabled}
      >
        {isRunning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running Migration...
          </>
        ) : authChecking ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Checking Authentication...
          </>
        ) : !isAuthenticated ? (
          <>
            <Database className="mr-2 h-4 w-4" />
            Authentication Required
          </>
        ) : (
          <>
            <Database className="mr-2 h-4 w-4" />
            {buttonText}
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run Database Migration</DialogTitle>
            <DialogDescription>
              This will run the migration script "{migrationFile}" to update your database schema.
              Make sure you understand the changes this will make.
            </DialogDescription>
          </DialogHeader>

          {results && (
            <Alert variant={results.success ? "default" : "destructive"}>
              <AlertTitle>{results.success ? "Success" : "Error"}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{results.message}</p>
                
                {results.error && (
                  <p className="text-sm text-red-600">{results.error}</p>
                )}
                
                {results.details && (
                  <details className="text-xs mt-2">
                    <summary>Technical Details</summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-auto">
                      {results.details}
                    </pre>
                  </details>
                )}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Close
            </Button>
            {!results?.success && (
              <Button onClick={handleRunMigration} disabled={isRunning}>
                {isRunning ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  "Run Migration"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

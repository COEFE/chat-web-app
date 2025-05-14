"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
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

interface FixCustomerQueriesButtonProps {
  onComplete?: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  disabled?: boolean;
}

export function FixCustomerQueriesButton({
  onComplete,
  variant = "outline",
  disabled = false
}: FixCustomerQueriesButtonProps) {
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
              console.log('User authenticated for customer queries fix');
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
      
      const response = await fetch("/api/db-migrations/fix-customer-queries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to run fix");
      }
      
      setResults({
        success: true,
        message: data.message || "Customer and invoice data isolation fix completed successfully",
        details: data.results
      });
      
      toast({
        title: "Security Fix Successful",
        description: "Customer and invoice data isolation has been fixed.",
        variant: "default",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      console.error("Error running fix:", err);
      setResults({
        success: false,
        message: "Failed to run fix",
        error: err.message,
        details: err.details
      });
      
      toast({
        title: "Fix Failed",
        description: err.message || "An error occurred while fixing customer and invoice data isolation",
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
        className="space-x-2"
      >
        {isRunning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Fixing Customer Data Isolation...</span>
          </>
        ) : authChecking ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Checking Authentication...</span>
          </>
        ) : !isAuthenticated ? (
          <>
            <Users className="h-4 w-4" />
            <span>Authentication Required</span>
          </>
        ) : (
          <>
            <Users className="h-4 w-4" />
            <span>Fix Customer Data Isolation</span>
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fix Customer Data Isolation</DialogTitle>
            <DialogDescription>
              This will add user_id columns to customer and invoice tables for proper data isolation.
              This is a critical security fix to prevent data leakage between different user accounts.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Critical Security Fix</AlertTitle>
              <AlertDescription>
                This migration adds user_id columns to customer and invoice tables that currently don't have them.
                It will associate all existing data with your user account.
              </AlertDescription>
            </Alert>
            
            {results && (
              <div className="mt-4 max-h-[300px] overflow-y-auto border rounded-md p-4">
                <h3 className="font-medium mb-2">{results.success ? "Migration Results" : "Error"}</h3>
                <p>{results.message}</p>
                
                {results.error && (
                  <p className="text-red-500 mt-2">{results.error}</p>
                )}
                
                {results.details && (
                  <div className="mt-4 space-y-2">
                    {Object.entries(results.details).map(([table, result]: [string, any]) => (
                      <div key={table} className="border-t pt-2">
                        <p className="font-medium">{table}</p>
                        <p className={result.success ? "text-green-600" : "text-red-500"}>
                          {result.message || (result.error ? `Error: ${result.error}` : '')}
                        </p>
                        {result.warning && (
                          <p className="text-amber-500 text-sm">{result.warning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter className="sm:justify-between">
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
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running...
                </>
              ) : (
                "Run Fix"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard } from "lucide-react";
import { getAuth } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";

interface FixInvoicePaymentsButtonProps {
  onComplete?: () => void;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  disabled?: boolean;
}

export function FixInvoicePaymentsButton({
  onComplete,
  variant = "outline",
  disabled = false
}: FixInvoicePaymentsButtonProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
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
              console.log('User authenticated for invoice payments fix');
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
      
      const response = await fetch("/api/db-migrations/fix-invoice-payments", {
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
      
      toast({
        title: "Fix Successful",
        description: data.message || "Invoice payments table has been fixed.",
        variant: "default",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      console.error("Error running fix:", err);
      
      toast({
        title: "Fix Failed",
        description: err.message || "An error occurred while fixing the invoice payments table",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Button
      variant={variant}
      onClick={handleRunFix}
      disabled={isRunning || authChecking || !isAuthenticated || disabled}
      className="space-x-2"
    >
      {isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Fixing Invoice Payments...</span>
        </>
      ) : authChecking ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Checking Authentication...</span>
        </>
      ) : !isAuthenticated ? (
        <>
          <CreditCard className="h-4 w-4" />
          <span>Authentication Required</span>
        </>
      ) : (
        <>
          <CreditCard className="h-4 w-4" />
          <span>Fix Invoice Payments Table</span>
        </>
      )}
    </Button>
  );
}

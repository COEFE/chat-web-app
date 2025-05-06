"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, DatabaseIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";

export function AccountSetupButton({ onComplete }: { onComplete?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSetupAccounts = async () => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to set up accounts.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      // Call the accounts setup endpoint
      const response = await fetch("/api/accounts/db-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: "Success",
        description: "Account setup completed successfully. Default chart of accounts has been created.",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("Error setting up accounts:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to set up accounts.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleSetupAccounts}
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Setting Up...
        </>
      ) : (
        <>
          <DatabaseIcon className="mr-2 h-4 w-4" />
          Setup Accounts
        </>
      )}
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";

interface JournalSetupButtonProps {
  onSetupComplete?: () => void;
}

export function JournalSetupButton({ onSetupComplete }: JournalSetupButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSetup = async () => {
    setIsLoading(true);
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to initialize journal tables");
      }
      
      const token = await user.getIdToken();

      const response = await fetch("/api/journals/db-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to set up journal tables");
      }

      toast({
        title: "Setup Complete",
        description: "Journal tables have been successfully created.",
        variant: "default",
      });

      if (onSetupComplete) {
        onSetupComplete();
      }
    } catch (err: any) {
      console.error("Error setting up journal tables:", err);
      toast({
        title: "Setup Failed",
        description: err.message || "An error occurred during setup",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button onClick={handleSetup} disabled={isLoading}>
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Setting Up...
        </>
      ) : (
        "Initialize Journal Tables"
      )}
    </Button>
  );
}

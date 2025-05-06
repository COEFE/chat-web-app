"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { Loader2 } from "lucide-react";

export function FixJournalTriggerButton({ onFixComplete }: { onFixComplete?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleFix = async () => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to fix journal triggers.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/fix-trigger", {
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
        description: result.message || "Journal trigger fixed successfully.",
      });
      
      if (onFixComplete) {
        onFixComplete();
      }
    } catch (error) {
      console.error("Error fixing journal trigger:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fix journal trigger.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleFix} 
      disabled={isLoading}
      variant="outline"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fixing Journal Trigger...
        </>
      ) : (
        "Fix Journal Trigger"
      )}
    </Button>
  );
}

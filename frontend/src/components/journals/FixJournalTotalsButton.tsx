"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { Loader2, Calculator } from "lucide-react";

export function FixJournalTotalsButton({ onComplete }: { onComplete?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fixJournalTotals = async () => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to fix journal totals.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/fix-total", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Success",
          description: result.message || "Journal totals fixed successfully. Refresh the page to see updated totals.",
        });
        
        if (onComplete) {
          onComplete();
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to fix journal totals.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fixing journal totals:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fix journal totals.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={fixJournalTotals}
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fixing Totals...
        </>
      ) : (
        <>
          <Calculator className="mr-2 h-4 w-4" />
          Fix Journal Totals
        </>
      )}
    </Button>
  );
}

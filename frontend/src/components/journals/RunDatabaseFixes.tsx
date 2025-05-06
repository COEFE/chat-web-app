"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { Loader2, DatabaseIcon } from "lucide-react";
import { sql } from "@vercel/postgres";

export function RunDatabaseFixes() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fixDatabaseTriggers = async () => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to run database fixes.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      // First attempt: Try to run the SQL directly through the API
      const response = await fetch("/api/journals/run-fix-query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          sql: `
            -- Drop the older row-level trigger (fires for each row) that causes false imbalance errors
            DROP TRIGGER IF EXISTS ensure_journal_balanced ON journal_lines;
            
            -- Drop the corresponding function as it is no longer needed
            DROP FUNCTION IF EXISTS check_journal_balanced();
          `
        })
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Database triggers fixed successfully. You should now be able to create balanced journal entries.",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to fix database triggers.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error fixing database triggers:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fix database triggers.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={fixDatabaseTriggers}
      disabled={isLoading}
      variant="destructive"
      size="sm"
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Fixing DB...
        </>
      ) : (
        <>
          <DatabaseIcon className="mr-2 h-4 w-4" />
          Fix Balance Triggers
        </>
      )}
    </Button>
  );
}

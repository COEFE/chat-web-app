"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { Loader2 } from "lucide-react";

interface RunMigrationsButtonProps {
  onComplete?: () => void;
  showFixBalanceOption?: boolean;
}

export function RunMigrationsButton({ onComplete, showFixBalanceOption }: RunMigrationsButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleRunMigrations = async (skipFirst = false, runSpecific = false) => {
    try {
      setIsLoading(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to run database migrations.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      // Prepare request body
      const requestBody: Record<string, any> = {};
      if (skipFirst) {
        requestBody.skipMigrations = ['001_journal_balance'];
        requestBody.migrationName = '002_statement';
      }
      
      // Run only specific migrations if requested
      if (runSpecific) {
        requestBody.migrationName = '003_drop_row_level_balance_trigger';
      }
      
      const response = await fetch("/api/journals/migrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Database migrations completed successfully.",
        });
      } else {
        const failedMigrations = result.results
          .filter((r: any) => r.status === "error")
          .map((r: any) => r.file)
          .join(", ");
          
        // If the error was about constraints already existing and we didn't skip the first migration,
        // offer to run just the second migration
        if (!skipFirst && failedMigrations.includes('001_journal_balance')) {
          toast({
            title: "Constraints Already Exist",
            description: "Would you like to run only the statement-level trigger migration?",
            action: (
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleRunMigrations(true)}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Yes, Fix Trigger
                </button>
              </div>
            ),
          });
          return;
        }
        
        // If there's a journal balance error, offer to run the trigger-fix migration
        if (failedMigrations.includes('002_statement_level_trigger') || 
            result.results.some((r: any) => r.error && r.error.includes('Journal entry is not balanced'))) {
          toast({
            title: "Balance Check Conflict",
            description: "Would you like to run the migration that fixes conflicting balance triggers?",
            action: (
              <div className="flex space-x-2">
                <button 
                  onClick={() => handleRunMigrations(false, true)}
                  className="px-3 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Yes, Fix Balance Triggers
                </button>
              </div>
            ),
          });
          return;
        }
          
        toast({
          title: "Warning",
          description: `Some migrations failed: ${failedMigrations}`,
          variant: "destructive",
        });
      }
      
      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error("Error running migrations:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to run migrations.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex space-x-2">
      <Button 
        onClick={() => handleRunMigrations(false, false)}
        disabled={isLoading}
        size="sm"
        variant="secondary"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running Migrations...
          </>
        ) : (
          "Run Database Migrations"
        )}
      </Button>
      
      {showFixBalanceOption && (
        <Button 
          onClick={() => handleRunMigrations(false, true)}
          disabled={isLoading}
          size="sm"
          variant="destructive"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Fixing...
            </>
          ) : (
            "Fix Balance Triggers"
          )}
        </Button>
      )}
    </div>
  );
}

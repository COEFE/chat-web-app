"use client";

import { useState } from "react";
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

export function RunAllMigrationsButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [results, setResults] = useState<{
    success: boolean;
    message: string;
    error?: string;
    details?: string;
    migrationResults?: Array<{
      file: string;
      success: boolean;
      message?: string;
      error?: string;
      skipped?: boolean;
    }>;
  } | null>(null);
  const { toast } = useToast();

  const handleRunAllMigrations = async () => {
    setIsRunning(true);
    setResults(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to run database migrations");
      }
      
      const token = await user.getIdToken();
      
      // Use the run-all endpoint instead of the regular migration endpoint
      const response = await fetch("/api/db-migrations/run-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to run migrations");
      }
      
      setResults({
        success: true,
        message: data.message || "All migrations completed successfully",
        migrationResults: data.results
      });
      
      toast({
        title: "Migrations Successful",
        description: data.message || "Database schema has been updated",
        variant: "default",
      });
    } catch (err: any) {
      console.error("Error running migrations:", err);
      setResults({
        success: false,
        message: "Failed to run migrations",
        error: err.message,
        details: err.details
      });
      
      toast({
        title: "Migrations Failed",
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
        variant="default"
        size="default"
        onClick={() => setShowDialog(true)}
        disabled={isRunning}
      >
        {isRunning ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running Migrations...
          </>
        ) : (
          <>
            <Database className="mr-2 h-4 w-4" />
            Run All Pending Migrations
          </>
        )}
      </Button>
      
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Run Database Migrations</DialogTitle>
            <DialogDescription>
              This will run all pending database migrations in the correct order. 
              This operation cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          {!results ? (
            <div className="py-4">
              <p className="mb-4">Are you sure you want to run all pending migrations?</p>
              
              <DialogFooter className="flex justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDialog(false)}
                  disabled={isRunning}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleRunAllMigrations}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    "Run All Migrations"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="py-4">
              <Alert variant={results.success ? "default" : "destructive"} className="mb-4">
                <AlertTitle>{results.success ? "Success" : "Error"}</AlertTitle>
                <AlertDescription>{results.message}</AlertDescription>
              </Alert>
              
              {results.error && (
                <div className="text-sm text-destructive mb-4">
                  <p className="font-semibold">Error details:</p>
                  <p className="whitespace-pre-wrap">{results.error}</p>
                </div>
              )}
              
              {results.migrationResults && results.migrationResults.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-semibold mb-2">Migration Results:</h4>
                  <div className="max-h-60 overflow-y-auto rounded border p-2">
                    {results.migrationResults.map((result, index) => (
                      <div 
                        key={index} 
                        className={`py-1 px-2 mb-1 text-xs rounded ${
                          result.skipped 
                            ? "bg-muted text-muted-foreground" 
                            : result.success 
                              ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" 
                              : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300"
                        }`}
                      >
                        <span className="font-semibold">{result.file}</span>: {
                          result.skipped 
                            ? "Already applied" 
                            : result.success 
                              ? result.message || "Success" 
                              : result.error || "Failed"
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <DialogFooter className="mt-4">
                <Button 
                  variant="default" 
                  onClick={() => setShowDialog(false)}
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

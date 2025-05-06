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

interface FixAuditSchemaButtonProps {
  onComplete?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
}

export function FixAuditSchemaButton({ 
  onComplete,
  variant = "default"
}: FixAuditSchemaButtonProps) {
  const [isFixing, setIsFixing] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [results, setResults] = useState<{
    success: boolean;
    message: string;
    columns?: string[];
    error?: string;
  } | null>(null);
  const { toast } = useToast();

  const handleFix = async () => {
    setIsFixing(true);
    setResults(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to fix database schema");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/audit-setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fix audit schema");
      }
      
      setResults({
        success: true,
        message: data.message || "Schema fixed successfully",
        columns: data.columns
      });
      
      toast({
        title: "Schema Fixed",
        description: "Journal audit table schema has been updated.",
        variant: "default",
      });
      
      if (onComplete) {
        onComplete();
      }
    } catch (err: any) {
      console.error("Error fixing audit schema:", err);
      setResults({
        success: false,
        message: "Failed to fix audit schema",
        error: err.message
      });
      
      toast({
        title: "Schema Fix Failed",
        description: err.message || "An error occurred while fixing schema",
        variant: "destructive",
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setShowDialog(true)}
        disabled={isFixing}
      >
        {isFixing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Fixing Schema...
          </>
        ) : (
          <>
            <Database className="mr-2 h-4 w-4" />
            Fix Audit Schema
          </>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fix Journal Audit Schema</DialogTitle>
            <DialogDescription>
              This will add any missing columns to the journal_audit table to resolve posting issues.
            </DialogDescription>
          </DialogHeader>

          {results && (
            <Alert variant={results.success ? "default" : "destructive"}>
              <AlertTitle>{results.success ? "Success" : "Error"}</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{results.message}</p>
                
                {results.columns && (
                  <div>
                    <p className="font-semibold mt-2">Table columns:</p>
                    <ul className="list-disc pl-5">
                      {results.columns.map(col => (
                        <li key={col}>{col}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {results.error && (
                  <p className="text-sm text-red-600">{results.error}</p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Close
            </Button>
            {!results?.success && (
              <Button onClick={handleFix} disabled={isFixing}>
                {isFixing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fixing...
                  </>
                ) : (
                  "Fix Schema"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

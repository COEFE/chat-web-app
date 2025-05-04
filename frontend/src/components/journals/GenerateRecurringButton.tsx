"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";

interface GenerateRecurringButtonProps {
  onGenerateComplete?: () => void;
}

export function GenerateRecurringButton({ onGenerateComplete }: GenerateRecurringButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [results, setResults] = useState<{
    generated: number;
    skipped: number;
    errors: number;
    details: string[];
  } | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsGenerating(true);
    setResults(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to generate recurring entries");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/recurring/generate", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to generate recurring journal entries");
      }
      
      setResults(data.results);
      
      toast({
        title: "Generation Complete",
        description: `Generated ${data.results.generated} journal entries`,
        variant: "default",
      });
      
      if (onGenerateComplete) {
        onGenerateComplete();
      }
    } catch (err: any) {
      console.error("Error generating recurring journals:", err);
      toast({
        title: "Error",
        description: err.message || "An error occurred while generating recurring journal entries",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowDialog(true)}
        disabled={isGenerating}
      >
        <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
        Generate Recurring Entries
      </Button>
      
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Recurring Journal Entries</DialogTitle>
            <DialogDescription>
              This will create new journal entries based on your recurring journal configurations.
            </DialogDescription>
          </DialogHeader>
          
          {results ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-muted p-3 rounded-md text-center">
                  <div className="text-2xl font-bold">{results.generated}</div>
                  <div className="text-sm text-muted-foreground">Generated</div>
                </div>
                <div className="bg-muted p-3 rounded-md text-center">
                  <div className="text-2xl font-bold">{results.skipped}</div>
                  <div className="text-sm text-muted-foreground">Skipped</div>
                </div>
                <div className="bg-muted p-3 rounded-md text-center">
                  <div className="text-2xl font-bold">{results.errors}</div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
              </div>
              
              {results.details.length > 0 && (
                <>
                  <Separator />
                  <div className="max-h-60 overflow-y-auto">
                    <h4 className="text-sm font-medium mb-2">Details:</h4>
                    <ul className="text-sm space-y-1">
                      {results.details.map((detail, index) => (
                        <li key={index} className="text-muted-foreground">
                          • {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Alert>
              <AlertTitle>Are you sure?</AlertTitle>
              <AlertDescription>
                This will generate new journal entries based on your recurring journal configurations.
                Only entries that are due to be generated will be created.
              </AlertDescription>
            </Alert>
          )}
          
          <DialogFooter>
            {!results ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  disabled={isGenerating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                >
                  {isGenerating ? "Generating..." : "Generate Entries"}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setShowDialog(false)}
              >
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

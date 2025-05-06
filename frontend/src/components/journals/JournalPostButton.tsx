"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle } from "lucide-react";
import { getAuth } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface JournalPostButtonProps {
  journalId: number;
  onPostComplete: () => void;
}

export function JournalPostButton({ journalId, onPostComplete }: JournalPostButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const handlePost = async () => {
    setIsLoading(true);
    try {
      // Log the journal ID for debugging
      console.log("Journal ID being sent:", journalId, "Type:", typeof journalId);
      
      // Validate the journal ID
      if (journalId === undefined || journalId === null) {
        throw new Error("Journal ID is missing");
      }
      
      // Convert to number and validate
      const validJournalId = Number(journalId);
      console.log("Converted journal ID:", validJournalId, "isNaN:", isNaN(validJournalId));
      
      if (isNaN(validJournalId)) {
        throw new Error(`Invalid journal ID: '${journalId}' is not a valid number`);
      }
      
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to post journal entries");
      }
      
      const token = await user.getIdToken();
      
      // Use string interpolation carefully
      const apiUrl = `/api/journals/${validJournalId}/post`;
      console.log("API URL being called:", apiUrl);
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to post journal entry");
      }

      toast({
        title: "Journal Posted",
        description: "Journal entry has been successfully posted.",
        variant: "default",
      });

      onPostComplete();
    } catch (err: any) {
      console.error("Error posting journal entry:", err);
      toast({
        title: "Posting Failed",
        description: err.message || "An error occurred while posting the journal entry",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setDialogOpen(false);
    }
  };

  return (
    <>
      <Button 
        variant="outline" 
        onClick={() => setDialogOpen(true)}
        className="flex items-center"
      >
        <CheckCircle className="mr-2 h-4 w-4" />
        Post Journal
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post Journal Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to post this journal entry? This action cannot be undone.
              Once posted, the journal entry cannot be modified or deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handlePost();
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Posting...
                </>
              ) : (
                "Post Journal"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

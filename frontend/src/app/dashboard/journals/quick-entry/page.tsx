"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { QuickEntryForm } from "@/components/journals/QuickEntryForm";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { AccountNode } from "@/components/accounts/AccountTree";

export default function QuickEntryPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch accounts on component mount
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          toast({
            title: "Authentication Error",
            description: "You must be logged in to access this page.",
            variant: "destructive",
          });
          router.push("/login");
          return;
        }
        
        const token = await user.getIdToken();
        
        const response = await fetch("/api/accounts/hierarchy", {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching accounts: ${response.status}`);
        }
        
        const data = await response.json();
        
        // The API returns { accounts: [...], flatAccounts: [...] }
        // We need the accounts array which contains the hierarchical structure
        setAccounts(data.accounts || []);
        
        // Log the accounts data for debugging
        console.log("Accounts data:", data);
      } catch (error) {
        console.error("Error fetching accounts:", error);
        toast({
          title: "Error",
          description: "Failed to load accounts. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchAccounts();
  }, [router, toast]);

  // Handle journal entry submission
  const handleSaveJournal = async (journalEntry: any) => {
    try {
      setSubmitting(true);
      
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "You must be logged in to submit a journal entry.",
          variant: "destructive",
        });
        return;
      }
      
      const token = await user.getIdToken();
      
      // Format the journal entry for API submission
      const formattedEntry = {
        date: journalEntry.date.toISOString().split("T")[0],
        memo: journalEntry.memo,
        source: journalEntry.source || "Quick Entry",
        lines: journalEntry.lines.map((line: any) => ({
          account_id: parseInt(line.account_id),
          debit: line.debit ? parseFloat(line.debit) : 0,
          credit: line.credit ? parseFloat(line.credit) : 0,
          description: line.description || "",
        })),
      };
      
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(formattedEntry),
      });
      
      if (!response.ok) {
        throw new Error(`Error creating journal entry: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: "Success",
        description: `Journal entry #${result.id} created successfully.`,
      });
      
    } catch (error) {
      console.error("Error saving journal entry:", error);
      toast({
        title: "Error",
        description: "Failed to save journal entry. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quick Journal Entry</h1>
          <p className="text-muted-foreground">
            Enter journal entries in a spreadsheet-like interface
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/dashboard/journals")}
          className="flex items-center"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Journals
        </Button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading accounts...</span>
        </div>
      ) : (
        <QuickEntryForm 
          accounts={accounts} 
          onSubmit={handleSaveJournal} 
          isSubmitting={submitting}
        />
      )}
    </div>
  );
}

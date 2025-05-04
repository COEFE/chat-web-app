"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, RefreshCcw, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// Import DateRange type from react-day-picker
import { DateRange } from "react-day-picker";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { JournalTable, JournalEntry } from "@/components/journals/JournalTable";
import { JournalEntryForm } from "@/components/journals/JournalEntryForm";
import { JournalView } from "@/components/journals/JournalView";
import { JournalSetupButton } from "@/components/journals/JournalSetupButton";
import { AccountNode } from "@/components/accounts/AccountTree";

export default function JournalsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("manage");
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  
  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<JournalEntry | null>(null);
  
  // Date filter state
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: undefined,
    to: undefined,
  });

  // Fetch journals on initial load and when filters change
  useEffect(() => {
    fetchJournals();
    fetchAccounts();
  }, [dateRange]);

  // Fetch journal entries
  const fetchJournals = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      let url = "/api/journals";
      const params = new URLSearchParams();
      
      if (dateRange?.from) {
        params.append("startDate", format(dateRange.from, "yyyy-MM-dd"));
      }
      
      if (dateRange?.to) {
        params.append("endDate", format(dateRange.to, "yyyy-MM-dd"));
      }
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch journal entries");
      }
      
      if (data.setupRequired) {
        setSetupRequired(true);
        setError("Journal tables are not set up. Please initialize the database.");
      } else {
        setSetupRequired(false);
        setJournals(data.journals || []);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching journal entries");
      console.error("Error fetching journals:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch accounts for form
  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/accounts/hierarchy");
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch accounts");
      }
      
      setAccounts(data.hierarchy || []);
    } catch (err: any) {
      console.error("Error fetching accounts:", err);
    }
  };

  // Handle creating a new journal entry
  const handleCreateJournal = async (values: any) => {
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to create journal entry");
      }
      
      setCreateDialogOpen(false);
      fetchJournals();
    } catch (err: any) {
      setError(err.message || "An error occurred while creating journal entry");
      console.error("Error creating journal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle updating a journal entry
  const handleUpdateJournal = async (values: any) => {
    if (!selectedJournal) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/journals/${selectedJournal.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to update journal entry");
      }
      
      setEditDialogOpen(false);
      fetchJournals();
    } catch (err: any) {
      setError(err.message || "An error occurred while updating journal entry");
      console.error("Error updating journal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle deleting a journal entry
  const handleDeleteJournal = async () => {
    if (!selectedJournal) return;
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/journals/${selectedJournal.id}`, {
        method: "DELETE",
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete journal entry");
      }
      
      setDeleteDialogOpen(false);
      fetchJournals();
    } catch (err: any) {
      setError(err.message || "An error occurred while deleting journal entry");
      console.error("Error deleting journal:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle viewing a journal entry
  const handleViewJournal = async (journal: JournalEntry) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/journals/${journal.id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch journal details");
      }
      
      setSelectedJournal(data.journal);
      setViewDialogOpen(true);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching journal details");
      console.error("Error fetching journal details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle editing a journal entry
  const handleEditJournal = async (journal: JournalEntry) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/journals/${journal.id}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch journal details");
      }
      
      setSelectedJournal(data.journal);
      setEditDialogOpen(true);
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching journal details");
      console.error("Error fetching journal details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Convert journal data for form
  const journalToFormValues = (journal: JournalEntry) => {
    if (!journal || !journal.lines) return undefined;
    
    return {
      date: new Date(journal.date),
      memo: journal.memo,
      source: journal.source || "",
      lines: journal.lines.map((line) => ({
        account_id: line.account_id.toString(),
        debit: line.debit > 0 ? line.debit.toString() : "",
        credit: line.credit > 0 ? line.credit.toString() : "",
        description: line.description || "",
      })),
    };
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Journal Entries</h1>
      </div>

      {error && (
        <Alert variant={setupRequired ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{setupRequired ? "Setup Required" : "Error"}</AlertTitle>
          <AlertDescription>
            {error}
            {setupRequired && (
              <div className="mt-4">
                <JournalSetupButton 
                  onSetupComplete={() => {
                    setSetupRequired(false);
                    setError(null);
                    fetchJournals();
                  }} 
                />
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="manage">Manage Journals</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="manage" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Journal Entries</CardTitle>
                <CardDescription>
                  Manage your journal entries
                </CardDescription>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchJournals}
                  disabled={isLoading}
                >
                  <RefreshCcw className="h-4 w-4 mr-1" />
                  Refresh
                </Button>
                <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Journal
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <DatePickerWithRange
                    date={dateRange}
                    setDate={(range: DateRange | undefined) => setDateRange(range)}
                  />
                </div>
                <JournalTable
                  journals={journals}
                  onView={handleViewJournal}
                  onEdit={handleEditJournal}
                  onDelete={(journal) => {
                    setSelectedJournal(journal);
                    setDeleteDialogOpen(true);
                  }}
                  isLoading={isLoading}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Journal Reports</CardTitle>
              <CardDescription>
                Generate reports based on journal entries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Reports functionality coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Journal Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Journal Entry</DialogTitle>
            <DialogDescription>
              Enter the details for the new journal entry
            </DialogDescription>
          </DialogHeader>
          <JournalEntryForm
            accounts={accounts}
            onSubmit={handleCreateJournal}
            onCancel={() => setCreateDialogOpen(false)}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* View Journal Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Journal Entry Details</DialogTitle>
          </DialogHeader>
          {selectedJournal && (
            <JournalView
              journal={selectedJournal}
              onClose={() => setViewDialogOpen(false)}
              onEdit={() => {
                setViewDialogOpen(false);
                setEditDialogOpen(true);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Journal Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Journal Entry</DialogTitle>
            <DialogDescription>
              Update the details for this journal entry
            </DialogDescription>
          </DialogHeader>
          {selectedJournal && (
            <JournalEntryForm
              journalId={selectedJournal.id}
              defaultValues={journalToFormValues(selectedJournal)}
              accounts={accounts}
              onSubmit={handleUpdateJournal}
              onCancel={() => setEditDialogOpen(false)}
              isSubmitting={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this journal entry? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteJournal}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { RefreshCcw, AlertCircle, Calendar, ArrowRight, Check, X } from "lucide-react";
import { getAuth } from "firebase/auth";

import { GenerateRecurringButton } from "@/components/journals/GenerateRecurringButton";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

interface RecurringJournal {
  id: number;
  journal_id: number;
  frequency: string;
  start_date: string | Date;
  end_date?: string | Date;
  day_of_month?: number;
  day_of_week?: number;
  last_generated?: string | Date;
  is_active: boolean;
  created_by: string;
  created_at: string | Date;
  memo: string;
  source?: string;
  original_date: string | Date;
  total_amount: number;
}

export default function RecurringJournalsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [recurringJournals, setRecurringJournals] = useState<RecurringJournal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState<RecurringJournal | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch recurring journals on initial load
  useEffect(() => {
    fetchRecurringJournals();
  }, []);

  // Fetch recurring journal entries
  const fetchRecurringJournals = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to fetch recurring entries");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/recurring", {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await response.json();
      
      // Special case for table not existing error - treat as setupRequired
      if (!response.ok && data.error && data.error.includes('table does not exist')) {
        setSetupRequired(true);
        setError("Recurring journals table is not set up. Please initialize the database.");
        return;
      }
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch recurring journal entries");
      }
      
      if (data.setupRequired) {
        setSetupRequired(true);
        setError("Recurring journals table is not set up. Please initialize the database.");
      } else {
        setSetupRequired(false);
        setRecurringJournals(data.recurringJournals || []);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred while fetching recurring journal entries");
      console.error("Error fetching recurring journals:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle setup of recurring journals table
  const handleSetup = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to set up recurring journals");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/journals/recurring/db-setup", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to set up recurring journals table");
      }
      
      toast({
        title: "Setup Complete",
        description: "Recurring journals table has been successfully created.",
        variant: "default",
      });
      
      setSetupRequired(false);
      fetchRecurringJournals();
    } catch (err: any) {
      setError(err.message || "An error occurred while setting up recurring journals table");
      console.error("Error setting up recurring journals table:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle toggling active status of a recurring journal
  const handleToggleActive = async (journal: RecurringJournal) => {
    setSelectedJournal(journal);
    setConfirmDialogOpen(true);
  };

  // Confirm toggle active status
  const confirmToggleActive = async () => {
    if (!selectedJournal) return;
    
    setIsUpdating(true);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to update recurring entries");
      }
      
      const token = await user.getIdToken();

      const response = await fetch(`/api/journals/recurring/${selectedJournal.id}`, {
        method: "PATCH",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          is_active: !selectedJournal.is_active,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to update recurring journal entry");
      }
      
      toast({
        title: "Success",
        description: `Recurring journal entry ${selectedJournal.is_active ? "deactivated" : "activated"} successfully.`,
        variant: "default",
      });
      
      // Update the local state
      setRecurringJournals(prev => 
        prev.map(j => 
          j.id === selectedJournal.id 
            ? { ...j, is_active: !j.is_active } 
            : j
        )
      );
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An error occurred while updating recurring journal entry",
        variant: "destructive",
      });
    } finally {
      setIsUpdating(false);
      setConfirmDialogOpen(false);
    }
  };

  // Format date for display
  const formatDate = (date: string | Date | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MMM d, yyyy");
    } catch (e) {
      return "Invalid Date";
    }
  };

  // Format amount for display
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  // Format frequency for display
  const formatFrequency = (frequency: string, dayOfMonth?: number, dayOfWeek?: number) => {
    let result = frequency.charAt(0).toUpperCase() + frequency.slice(1);
    
    if (frequency === "weekly" && dayOfWeek !== undefined) {
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      result += ` (${days[dayOfWeek]})`;
    } else if (frequency !== "weekly" && dayOfMonth !== undefined) {
      if (dayOfMonth === 31 || dayOfMonth === 0) {
        result += " (Last day)";
      } else {
        result += ` (Day ${dayOfMonth})`;
      }
    }
    
    return result;
  };

  // View journal details
  const viewJournal = (journalId: number) => {
    router.push(`/dashboard/journals?view=${journalId}`);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Recurring Journal Entries</h1>
        <Button variant="outline" onClick={() => router.push("/dashboard/journals")}>
          Back to Journals
        </Button>
      </div>

      {error && (
        <Alert variant={setupRequired ? "default" : "destructive"}>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{setupRequired ? "Setup Required" : "Error"}</AlertTitle>
          <AlertDescription>
            {error}
            {setupRequired && (
              <div className="mt-4">
                <Button onClick={handleSetup} disabled={isLoading}>
                  {isLoading ? "Setting Up..." : "Initialize Recurring Journals"}
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>Recurring Journal Entries</CardTitle>
            <CardDescription>
              Manage your recurring journal entries
            </CardDescription>
          </div>
          <div className="flex space-x-2">
            <GenerateRecurringButton onGenerateComplete={fetchRecurringJournals} />
            <Button
              variant="outline"
              size="sm"
              onClick={fetchRecurringJournals}
              disabled={isLoading}
            >
              <RefreshCcw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Original Journal</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Last Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : recurringJournals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      No recurring journal entries found
                    </TableCell>
                  </TableRow>
                ) : (
                  recurringJournals.map((journal) => (
                    <TableRow key={journal.id} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="font-medium">{journal.memo}</div>
                        <div className="text-sm text-muted-foreground">
                          {formatAmount(journal.total_amount)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatFrequency(journal.frequency, journal.day_of_month, journal.day_of_week)}
                      </TableCell>
                      <TableCell>{formatDate(journal.start_date)}</TableCell>
                      <TableCell>{formatDate(journal.end_date)}</TableCell>
                      <TableCell>{formatDate(journal.last_generated)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={journal.is_active ? "default" : "outline"}
                        >
                          {journal.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => viewJournal(journal.journal_id)}
                          >
                            <Calendar className="h-4 w-4 mr-1" />
                            View Journal
                          </Button>
                          <Button
                            variant={journal.is_active ? "destructive" : "outline"}
                            size="sm"
                            onClick={() => handleToggleActive(journal)}
                          >
                            {journal.is_active ? (
                              <X className="h-4 w-4 mr-1" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            {journal.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedJournal?.is_active
                ? "Deactivate Recurring Journal"
                : "Activate Recurring Journal"}
            </DialogTitle>
            <DialogDescription>
              {selectedJournal?.is_active
                ? "Are you sure you want to deactivate this recurring journal entry? No new journal entries will be generated."
                : "Are you sure you want to activate this recurring journal entry? New journal entries will be generated according to the schedule."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDialogOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              variant={selectedJournal?.is_active ? "destructive" : "default"}
              onClick={confirmToggleActive}
              disabled={isUpdating}
            >
              {isUpdating
                ? "Processing..."
                : selectedJournal?.is_active
                ? "Deactivate"
                : "Activate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

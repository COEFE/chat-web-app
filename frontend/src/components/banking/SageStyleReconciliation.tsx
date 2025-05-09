import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import ReconciliationUpdateForm from "./ReconciliationUpdateForm";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Search,
  Loader2,
  DollarSign,
  X,
  AlertTriangle,
  ArrowLeftRight,
  FileSearch,
  Info,
  ArrowDown,
  ArrowUp,
  Settings,
  FileEdit,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface Transaction {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  status: string;
  reference_number?: string;
  is_cleared?: boolean;
  // Fields for display
  bank_account_id?: number;
  bank_account?: string;
  // For book entries
  is_gl_entry?: boolean;
  gl_account_id?: number;
  // For handling journal entries
  debit?: number;
  credit?: number;
  journal_id?: number;
}

interface ReconciliationSession {
  id: number;
  bank_account_id: number;
  bank_account_name: string;
  account_number: string;
  start_date: string;
  end_date: string;
  bank_statement_balance: number;
  starting_balance: number;
  ending_balance: number;
  // For backward compatibility
  book_balance?: number;
  created_at: string;
  status: string;
  gl_account_id: number;
}

interface SageStyleReconciliationProps {
  sessionId: number;
  bankAccountId: number;
  onComplete: () => void;
  onCancel: () => void;
}

// Function to update reconciliation settings
async function updateReconciliationSession(
  bankAccountId: number,
  sessionId: number,
  updates: {
    bank_statement_balance?: number;
    start_date?: string;
    end_date?: string;
  }
) {
  const auth = getAuth();
  const user = auth.currentUser;
  
  if (!user) {
    throw new Error("User not authenticated");
  }
  
  const idToken = await user.getIdToken();
  
  const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/update`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(updates),
  });
  
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update reconciliation settings");
  }
  
  return response.json();
}

export default function SageStyleReconciliation({
  sessionId,
  bankAccountId,
  onComplete,
  onCancel,
}: SageStyleReconciliationProps) {
  const [isLoadingReconciliationSession, setIsLoadingReconciliationSession] = useState<boolean>(true);
  const [isSubmittingReconciliation, setIsSubmittingReconciliation] = useState<boolean>(false);
  const [isReopeningReconciliation, setIsReopeningReconciliation] = useState<boolean>(false);
  const [reconciliationSession, setReconciliationSession] = useState<ReconciliationSession | null>(null);
  
  // Combined transaction list
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clearedTransactions, setClearedTransactions] = useState<Transaction[]>([]); 
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  // Running totals
  const [clearedBalance, setClearedBalance] = useState(0); 
  
  // Sort & Filter
  const [sortField, setSortField] = useState<string>("transaction_date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [filterType, setFilterType] = useState<string>("all");

  // Filter transactions based on search term and filter type
  const filteredTransactions = transactions.filter((transaction) => {
    // Text search
    const matchesSearch = searchTerm ? (
      String(transaction.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(transaction.amount || '').includes(searchTerm) ||
      (transaction.reference_number && 
       String(transaction.reference_number).toLowerCase().includes(searchTerm.toLowerCase()))
    ) : true;
       
    // Type filter
    const matchesType = 
      filterType === "all" || 
      (filterType === "bank" && !transaction.is_gl_entry) ||
      (filterType === "gl" && transaction.is_gl_entry);
      
    return matchesSearch && matchesType;
  });

  // Toggle a transaction between cleared and uncleared
  const toggleCleared = (transaction: Transaction) => {
    console.log('Toggling transaction cleared status:', transaction);
    
    // Create a copy with toggled cleared status
    const updatedTransaction = {
      ...transaction,
      is_cleared: !transaction.is_cleared
    };
    
    if (updatedTransaction.is_cleared) {
      // Add to cleared transactions, remove from main transactions list
      setClearedTransactions(prev => [...prev, updatedTransaction]);
      setTransactions(prev => prev.filter(t => t.id !== transaction.id));
    } else {
      // Add to main transactions list, remove from cleared transactions
      setTransactions(prev => [...prev, updatedTransaction]);
      setClearedTransactions(prev => prev.filter(t => t.id !== transaction.id));
    }
    
    // No need to manually update difference, it will be recalculated automatically
    // when clearedTransactions changes since we use useMemo for totals
  };
  
  // Handle sorting of transactions
  const handleSort = (field: string) => {
    if (sortField === field) {
      // Toggle direction if same field
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // New field, default to ascending
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Edit reconciliation settings
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [editedStatementBalance, setEditedStatementBalance] = useState<string>("");
  const [editedStartDate, setEditedStartDate] = useState<string>("");
  const [editedEndDate, setEditedEndDate] = useState<string>("");
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
  
  // State for the new reconciliation update form
  const [isUpdateFormOpen, setIsUpdateFormOpen] = useState(false);
  
  // This is the function passed to ReconciliationUpdateForm
  const handleUpdateReconciliationSettings = async (data: { statementEndingBalance: number; statementEndingDate: string }) => {
    if (!reconciliationSession || !bankAccountId) return;

    setIsUpdatingSettings(true);
    try {
      const updates = {
        bank_statement_balance: data.statementEndingBalance,
        end_date: data.statementEndingDate, 
      };
      const updatedSessionData = await updateReconciliationSession(
        bankAccountId,
        reconciliationSession.id,
        updates
      );
      if (updatedSessionData) {
        setReconciliationSession(updatedSessionData); 
        toast({ title: "Success", description: "Reconciliation settings updated successfully." });
        setIsUpdateFormOpen(false); 
      } else {
        toast({ title: "Error", description: "Failed to update reconciliation settings. No data returned.", variant: "destructive" });
      }
    } catch (error: any) {
      console.error("Error updating reconciliation settings:", error);
      toast({ title: "Error", description: error.message || "An error occurred while updating settings.", variant: "destructive" });
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  // The older direct edit settings handler (can be reviewed/removed if ReconciliationUpdateForm is primary)
  const updateReconciliationSettingsLegacy = async () => {
    if (!reconciliationSession) return;
    
    setIsUpdatingSettings(true);
    
    try {
      const updates: any = {};
      
      if (editedStatementBalance && !isNaN(parseFloat(editedStatementBalance))) {
        updates.bank_statement_balance = parseFloat(editedStatementBalance);
      }
      
      if (editedStartDate) {
        updates.start_date = editedStartDate; 
      }
      if (editedEndDate) {
        updates.end_date = editedEndDate;
      }
      
      if (Object.keys(updates).length === 0) {
        toast({ title: "Info", description: "No changes to save." });
        setIsEditingSettings(false);
        return;
      }
      
      const updatedSession = await updateReconciliationSession(bankAccountId, reconciliationSession.id, updates);
      setReconciliationSession(updatedSession); 
      
      // Reset edit fields
      setEditedStatementBalance("");
      setEditedStartDate("");
      setEditedEndDate("");
      setIsEditingSettings(false);
      toast({ title: "Success", description: "Settings updated!" });
      
    } catch (error: any) {
      console.error("Error updating reconciliation settings:", error);
      toast({ title: "Error", description: error.message || "Failed to update settings.", variant: "destructive" });
    } finally {
      setIsUpdatingSettings(false);
    }
  };
  
  // Fetch reconciliation session data
  useEffect(() => {
    const fetchReconciliationData = async () => {
      setIsLoadingReconciliationSession(true);
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        toast({ title: "Error", description: "User not authenticated. Please log in.", variant: "destructive" });
        setIsLoadingReconciliationSession(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to fetch reconciliation session");
        }
        const data = await response.json();
        
        setReconciliationSession(data.session); 
        setTransactions(data.transactions || []); 
        setClearedTransactions((data.transactions || []).filter((t: Transaction) => t.is_cleared)); 
        
        // Initialize edit fields if needed (though ReconciliationUpdateForm handles its own state)
        setEditedStatementBalance(data.session.bank_statement_balance.toString());
        setEditedEndDate(format(new Date(data.session.end_date), "yyyy-MM-dd"));

      } catch (error: any) {
        console.error("Error fetching reconciliation data:", error);
        toast({ title: "Error", description: error.message || "Failed to load reconciliation data.", variant: "destructive" });
      } finally {
        setIsLoadingReconciliationSession(false);
      }
    };
    
    fetchReconciliationData();
  }, [bankAccountId, sessionId]);
  
  // Calculate totals using useMemo to prevent unnecessary recalculations
  // and provide a stable reference that only updates when dependencies change
  const totals = React.useMemo(() => {
    if (!reconciliationSession) {
      return { clearedCredits: 0, clearedDebits: 0, netCleared: 0, endingBalance: 0, difference: 0 };
    }

    // Ensure reconciliation session values are numbers
    const startingBalance = parseFloat(String(reconciliationSession.starting_balance || 0));
    const statementBalance = parseFloat(String(reconciliationSession.bank_statement_balance || 0));

    // Sum cleared credits with careful type handling
    const clearedCredits = clearedTransactions
      .filter(t => t.transaction_type === "credit")
      .reduce((sum, t) => {
        // Ensure amount is treated as a number
        const amount = parseFloat(String(t.amount || 0));
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

    // Sum cleared debits with careful type handling
    const clearedDebits = clearedTransactions
      .filter(t => t.transaction_type === "debit")
      .reduce((sum, t) => {
        // Ensure amount is treated as a number
        const amount = parseFloat(String(t.amount || 0));
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

    // Calculate the net effect of cleared transactions
    // For bank accounts in standard reconciliation:
    // - Credits (deposits) INCREASE the balance
    // - Debits (payments/withdrawals) DECREASE the balance
    const netClearedAmount = clearedCredits - clearedDebits;
    
    // Calculate book-side ending balance
    // Starting balance + net effect of all cleared transactions
    const bookSideEndingBalance = startingBalance + netClearedAmount;
    
    // The difference is statement balance minus book balance
    // Perfect reconciliation should have zero difference
    const difference = statementBalance - bookSideEndingBalance;

    // Log calculation details for debugging
    console.log('Reconciliation calculation:', {
      startingBalance,
      statementBalance,
      clearedCredits,
      clearedDebits,
      netClearedAmount,
      bookSideEndingBalance,
      difference
    });

    return {
      clearedCredits: isNaN(clearedCredits) ? 0 : clearedCredits,
      clearedDebits: isNaN(clearedDebits) ? 0 : clearedDebits,
      netCleared: isNaN(netClearedAmount) ? 0 : netClearedAmount,
      endingBalance: isNaN(bookSideEndingBalance) ? 0 : bookSideEndingBalance, 
      difference: isNaN(difference) ? 0 : difference,
    };
  }, [reconciliationSession, clearedTransactions]); // Dependencies that should trigger recalculation
  
  // Reopen a completed reconciliation
  const reopenReconciliation = async () => {
    setIsReopeningReconciliation(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Force refresh the token to ensure it's valid
      const idToken = await user.getIdToken(true);
      
      console.log('Reopening reconciliation session:', sessionId);
      
      // Call the reopen API endpoint
      const response = await fetch(
        `/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/reopen`, 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
        }
      );
      
      console.log('API response status:', response.status, response.statusText);
      
      if (!response.ok) {
        let errorMessage = `API error: ${response.status} ${response.statusText}`;
        try {
          const responseText = await response.text();
          console.log('Raw API error response:', responseText || '(empty response)');
          
          if (responseText && responseText.trim()) {
            try {
              const errorData = JSON.parse(responseText);
              if (Object.keys(errorData).length > 0) {
                console.error('API error response parsed:', errorData);
                
                if (errorData && errorData.error) {
                  errorMessage = errorData.error;
                } else if (errorData && errorData.details) {
                  errorMessage = errorData.details;
                }
              }
            } catch (jsonError) {
              console.error('Failed to parse error response JSON:', jsonError);
              if (responseText.trim()) {
                errorMessage += `: ${responseText}`;
              }
            }
          }
        } catch (textError) {
          console.error('Failed to read error response text:', textError);
        }
        
        throw new Error(errorMessage);
      }
      
      toast({ title: "Success", description: "Reconciliation reopened successfully." });
      
      // Refresh the page to show the reopened session
      window.location.reload();
    } catch (error) {
      console.error("Error reopening reconciliation:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to reopen reconciliation", variant: "destructive" });
    } finally {
      setIsReopeningReconciliation(false);
    }
  };

  // Submit the reconciliation
  const submitReconciliation = async () => {
    // Use the memoized totals value
    // Check if reconciliation is balanced
    if (Math.abs(totals.difference) > 0.01) {
      // Confirm user wants to proceed with unbalanced reconciliation
      if (!window.confirm(
        `Your reconciliation has a difference of ${formatCurrency(totals.difference)}. Do you want to proceed anyway?`
      )) {
        return;
      }
    }
    
    setIsSubmittingReconciliation(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      // Force refresh the token to ensure it's valid
      const idToken = await user.getIdToken(true);
      console.log("Token obtained successfully", { tokenLength: idToken.length });
      
      // Get unreconciled transactions (those not in clearedTransactions)
      const unreconciledTransactions = transactions.filter(t => {
        return !clearedTransactions.some(c => c.id === t.id && c.is_gl_entry === t.is_gl_entry);
      });
      
      // Format the matches in the way the API expects
      // Group transactions by whether they're bank or GL
      const bankTransactionIds = clearedTransactions
        .filter(t => !t.is_gl_entry)
        .map(t => t.id);
        
      const glTransactionIds = clearedTransactions
        .filter(t => t.is_gl_entry)
        .map(t => t.id);
      
      // Create a single match containing all cleared transactions
      const matches = bankTransactionIds.length > 0 || glTransactionIds.length > 0 ? [{
        bankIds: bankTransactionIds,
        glIds: glTransactionIds
      }] : [];
      
      // Get unreconciled bank transactions and GL entries
      const unreconciledBankTransactions = unreconciledTransactions
        .filter(t => !t.is_gl_entry)
        .map(t => t.id);
        
      const unreconciledGLEntries = unreconciledTransactions
        .filter(t => t.is_gl_entry)
        .map(t => t.id);
      
      const requestData = {
        matches,
        unreconciled_bank_transactions: unreconciledBankTransactions,
        unreconciled_gl_entries: unreconciledGLEntries,
      };
      
      console.log('Submitting reconciliation with:', {
        matches,
        bankAccountId,
        sessionId,
        unreconciledBankCount: unreconciledBankTransactions.length,
        unreconciledGLCount: unreconciledGLEntries.length
      });
      
      // Submit reconciliation data
      const response = await fetch(
        `/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/complete`, 
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify(requestData),
        }
      );
      
      console.log('API response status:', response.status, response.statusText);
      
      // Handle non-OK responses better
      if (!response.ok) {
        let errorMessage = `API error: ${response.status} ${response.statusText}`;
        let responseText = '';
        
        try {
          responseText = await response.text();
          console.log('Raw API error response:', responseText || '(empty response)');
          
          if (responseText && responseText.trim()) {
            try {
              const errorData = JSON.parse(responseText);
              // Log error data only if it's not empty
              if (Object.keys(errorData).length > 0) {
                console.error('API error response parsed:', errorData);
                
                if (errorData && errorData.error) {
                  errorMessage = errorData.error;
                } else if (errorData && errorData.details) {
                  errorMessage = errorData.details;
                }
              } else {
                console.error('API returned empty JSON object');
              }
            } catch (jsonError) {
              console.error('Failed to parse error response JSON:', jsonError);
              // Use the raw text if JSON parsing fails
              if (responseText.trim()) {
                errorMessage += `: ${responseText}`;
              }
            }
          } else {
            console.error('API returned empty response');
            errorMessage = `API error ${response.status}: No response content`;
          }
        } catch (textError) {
          console.error('Failed to read error response text:', textError);
        }
        
        throw new Error(errorMessage);
      }
      
      // Handle successful response - don't try to parse the body again if it might be empty
      try {
        // Check if we can clone the response to read it again
        if (response.bodyUsed) {
          console.log('Response body already consumed, proceeding with reconciliation completion');
        } else {
          // Try to read the response body
          const responseText = await response.text();
          console.log('Raw success response:', responseText || '(empty response)');
          
          if (responseText && responseText.trim()) {
            try {
              const resultData = JSON.parse(responseText);
              console.log('Reconciliation completed successfully:', resultData);
            } catch (jsonError) {
              console.warn('Could not parse successful response as JSON:', jsonError);
            }
          } else {
            console.log('Empty but successful response received');
          }
        }
      } catch (responseError) {
        console.warn('Error reading response body, but ignoring as status was OK:', responseError);
      }
      
      toast({ title: "Success", description: "Reconciliation completed successfully." });
      
      onComplete();
    } catch (error) {
      console.error("Error completing reconciliation:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to complete reconciliation", variant: "destructive" });
    } finally {
      setIsSubmittingReconciliation(false);
    }
  };
  
  // Loading state
  if (isLoadingReconciliationSession) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading reconciliation data...</p>
        </div>
      </div>
    );
  }
  
  // No session
  if (!reconciliationSession) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-destructive" />
          <h3 className="font-medium text-lg mb-2">No active reconciliation session</h3>
          <p className="text-muted-foreground mb-4">
            There is no active reconciliation session for this bank account.
          </p>
          <Button onClick={onCancel}>Go Back</Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col gap-4">
      {/* Account info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-1">
            <p className="text-lg font-semibold">{reconciliationSession.bank_account_name}</p>
            <p className="text-sm text-muted-foreground">Account Number: {reconciliationSession.account_number}</p>
            <p className="text-sm text-muted-foreground">
              Reconciliation period: {format(new Date(reconciliationSession.start_date), "MMM d, yyyy")} - 
              {format(new Date(reconciliationSession.end_date), "MMM d, yyyy")}
            </p>
          </div>
        </CardContent>
      </Card>
      
      {/* Balance summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Beginning balance</span>
              <span className="text-lg font-semibold">{formatCurrency(reconciliationSession.starting_balance)}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Statement ending balance</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 px-2" 
                  onClick={() => setIsUpdateFormOpen(true)}
                >
                  <FileEdit className="h-4 w-4 mr-1" /> Edit
                </Button>
              </div>
              <span className="text-lg font-semibold">{formatCurrency(reconciliationSession.bank_statement_balance)}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">Difference</span>
              <div>
                <span className={`text-lg font-semibold ${totals.difference === 0 ? "text-green-500" : "text-amber-500"}`}>
                  {formatCurrency(Math.abs(totals.difference))}
                </span>
                {totals.difference !== 0 && (
                  <span className="ml-2 text-xs text-gray-600">
                    {totals.difference > 0 ? 
                      "(Book balance exceeds statement balance)" : 
                      "(Statement balance exceeds book balance)"}
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Balance details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Uncleared items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">
              {transactions.length} items
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Cleared items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Credits</div>
                <div className="text-lg font-semibold">{formatCurrency(totals.clearedCredits)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Debits</div>
                <div className="text-lg font-semibold">{formatCurrency(totals.clearedDebits)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Net</div>
                <div className="text-lg font-semibold">{formatCurrency(totals.netCleared)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Edit Settings Dialog */}
      <Dialog open={isEditingSettings} onOpenChange={setIsEditingSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Reconciliation Settings</DialogTitle>
            <DialogDescription>
              Update the statement balance and reconciliation period.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="statementBalance" className="text-right">
                Statement Balance
              </Label>
              <Input
                id="statementBalance"
                type="number"
                step="0.01"
                placeholder="Enter statement balance"
                className="col-span-3"
                value={editedStatementBalance || reconciliationSession.bank_statement_balance.toString()}
                onChange={(e) => setEditedStatementBalance(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDate" className="text-right">
                Start Date
              </Label>
              <Input
                id="startDate"
                type="date"
                className="col-span-3"
                value={editedStartDate || (reconciliationSession?.start_date ? reconciliationSession.start_date.split('T')[0] : '')}
                onChange={(e) => setEditedStartDate(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDate" className="text-right">
                End Date
              </Label>
              <Input
                id="endDate"
                type="date"
                className="col-span-3"
                value={editedEndDate || (reconciliationSession?.end_date ? reconciliationSession.end_date.split('T')[0] : '')}
                onChange={(e) => setEditedEndDate(e.target.value)}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditingSettings(false)} className="mr-auto">
              Cancel
            </Button>
            <Button 
              onClick={updateReconciliationSettingsLegacy}
              disabled={isUpdatingSettings}
            >
              {isUpdatingSettings ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Search and filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search transactions by description, amount or reference..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <Select
          value={filterType}
          onValueChange={(value) => setFilterType(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All transactions</SelectItem>
            <SelectItem value="bank">Bank transactions</SelectItem>
            <SelectItem value="gl">GL entries</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Main transaction table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Clear</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("transaction_date")}>
                  <div className="flex items-center">
                    Date
                    {sortField === "transaction_date" && (
                      sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="cursor-pointer" onClick={() => handleSort("description")}>
                  <div className="flex items-center">
                    Description
                    {sortField === "description" && (
                      sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => handleSort("amount")}>
                  <div className="flex items-center justify-end">
                    Amount
                    {sortField === "amount" && (
                      sortDirection === "asc" ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />
                    )}
                  </div>
                </TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                    {searchTerm 
                      ? "No transactions match your search" 
                      : "No unreconciled transactions found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => (
                  <TableRow key={`${transaction.id}-${transaction.is_gl_entry ? 'gl' : 'bank'}`}>
                    <TableCell className="p-2">
                      <Checkbox
                        checked={transaction.is_cleared}
                        onCheckedChange={() => toggleCleared(transaction)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(transaction.transaction_date), "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell>
                      {transaction.reference_number || "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{transaction.description}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{transaction.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <Badge variant={transaction.is_gl_entry ? "secondary" : "outline"}>
                        {transaction.is_gl_entry ? "GL Entry" : "Bank Transaction"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={transaction.transaction_type === "credit" ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {/* Balance would be calculated here in a real implementation */}
                      {transaction.is_gl_entry ? "-" : formatCurrency(0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* Cleared transactions list */}
      {clearedTransactions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
              Cleared Items
              <Badge className="ml-2">{clearedTransactions.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Action</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clearedTransactions.map((transaction) => (
                  <TableRow key={`${transaction.id}-${transaction.is_gl_entry ? 'gl' : 'bank'}-cleared`}>
                    <TableCell className="p-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => toggleCleared(transaction)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(transaction.transaction_date), "MM/dd/yyyy")}
                    </TableCell>
                    <TableCell>
                      {transaction.reference_number || "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {transaction.description}
                    </TableCell>
                    <TableCell>
                      <Badge variant={transaction.is_gl_entry ? "secondary" : "outline"}>
                        {transaction.is_gl_entry ? "GL Entry" : "Bank Transaction"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={transaction.transaction_type === "credit" ? "text-green-600" : "text-red-600"}>
                        {formatCurrency(transaction.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* Action Buttons: Reopen or Submit Reconciliation */}
      {reconciliationSession && (
        <div className="flex justify-end space-x-4 mt-6 mb-2">
          {reconciliationSession.status === 'completed' ? (
            <Button
              onClick={reopenReconciliation}
              disabled={isReopeningReconciliation || isLoadingReconciliationSession}
              variant="outline"
              className="bg-yellow-500 hover:bg-yellow-600 text-white dark:bg-yellow-600 dark:hover:bg-yellow-700 dark:text-gray-900"
            >
              {isReopeningReconciliation && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reopen Reconciliation
            </Button>
          ) : (
            <Button
              onClick={submitReconciliation}
              disabled={
                isSubmittingReconciliation ||
                isLoadingReconciliationSession ||
                (totals && totals.difference !== 0 && reconciliationSession.status !== 'draft_partial_reconciliation') || 
                (!reconciliationSession.id)
              }
            >
              Submit Reconciliation
            </Button>
          )}
        </div>
      )}

      {/* Dialog for ReconciliationUpdateForm */}
      {reconciliationSession && (
        <ReconciliationUpdateForm
          bankAccountId={bankAccountId}
          sessionId={sessionId}
          isOpen={isUpdateFormOpen}
          onClose={() => setIsUpdateFormOpen(false)}
          onUpdated={(updatedDetails) => {
            // This will be called when the form submits successfully
            // We'll update our local state to reflect the changes
            if (reconciliationSession) {
              setReconciliationSession({
                ...reconciliationSession,
                end_date: updatedDetails.end_date,
                bank_statement_balance: updatedDetails.bank_statement_balance
              });
            }
            // Close the form
            setIsUpdateFormOpen(false);
            // Update the difference calculation
            // No need to manually recalculate - the useMemo will handle this
            // when reconciliationSession changes
          }}
          currentDetails={{
            end_date: reconciliationSession.end_date,
            bank_statement_balance: reconciliationSession.bank_statement_balance
          }}
        />
      )}
    </div>
  );
}

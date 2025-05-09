import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
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
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Search,
  Loader2,
  DollarSign,
  PlusCircle,
  AlertTriangle,
  ArrowLeftRight,
  FileSearch,
  Info,
  Edit,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// Simple direct update for statement details
function StatementUpdateDialog({ 
  isOpen, 
  onClose, 
  bankAccountId, 
  sessionId, 
  onSuccess 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  bankAccountId: number; 
  sessionId: number; 
  onSuccess: () => void;
}) {
  const [statementBalance, setStatementBalance] = useState<string>('');
  const [statementDate, setStatementDate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize values when dialog opens
  useEffect(() => {
    if (isOpen) {
      const fetchCurrentValues = async () => {
        try {
          const auth = getAuth();
          const user = auth.currentUser;
          if (!user) return;
          
          const idToken = await user.getIdToken();
          const response = await fetch(
            `/api/bank-accounts/${bankAccountId}/reconciliation?sessionId=${sessionId}`,
            {
              headers: { Authorization: `Bearer ${idToken}` }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.session) {
              setStatementBalance(data.session.bank_statement_balance?.toString() || '0');
              setStatementDate(data.session.end_date || new Date().toISOString().split('T')[0]);
            }
          }
        } catch (err) {
          console.error('Error fetching current values:', err);
        }
      };
      
      fetchCurrentValues();
    }
  }, [isOpen, bankAccountId, sessionId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const balance = parseFloat(statementBalance);
      if (isNaN(balance)) {
        throw new Error('Please enter a valid balance');
      }
      
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        throw new Error('Not authenticated');
      }
      
      const idToken = await user.getIdToken();
      
      // Direct update of reconciliation session
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          end_date: statementDate,
          bank_statement_balance: balance
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update');
      }
      
      toast({
        title: "Success",
        description: "Statement details updated successfully"
      });
      onClose();
      onSuccess(); // Trigger a full refresh
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to update statement details',
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Statement Details</DialogTitle>
          <DialogDescription>
            Adjust the statement end date and balance
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="statement-date">Statement End Date</Label>
            <Input 
              id="statement-date" 
              type="date" 
              value={statementDate} 
              onChange={(e) => setStatementDate(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="statement-balance">Statement Balance</Label>
            <Input 
              id="statement-balance" 
              type="number" 
              step="0.01" 
              value={statementBalance} 
              onChange={(e) => setStatementBalance(e.target.value)}
              required
            />
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface Transaction {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  status: string;
  reference_number?: string;
}

interface GLEntry {
  id: number;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: "credit" | "debit";
  gl_account_id: number;
  reference?: string;
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

interface TransactionMatcherProps {
  sessionId: number;
  bankAccountId: number;
  onComplete: () => void;
  onCancel: () => void;
}

export default function TransactionMatcher({
  sessionId,
  bankAccountId,
  onComplete,
  onCancel,
}: TransactionMatcherProps) {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [session, setSession] = useState<ReconciliationSession | null>(null);
  // State for statement update dialog
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [triggerRefresh, setTriggerRefresh] = useState(0);
  const [bankTransactions, setBankTransactions] = useState<Transaction[]>([]);
  const [glEntries, setGlEntries] = useState<GLEntry[]>([]);
  const [selectedBankTransactions, setSelectedBankTransactions] = useState<number[]>([]);
  const [selectedGLEntries, setSelectedGLEntries] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [matchedItems, setMatchedItems] = useState<{ bankIds: number[]; glIds: number[] }[]>([]);
  const [currentDifference, setCurrentDifference] = useState<number>(0);
  const [netClearedAmount, setNetClearedAmount] = useState<number>(0);
  
  // Function to refresh all data
  const refreshAllData = () => {
    // Clear the session data first to force a full refresh
    setSession(null);
    setBankTransactions([]);
    setGlEntries([]);
    setCurrentDifference(0);
    setNetClearedAmount(0);
    
    // Then trigger a refresh
    setTriggerRefresh(prev => prev + 1);
  };
  
  // Fetch reconciliation session data
  useEffect(() => {
    const fetchReconciliationData = async () => {
      setIsLoading(true);
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          toast({
            title: "Authentication error",
            description: "You must be logged in to access this page",
            variant: "destructive",
          });
          return;
        }
        
        const idToken = await user.getIdToken();
        
        // Fetch reconciliation session
        const sessionResponse = await fetch(
          `/api/bank-accounts/${bankAccountId}/reconciliation?sessionId=${sessionId}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );
        
        if (!sessionResponse.ok) {
          throw new Error("Failed to fetch reconciliation session");
        }
        
        const sessionData = await sessionResponse.json();
        
        if (!sessionData.active_session) {
          throw new Error("No active reconciliation session found");
        }
        
        setSession(sessionData.session);
        setBankTransactions(sessionData.unreconciled_transactions || []);
        
        // Fetch GL entries for the account within the date range
        const glResponse = await fetch(
          `/api/gl-transactions?accountId=${session?.gl_account_id}&startDate=${sessionData.session.start_date}&endDate=${sessionData.session.end_date}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        );
        
        if (!glResponse.ok) {
          console.error("Failed to fetch GL entries");
          setGlEntries([]);
        } else {
          const glData = await glResponse.json();
          setGlEntries(glData.transactions || []);
        }
        
        // Calculate current difference properly including matched items
        const bookBalance = parseFloat(sessionData.session.starting_balance?.toString() || '0');
        const statementBalance = parseFloat(sessionData.session.bank_statement_balance?.toString() || '0');
        
        // Get matched/cleared items info
        let totalCredits = 0;
        let totalDebits = 0;
        let netCleared = 0;
        
        if (sessionData.reconciliation_summary) {
          totalCredits = parseFloat(sessionData.reconciliation_summary.total_credits?.toString() || '0');
          totalDebits = parseFloat(sessionData.reconciliation_summary.total_debits?.toString() || '0');
          netCleared = totalCredits - totalDebits;
        } else if (sessionData.matched_items && Array.isArray(sessionData.matched_items)) {
          // If no summary, calculate from matched items
          for (const match of sessionData.matched_items) {
            if (match.bank_transaction) {
              const amount = parseFloat(match.bank_transaction.amount?.toString() || '0');
              if (match.bank_transaction.transaction_type === 'credit') {
                totalCredits += amount;
              } else {
                totalDebits += amount;
              }
            }
          }
          netCleared = totalCredits - totalDebits;
        }
        
        // Store net cleared amount for display
        setNetClearedAmount(netCleared);
        
        // For bank reconciliation, we need to:
        // 1. Start with the bank's statement balance
        // 2. Compare it with the company's book balance (starting balance from the books)
        // The difference represents unreconciled items
        
        // Simple approach: Statement Balance - Book Balance
        // This shows what needs to be reconciled
        const calculatedDifference = statementBalance - bookBalance;
        
        console.log('Updated difference calculation:', {
          statementBalance,
          bookBalance,
          netCleared,
          totalCredits,
          totalDebits,
          calculatedDifference,
          sessionData
        });
        
        // Force the difference update with correct formula
        setCurrentDifference(calculatedDifference);
        
        // Also update the session state with the correct values
        setSession(prev => {
          if (!prev) return sessionData.session;
          return {
            ...sessionData.session,
            // Ensure these values are correct
            bank_statement_balance: statementBalance,
            starting_balance: bookBalance
          };
        });
      } catch (error) {
        console.error("Error fetching reconciliation data:", error);
        toast({
          title: "Error",
          description: "Failed to load reconciliation data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchReconciliationData();
  }, [bankAccountId, sessionId, triggerRefresh]);
  
  // Filter transactions based on search term
  const filteredBankTransactions = bankTransactions.filter((transaction) => {
    return (
      transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.amount.toString().includes(searchTerm) ||
      (transaction.reference_number && 
       transaction.reference_number.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });
  
  const filteredGLEntries = glEntries.filter((entry) => {
    return (
      entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.amount.toString().includes(searchTerm) ||
      (entry.reference && entry.reference.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });
  
  // Toggle selection of bank transaction
  const toggleBankTransaction = (id: number) => {
    setSelectedBankTransactions((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  // Toggle selection of GL entry
  const toggleGLEntry = (id: number) => {
    setSelectedGLEntries((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  // Calculate total amount of selected bank transactions
  const selectedBankTotal = selectedBankTransactions.reduce((total, id) => {
    const transaction = bankTransactions.find((t) => t.id === id);
    if (transaction) {
      return total + (transaction.transaction_type === "credit" ? transaction.amount : -transaction.amount);
    }
    return total;
  }, 0);
  
  // Calculate total amount of selected GL entries
  const selectedGLTotal = selectedGLEntries.reduce((total, id) => {
    const entry = glEntries.find((e) => e.id === id);
    if (entry) {
      return total + (entry.transaction_type === "credit" ? entry.amount : -entry.amount);
    }
    return total;
  }, 0);
  
  // Check if selection balances
  const selectionBalances = Math.abs(selectedBankTotal - selectedGLTotal) < 0.01;
  
  // Match selected transactions and entries
  const matchSelected = () => {
    if (selectedBankTransactions.length === 0 || selectedGLEntries.length === 0) {
      toast({
        title: "Selection required",
        description: "Please select at least one bank transaction and one GL entry",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectionBalances) {
      toast({
        title: "Amounts don't match",
        description: "The selected transactions must balance to zero",
        variant: "destructive",
      });
      return;
    }
    
    // Add to matched items
    setMatchedItems((prev) => [
      ...prev,
      {
        bankIds: [...selectedBankTransactions],
        glIds: [...selectedGLEntries],
      },
    ]);
    
    // Remove matched items from available lists
    setBankTransactions((prev) =>
      prev.filter((transaction) => !selectedBankTransactions.includes(transaction.id))
    );
    
    setGlEntries((prev) =>
      prev.filter((entry) => !selectedGLEntries.includes(entry.id))
    );
    
    // Clear selections
    setSelectedBankTransactions([]);
    setSelectedGLEntries([]);
    
    toast({
      title: "Match created",
      description: "Transaction match has been created successfully",
    });
  };
  
  // Unmatch a previously matched set
  const unmatchItem = (index: number) => {
    const itemToUnmatch = matchedItems[index];
    
    // Get the original transactions and entries
    const bankItems = itemToUnmatch.bankIds.map((id) => {
      // Find in the original list
      const matches = bankTransactions.filter((t) => t.id === id);
      return matches.length > 0 ? matches[0] : null;
    }).filter(Boolean) as Transaction[];
    
    const glItems = itemToUnmatch.glIds.map((id) => {
      // Find in the original list
      const matches = glEntries.filter((e) => e.id === id);
      return matches.length > 0 ? matches[0] : null;
    }).filter(Boolean) as GLEntry[];
    
    // Add back to available lists
    setBankTransactions((prev) => [...prev, ...bankItems]);
    setGlEntries((prev) => [...prev, ...glItems]);
    
    // Remove from matched items
    setMatchedItems((prev) => prev.filter((_, i) => i !== index));
    
    toast({
      title: "Match removed",
      description: "Transaction match has been removed",
    });
  };
  
  // Submit all matches
  const submitReconciliation = async () => {
    if (matchedItems.length === 0) {
      toast({
        title: "No matches",
        description: "Please create at least one match before submitting",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      // Submit reconciliation data
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          matches: matchedItems,
          unreconciled_bank_transactions: bankTransactions.map((t) => t.id),
          unreconciled_gl_entries: glEntries.map((e) => e.id),
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to complete reconciliation");
      }
      
      toast({
        title: "Reconciliation completed",
        description: "The bank account has been successfully reconciled",
      });
      
      onComplete();
    } catch (error) {
      console.error("Error completing reconciliation:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete reconciliation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading reconciliation data...</p>
        </div>
      </div>
    );
  }
  
  if (!session) {
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
    <div className="space-y-6">
      {/* Summary information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex justify-between items-center">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Statement ending balance
              </CardTitle>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 px-2" 
                onClick={() => setIsUpdateDialogOpen(true)}
              >
                <Edit className="h-4 w-4 mr-1" /> Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(session.bank_statement_balance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              As of {format(new Date(session.end_date), "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Book Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(session.starting_balance || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              GL account balance as of {format(new Date(session.end_date), "MMM d, yyyy")}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Difference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${Math.abs(currentDifference) < 0.01 ? "text-green-500" : "text-amber-500"}`}>
              {formatCurrency(currentDifference)}
              {session && (
                <span className="text-xs ml-2 text-muted-foreground">
                  ({formatCurrency(session.bank_statement_balance)} - ({formatCurrency(session.starting_balance || 0)} + {formatCurrency(netClearedAmount)}))
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {Math.abs(currentDifference) < 0.01
                ? "Perfectly balanced" 
                : "Amount to be reconciled"}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search transactions by description, amount or reference..."
          className="pl-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Transaction matcher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bank transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <DollarSign className="h-5 w-5 mr-2 text-primary" />
              Bank Transactions
              <Badge className="ml-2">{filteredBankTransactions.length}</Badge>
            </CardTitle>
            <CardDescription>
              Select one or more bank transactions to match
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBankTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        {searchTerm 
                          ? "No bank transactions match your search" 
                          : "No unreconciled bank transactions found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBankTransactions.map((transaction) => (
                      <TableRow 
                        key={transaction.id}
                        className={selectedBankTransactions.includes(transaction.id) ? "bg-primary/5" : ""}
                      >
                        <TableCell className="p-2">
                          <Checkbox
                            checked={selectedBankTransactions.includes(transaction.id)}
                            onCheckedChange={() => toggleBankTransaction(transaction.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(transaction.transaction_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{transaction.description}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">{transaction.description}</p>
                                {transaction.reference_number && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Ref: {transaction.reference_number}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${
                          transaction.transaction_type === "credit" ? "text-green-600" : "text-red-600"
                        }`}>
                          {transaction.transaction_type === "credit" ? "+" : "-"}
                          {formatCurrency(transaction.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {selectedBankTransactions.length > 0 && (
              <div className="mt-4 text-sm font-medium text-right">
                Selected Total: {formatCurrency(Math.abs(selectedBankTotal))}
                {selectedBankTotal > 0 ? " (Credit)" : " (Debit)"}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* GL entries */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <FileSearch className="h-5 w-5 mr-2 text-primary" />
              GL Entries
              <Badge className="ml-2">{filteredGLEntries.length}</Badge>
            </CardTitle>
            <CardDescription>
              Select one or more GL entries to match
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGLEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                        {searchTerm 
                          ? "No GL entries match your search" 
                          : "No unreconciled GL entries found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredGLEntries.map((entry) => (
                      <TableRow 
                        key={entry.id}
                        className={selectedGLEntries.includes(entry.id) ? "bg-primary/5" : ""}
                      >
                        <TableCell className="p-2">
                          <Checkbox
                            checked={selectedGLEntries.includes(entry.id)}
                            onCheckedChange={() => toggleGLEntry(entry.id)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(entry.transaction_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{entry.description}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="max-w-xs">{entry.description}</p>
                                {entry.reference && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Ref: {entry.reference}
                                  </p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className={`text-right whitespace-nowrap ${
                          entry.transaction_type === "credit" ? "text-green-600" : "text-red-600"
                        }`}>
                          {entry.transaction_type === "credit" ? "+" : "-"}
                          {formatCurrency(entry.amount)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            
            {selectedGLEntries.length > 0 && (
              <div className="mt-4 text-sm font-medium text-right">
                Selected Total: {formatCurrency(Math.abs(selectedGLTotal))}
                {selectedGLTotal > 0 ? " (Credit)" : " (Debit)"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Match button and difference */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-full">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-medium">Match Transactions</h3>
            <p className="text-sm text-muted-foreground">
              Match bank transactions with GL entries
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          {(selectedBankTransactions.length > 0 || selectedGLEntries.length > 0) && (
            <div className={`text-sm font-medium ${selectionBalances ? "text-green-600" : "text-amber-600"}`}>
              Difference: {formatCurrency(Math.abs(selectedBankTotal - selectedGLTotal))}
            </div>
          )}
          
          <Button
            onClick={matchSelected}
            disabled={
              selectedBankTransactions.length === 0 ||
              selectedGLEntries.length === 0 ||
              !selectionBalances
            }
          >
            Create Match
          </Button>
        </div>
      </div>
      
      {/* Matched items */}
      {matchedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <CheckCircle2 className="h-5 w-5 mr-2 text-green-500" />
              Matched Transactions
              <Badge className="ml-2">{matchedItems.length}</Badge>
            </CardTitle>
            <CardDescription>
              Review and finalize your matched transactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {matchedItems.map((match, index) => {
                // Calculate total amount
                const bankTotal = match.bankIds.reduce((total, id) => {
                  const transaction = bankTransactions.find((t) => t.id === id);
                  if (transaction) {
                    return total + (transaction.transaction_type === "credit" ? transaction.amount : -transaction.amount);
                  }
                  return total;
                }, 0);
                
                return (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex justify-between mb-3">
                      <div className="font-medium">Match #{index + 1}</div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => unmatchItem(index)}
                        className="h-8 text-red-500 hover:text-red-700"
                      >
                        Remove
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-2">Bank Transactions</div>
                        <div className="text-sm">
                          {match.bankIds.length} transaction(s) totaling {formatCurrency(Math.abs(bankTotal))}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-2">GL Entries</div>
                        <div className="text-sm">
                          {match.glIds.length} entry(s) totaling {formatCurrency(Math.abs(bankTotal))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Action buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        
        <Button
          onClick={submitReconciliation}
          disabled={matchedItems.length === 0 || isSubmitting}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Complete Reconciliation
        </Button>
      </div>
      
      {/* Simple Statement Update Dialog */}
      <StatementUpdateDialog
        isOpen={isUpdateDialogOpen}
        onClose={() => setIsUpdateDialogOpen(false)}
        bankAccountId={bankAccountId}
        sessionId={sessionId}
        onSuccess={() => {
          // Simply refresh all data instead of trying to update state directly
          refreshAllData();
        }}
      />
    </div>
  );
}

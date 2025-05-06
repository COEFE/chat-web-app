"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { 
  Loader2, 
  Plus, 
  FileText, 
  RefreshCw, 
  Upload, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Calendar as CalendarIcon,
  AlertCircle
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { getAuth } from "firebase/auth";
import { AccountNode } from "@/components/accounts/AccountTree";
import { JournalTypeSelector } from "@/components/journals/JournalTypeSelector";
import { JournalTable } from "@/components/journals/JournalTable";
import { JournalSetupButton } from "@/components/journals/JournalSetupButton";
import { RunMigrationsButton } from "@/components/journals/RunMigrationsButton";
import { TransactionGrid } from "@/components/journals/TransactionGrid";
import DatabaseMigration from "@/components/journals/DatabaseMigration";
import { AccountSetupButton } from "@/components/accounts/AccountSetupButton";
import { RunDatabaseFixes } from "@/components/journals/RunDatabaseFixes";
import { FixJournalTotalsButton } from "@/components/journals/FixJournalTotalsButton";

interface Journal {
  id: number;
  journal_number?: string;
  journal_type?: string;
  journal_type_name?: string;
  transaction_date: string;
  date?: string; // For backward compatibility
  memo: string;
  source?: string;
  reference_number?: string;
  created_by: string;
  created_at: string;
  is_posted: boolean;
  line_count?: number;
  total_amount?: string;
  total_debits?: number;
  total_credits?: number;
  attachment_count?: number;
}

interface JournalLine {
  line_number: number;
  account_id: number;
  description: string;
  debit: number;
  credit: number;
}

interface JournalFormValues {
  journal_type: string;
  transaction_date: Date;
  memo: string;
  source?: string;
  reference_number?: string;
  lines: Array<{
    line_number: number;
    account_id: number;
    description: string;
    debit: number;
    credit: number;
  }>;
}

export default function TransactionsPage() {
  const [activeTab, setActiveTab] = useState("list");
  const [journals, setJournals] = useState<Journal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [accounts, setAccounts] = useState<any>(null);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedJournalType, setSelectedJournalType] = useState<string>("");
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [hasSchemaIssue, setHasSchemaIssue] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Auto-run DB setup on mount and check schema
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user.getIdToken();
      if (!token) return;
      try {
        // Run db setup
        await fetch('/api/journals/db-setup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        
        // Check schema status
        const schemaResponse = await fetch('/api/journals/check-schema', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (schemaResponse.ok) {
          const schemaData = await schemaResponse.json();
          if (schemaData.schema && !schemaData.schema.has_line_number) {
            setHasSchemaIssue(true);
          }
        }
      } catch (e) {
        console.error('[journals] auto-setup/schema check error', e);
      }
    })();
  }, [user]);

  // Load journals and accounts when component mounts or page changes
  useEffect(() => {
    if (user) {
      loadJournals(page);
      loadAccounts();
    }
  }, [user, page]);

  // Reload journals when filters change
  useEffect(() => {
    if (user) {
      // Reset to page 1 when filters change
      setPage(1);
      loadJournals(1);
    }
  }, [startDate, endDate, selectedJournalType, user]);

  // Fetch account data for transaction form
  const loadAccounts = async () => {
    console.log("Attempting to fetch accounts...");
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        console.error("User not authenticated for fetchAccounts");
        toast({
          title: "Authentication Error",
          description: "Please log in to access accounts",
          variant: "destructive"
        });
        return;
      }
      
      const token = await user.getIdToken();
      console.log("Got auth token for accounts fetch");
      
      const response = await fetch("/api/accounts/hierarchy", {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      console.log("Account API response status:", response.status);
      
      // Get the response data even if status is not ok
      // This allows us to handle errors better
      const data = await response.json();
      console.log("Account API raw response:", data);
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch accounts");
      }
      
      // Check if we actually got accounts data
      if (!data.accounts || !Array.isArray(data.accounts) || data.accounts.length === 0) {
        console.warn("No accounts data returned from API");
        setAccounts({ accounts: [], flatAccounts: [] });
        
        // Show toast with setup button
        toast({
          title: "No Accounts Found",
          description: "Please set up accounts using the 'Setup Accounts' button",
          variant: "destructive"
        });
      } else {
        // The API returns { accounts: [...], flatAccounts: [...] }
        // Store the complete response with both hierarchical and flat accounts
        setAccounts(data);
        console.log("Successfully loaded", data.accounts.length, "accounts and", data.flatAccounts.length, "flat accounts");
      }
    } catch (err: any) {
      console.error("Error fetching accounts:", err);
      setAccounts([]);
      toast({
        title: "Account Loading Error",
        description: "Please create accounts using the 'Setup Accounts' button",
        variant: "destructive"
      });
    }
  };

  const loadJournals = async (currentPage: number) => {
    if (!user) return;
    setIsLoading(true);
    
    try {
      const token = await user.getIdToken();
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', limit.toString());
      
      if (selectedJournalType) {
        params.append('type', selectedJournalType);
      }
      
      if (startDate) {
        params.append('startDate', format(startDate, 'yyyy-MM-dd'));
      }
      
      if (endDate) {
        params.append('endDate', format(endDate, 'yyyy-MM-dd'));
      }
      
      const response = await fetch(`/api/journals?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch journals');
      }
      
      const data = await response.json();
      setJournals(data.journals || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (error) {
      console.error('Error loading journals:', error);
      toast({
        title: "Error",
        description: "Failed to load journal entries",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJournal = () => {
    setActiveTab('create');
  };
  
  const handleJournalSubmit = async (values: any) => {
    if (!user) return;
    
    try {
      // Convert form values to match our expected format
      const formattedValues: JournalFormValues = {
        ...values,
        lines: values.lines.map((line: any) => ({
          ...line,
          description: line.description || '',
          debit: line.debit || 0,
          credit: line.credit || 0
        }))
      };
      
      const token = await user.getIdToken();
      const response = await fetch('/api/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ journal: formattedValues })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create journal');
      }
      
      toast({
        title: "Success",
        description: "Journal entry created successfully"
      });
      
      // Switch back to list view and refresh
      setActiveTab('list');
      loadJournals(1);
    } catch (error) {
      console.error('Error creating journal:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create journal entry",
        variant: "destructive"
      });
    }
  };

  const importTransactions = () => {
    // Placeholder for import functionality
    console.log('Import transactions');
  };

  const handleViewJournal = (id: number) => {
    router.push(`/dashboard/transactions/${id}`);
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">Transactions</h1>
        <div className="flex gap-2">
          <Button onClick={() => setActiveTab('create')} variant="default">
            <Plus className="h-4 w-4 mr-2" />
            New Transaction
          </Button>
        </div>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="list">Transaction List</TabsTrigger>
          <TabsTrigger value="create">Create Journal</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>
        
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Journal Entries</CardTitle>
              <CardDescription>View and manage your journal entries</CardDescription>
              
              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="start-date"
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={setStartDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="end-date"
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDate}
                        onSelect={setEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div>
                  <Label htmlFor="journal-type">Journal Type</Label>
                  <JournalTypeSelector
                    value={selectedJournalType}
                    onChange={(type) => setSelectedJournalType(type)}
                  />
                </div>
                
                <div className="flex flex-col space-y-3 mb-4">
                  <div className="flex flex-wrap gap-2">
                    <RunMigrationsButton />
                    <AccountSetupButton onComplete={() => {
                      toast({
                        title: "Accounts Created", 
                        description: "Default chart of accounts has been created. You can now create journal entries."
                      });
                      loadAccounts(); // Refresh accounts after setup
                    }} />
                    <RunDatabaseFixes />
                    <FixJournalTotalsButton onComplete={() => loadJournals(1)} />
                  </div>
                </div>
                
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    className="mr-2"
                    onClick={() => {
                      setStartDate(undefined);
                      setEndDate(undefined);
                      setSelectedJournalType("");
                    }}
                  >
                    Clear
                  </Button>
                  <Button 
                    variant="default" 
                    onClick={() => loadJournals(1)}
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </div>
              </div>
              
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-muted-foreground">
                  {isLoading ? (
                    <span className="flex items-center">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </span>
                  ) : (
                    <span>Showing {journals.length} of {totalCount} entries</span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => loadJournals(page)}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {journals.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="py-2 px-3 text-left">Date</th>
                        <th className="py-2 px-3 text-left">Journal #</th>
                        <th className="py-2 px-3 text-left">Type</th>
                        <th className="py-2 px-3 text-left">Memo</th>
                        <th className="py-2 px-3 text-right">Debits</th>
                        <th className="py-2 px-3 text-right">Credits</th>
                        <th className="py-2 px-3 text-center">Status</th>
                        <th className="py-2 px-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journals.map((journal) => (
                        <tr key={journal.id} className="border-b hover:bg-muted/50">
                          <td className="py-2 px-3">
                            {journal.transaction_date || journal.date ? 
                              format(new Date(journal.transaction_date || journal.date || ''), 'MMM d, yyyy') : 
                              '—'}
                          </td>
                          <td className="py-2 px-3">{journal.journal_number || '—'}</td>
                          <td className="py-2 px-3">
                            <Badge variant="outline">
                              {journal.journal_type_name || journal.journal_type || 'General'}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">{journal.memo}</td>
                          <td className="py-2 px-3 text-right">
                            {
                              (() => {
                                const debit = parseFloat(String(journal.total_debits ?? journal.total_amount ?? 0));
                                return `$${debit.toFixed(2)}`;
                              })()
                            }
                          </td>
                          <td className="py-2 px-3 text-right">
                            {
                              (() => {
                                const credit = parseFloat(String(journal.total_credits ?? journal.total_amount ?? 0));
                                return `$${credit.toFixed(2)}`;
                              })()
                            }
                          </td>
                          <td className="py-2 px-3 text-center">
                            {journal.is_posted ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-xs">
                                Posted
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                Draft
                              </Badge>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewJournal(journal.id)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4">
                  {isLoading ? (
                    <Loader2 className="h-8 w-8 mx-auto animate-spin" />
                  ) : (
                    <p>No journal entries found</p>
                  )}
                </div>
              )}

              {/* Pagination */}
              {totalCount > limit && (
                <div className="flex justify-between items-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                    disabled={page === 1 || isLoading}
                  >
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {page} of {Math.ceil(totalCount / limit)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(prev => prev + 1)}
                    disabled={page >= Math.ceil(totalCount / limit) || isLoading}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="create">
          {accounts && (accounts.accounts?.length > 0 || accounts.flatAccounts?.length > 0) ? (
            <TransactionGrid 
              accounts={accounts} 
              onSubmit={handleJournalSubmit} 
            />
          ) : (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <AlertCircle className="w-12 h-12 text-yellow-500" />
                  <h3 className="text-xl font-medium">No Accounts Available</h3>
                  <p className="text-muted-foreground text-center">
                    Please set up your chart of accounts before creating transactions.
                  </p>
                  <AccountSetupButton onComplete={() => {
                    toast({
                      title: "Accounts Created", 
                      description: "Default chart of accounts has been created. You can now create journal entries."
                    });
                    loadAccounts();
                  }} />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        
        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Transactions</CardTitle>
              <CardDescription>
                Upload a CSV file with transaction data
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted-foreground/25 rounded-lg">
                <Upload className="h-10 w-10 text-muted-foreground mb-2" />
                <p className="mb-2 text-sm text-muted-foreground">Drag and drop your CSV file here, or click to browse</p>
                <Button variant="outline" size="sm">
                  Browse Files
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Database migration dialog */}
      {showMigrationDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden max-w-2xl w-full">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">Database Schema Migration</h2>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowMigrationDialog(false)}>
                ✕
              </Button>
            </div>
            <div className="p-4">
              <DatabaseMigration />
            </div>
            <div className="flex justify-end p-4 border-t">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowMigrationDialog(false);
                  setHasSchemaIssue(false);
                }}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

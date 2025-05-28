"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ArrowLeft, Plus, Trash2, AlertCircle, Paperclip, Info } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Account {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  parent_code: string | null;
  notes: string | null;
  is_custom: boolean;
}

interface JournalLine {
  id: string;
  account_id: number | null;
  debit: string;
  credit: string;
  description: string;
  category: string;
  location: string;
  vendor: string;
  funder: string;
}

export default function DuplicateJournalPage() {
  const params = useParams();
  const journalId = params.id;
  
  // State variables
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [memo, setMemo] = useState("");
  const [source, setSource] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { id: crypto.randomUUID(), account_id: null, debit: "", credit: "", description: "", category: "", location: "", vendor: "", funder: "" },
    { id: crypto.randomUUID(), account_id: null, debit: "", credit: "", description: "", category: "", location: "", vendor: "", funder: "" }
  ]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [originalJournal, setOriginalJournal] = useState<any>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Fetch accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      if (!user) return;
      setIsLoading(true);
      
      try {
        const token = await user.getIdToken();
        if (!token) {
          throw new Error('You must be logged in to access accounts');
        }
        
        const res = await fetch('/api/accounts', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || 'Failed to fetch accounts');
        }
        
        // Match the format used in the new transaction page
        setAccounts(data.accounts || []);
      } catch (error) {
        console.error('Error fetching accounts:', error);
        toast({
          title: "Error fetching accounts",
          description: error instanceof Error ? error.message : "Unknown error occurred",
          variant: "destructive",
        });
        setAccounts([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [user, toast]);

  // Fetch original journal data
  useEffect(() => {
    const fetchJournal = async () => {
      if (!user || !journalId) return;
      
      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/journals?id=${journalId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch journal');
        }
        
        const data = await response.json();
        setOriginalJournal(data);
        
        // Pre-populate form with journal data
        setDate(format(new Date(), 'yyyy-MM-dd')); // Use current date for duplicate
        setMemo(data.memo ? `Copy of: ${data.memo}` : "");
        setSource(data.source || "");
        
        // Pre-populate lines with original journal lines
        if (data.lines && data.lines.length > 0) {
          const newLines = data.lines.map((line: any) => ({
            id: crypto.randomUUID(),
            account_id: line.account_id,
            debit: line.debit_amount ? String(line.debit_amount) : "",
            credit: line.credit_amount ? String(line.credit_amount) : "",
            description: line.description || "",
            category: line.category || "",
            location: line.location || "",
            vendor: line.vendor || "",
            funder: line.funder || ""
          }));
          
          setLines(newLines);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching journal:', error);
        toast({
          title: "Error",
          description: "Failed to load the original journal",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    fetchJournal();
  }, [user, journalId, toast]);

  // Calculate totals
  const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
  const isBalanced = totalDebit.toFixed(2) === totalCredit.toFixed(2);

  // Add line
  const addLine = () => {
    setLines([...lines, { 
      id: crypto.randomUUID(), 
      account_id: null, 
      debit: "", 
      credit: "", 
      description: "",
      category: "",
      location: "",
      vendor: "",
      funder: ""
    }]);
  };

  // Remove line
  const removeLine = (id: string) => {
    if (lines.length <= 1) {
      toast({
        title: "Error",
        description: "Journal must have at least one line",
        variant: "destructive",
      });
      return;
    }
    
    setLines(lines.filter(line => line.id !== id));
  };

  // Handle line changes
  const handleLineChange = (id: string, field: string, value: string | number) => {
    setLines(lines.map(line => {
      if (line.id === id) {
        return { ...line, [field]: value };
      }
      return line;
    }));
  };

  // Save journal
  const saveJournal = async () => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to create journals",
        variant: "destructive",
      });
      return;
    }

    // Check if original journal data is loaded
    if (!originalJournal) {
      toast({
        title: "Error",
        description: "Original journal data is still loading. Please wait.",
        variant: "destructive",
      });
      return;
    }

    // Validation
    if (!date || !memo) {
      toast({
        title: "Error",
        description: "Date and memo are required",
        variant: "destructive",
      });
      return;
    }

    // Validate lines
    for (const line of lines) {
      if (!line.account_id) {
        toast({
          title: "Error",
          description: "All lines must have an account selected",
          variant: "destructive",
        });
        return;
      }

      if (!line.debit && !line.credit) {
        toast({
          title: "Error",
          description: "All lines must have either a debit or credit amount",
          variant: "destructive",
        });
        return;
      }
    }

    // Check if journal is balanced
    if (!isBalanced) {
      toast({
        title: "Error",
        description: "Journal must be balanced (total debits must equal total credits)",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      
      // Format journal lines exactly as expected by the API
      const formattedLines = lines.map(line => ({
        accountId: line.account_id, // API expects accountId, not account_id
        debit_amount: parseFloat(line.debit) || 0,
        credit_amount: parseFloat(line.credit) || 0,
        description: line.description || '',
        // Only include these fields if they are supported by the API
        category: line.category || "",
        location: line.location || "",
        vendor: line.vendor || "",
        funder: line.funder || ""
      }));

      // Filter out lines with zero amounts
      const validLines = formattedLines.filter(line => 
        (line.debit_amount > 0 || line.credit_amount > 0)
      );
      
      if (validLines.length === 0) {
        toast({
          title: "Error",
          description: "Please enter at least one debit or credit amount",
          variant: "destructive",
        });
        return;
      }
      
      // Save to API with exactly the fields expected in the legacy format
      const token = await user.getIdToken();
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          date, // Use date, not transaction_date
          memo: memo || '',
          source: source || '',
          lines: validLines
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create journal');
      }

      toast({
        title: "Success",
        description: "Journal entry created successfully",
        variant: "default",
      });

      // Handle both possible response formats for journal ID
      const newJournalId = data.journal_id || data.id;
      if (!newJournalId) {
        console.error('No journal ID in response', data);
        toast({
          title: "Warning",
          description: "Journal was created but we couldn't get its ID. Returning to transactions list.",
          variant: "default",
        });
        router.push('/dashboard/transactions');
        return;
      }
      
      // Navigate to the new journal
      router.push(`/dashboard/transactions/${newJournalId}`);
    } catch (error) {
      console.error('Error creating journal:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create journal",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Go back
  const goBack = () => {
    router.push(`/dashboard/transactions/${journalId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="bg-muted">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Duplicate Journal Entry</CardTitle>
              <CardDescription>Create a new journal entry based on journal #{journalId}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={saveJournal} disabled={isSaving || isLoading || !originalJournal}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save & Open Journal
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {/* Journal header */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Description of the transaction"
              />
            </div>
            <div>
              <Label htmlFor="source">Source Document</Label>
              <Input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Invoice #, Receipt #, etc."
              />
            </div>
          </div>

          {/* Journal lines */}
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-2 font-medium text-sm border-b pb-2">
              <div className="col-span-3">Account</div>
              <div className="col-span-1">Debit</div>
              <div className="col-span-1">Credit</div>
              <div className="col-span-2">Description</div>
              <div className="col-span-1">Category</div>
              <div className="col-span-1">Location</div>
              <div className="col-span-1">Vendor</div>
              <div className="col-span-1">Funder</div>
              <div className="col-span-1"></div>
            </div>

            {lines.map((line, index) => (
              <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Select
                    value={line.account_id?.toString() || ""}
                    onValueChange={(value) => handleLineChange(line.id, 'account_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.isArray(accounts) ? accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.code} - {account.name}
                        </SelectItem>
                      )) : <SelectItem value="no_accounts">No accounts available</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-1">
                  <Input
                    type="number"
                    value={line.debit}
                    onChange={(e) => {
                      handleLineChange(line.id, 'debit', e.target.value);
                      if (e.target.value) {
                        handleLineChange(line.id, 'credit', '');
                      }
                    }}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    type="number"
                    value={line.credit}
                    onChange={(e) => {
                      handleLineChange(line.id, 'credit', e.target.value);
                      if (e.target.value) {
                        handleLineChange(line.id, 'debit', '');
                      }
                    }}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    value={line.description}
                    onChange={(e) => handleLineChange(line.id, 'description', e.target.value)}
                    placeholder="Description"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    value={line.category}
                    onChange={(e) => handleLineChange(line.id, 'category', e.target.value)}
                    placeholder="Category"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    value={line.location}
                    onChange={(e) => handleLineChange(line.id, 'location', e.target.value)}
                    placeholder="Location"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    value={line.vendor}
                    onChange={(e) => handleLineChange(line.id, 'vendor', e.target.value)}
                    placeholder="Vendor"
                  />
                </div>
                <div className="col-span-1">
                  <Input
                    value={line.funder}
                    onChange={(e) => handleLineChange(line.id, 'funder', e.target.value)}
                    placeholder="Funder"
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={addLine}>
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
              
              <div className="flex items-center gap-4">
                <div className="text-sm font-medium">
                  Total Debit: ${totalDebit.toFixed(2)}
                </div>
                <div className="text-sm font-medium">
                  Total Credit: ${totalCredit.toFixed(2)}
                </div>
                <div className={`flex items-center ${isBalanced ? 'text-green-500' : 'text-red-500'}`}>
                  {isBalanced ? (
                    <span className="text-sm font-medium">Balanced</span>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 mr-1" />
                      <span className="text-sm font-medium">Unbalanced</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Attachments Information */}
          <div className="mt-6">
            <Alert>
              <Paperclip className="h-4 w-4" />
              <AlertDescription>
                <strong>Attachments:</strong> You can add attachments (receipts, invoices, supporting documents) after saving this journal entry. 
                The journal will open in view mode where you can upload and manage attachments.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between border-t pt-6">
          <Button variant="secondary" onClick={goBack}>Cancel</Button>
          <Button onClick={saveJournal} disabled={isSaving || isLoading || !originalJournal}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save & Open Journal
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

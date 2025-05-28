"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Save, ArrowLeft, Plus, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { format } from "date-fns";

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
  category: string;    // Added
  location: string;    // Added
  vendor: string;      // Added
  funder: string;      // Added
}

export default function NewTransactionPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [memo, setMemo] = useState("");
  const [source, setSource] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { id: crypto.randomUUID(), account_id: null, debit: "", credit: "", description: "", category: "", location: "", vendor: "", funder: "" },
    { id: crypto.randomUUID(), account_id: null, debit: "", credit: "", description: "", category: "", location: "", vendor: "", funder: "" }
  ]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Fetch accounts
  useEffect(() => {
    if (!user) return;
    
    const fetchAccounts = async () => {
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
        
        setAccounts(data.accounts || []);
      } catch (error) {
        console.error('Error fetching accounts:', error);
        toast({
          title: "Error fetching accounts",
          description: error instanceof Error ? error.message : "Unknown error occurred",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAccounts();
  }, [user, toast]);

  // Add a new line
  const addLine = () => {
    setLines([
      ...lines,
      { 
        id: crypto.randomUUID(), 
        account_id: null, 
        debit: "", 
        credit: "", 
        description: "",
        category: "",
        location: "",
        vendor: "",
        funder: ""
      }
    ]);
  };

  // Remove a line
  const removeLine = (id: string) => {
    if (lines.length <= 2) {
      toast({
        title: "Cannot remove line",
        description: "A journal entry must have at least two lines",
        variant: "destructive",
      });
      return;
    }
    setLines(lines.filter(line => line.id !== id));
  };

  // Update a line
  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(lines.map(line => {
      if (line.id === id) {
        // If updating debit and it has a value, clear credit
        if (field === 'debit' && value !== "") {
          return { ...line, [field]: value, credit: "" };
        }
        // If updating credit and it has a value, clear debit
        if (field === 'credit' && value !== "") {
          return { ...line, [field]: value, debit: "" };
        }
        return { ...line, [field]: value };
      }
      return line;
    }));
  };

  // Calculate totals
  const totalDebit = lines.reduce((sum, line) => sum + (parseFloat(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (parseFloat(line.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01; // Allow for small rounding errors

  // Save journal entry
  const saveJournal = async () => {
    // Validate form
    if (!date) {
      toast({
        title: "Missing date",
        description: "Please enter a date for the journal entry",
        variant: "destructive",
      });
      return;
    }
    
    if (!memo) {
      toast({
        title: "Missing memo",
        description: "Please enter a memo for the journal entry",
        variant: "destructive",
      });
      return;
    }
    
    // Validate lines
    const invalidLines = lines.filter(line => !line.account_id || (line.debit === "" && line.credit === ""));
    if (invalidLines.length > 0) {
      toast({
        title: "Invalid lines",
        description: "Each line must have an account and either a debit or credit amount",
        variant: "destructive",
      });
      return;
    }
    
    // Check if balanced
    if (!isBalanced) {
      toast({
        title: "Journal not balanced",
        description: `Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})`,
        variant: "destructive",
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Format lines for API submission
      const formattedLines = lines.map(line => ({
        account_id: line.account_id,
        debit_amount: line.debit ? parseFloat(line.debit) : 0,
        credit_amount: line.credit ? parseFloat(line.credit) : 0,
        description: line.description,
        category: line.category,
        location: line.location,
        vendor: line.vendor,
        funder: line.funder
      }));
      
      const requestBody = {
        date,
        memo,
        source,
        lines: formattedLines
      };
      
      console.log('[Frontend] Submitting journal with data:', requestBody);
      console.log('[Frontend] Number of lines:', formattedLines.length);
      
      const res = await fetch('/api/journals', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create journal entry');
      }
      
      toast({
        title: "Journal entry created",
        description: "Your transaction has been saved successfully",
      });
      
      // Redirect to journal entry view
      router.push(`/dashboard/transactions/${data.journal_id}`);
    } catch (error) {
      console.error('Error saving journal:', error);
      toast({
        title: "Error saving journal",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={() => router.back()} className="mr-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">New Journal Entry</h1>
      </div>
      
      <Card>
        <CardHeader className="bg-blue-100">
          <CardTitle>Transaction Details (UPDATED)</CardTitle>
          <CardDescription>
            Create a new balanced journal entry with debits and credits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Header information */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isLoading || isSaving}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="memo">Memo</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                disabled={isLoading || isSaving}
                placeholder="Description of this transaction"
              />
            </div>
          </div>
          
          <div>
            <Label htmlFor="source">Source (Optional)</Label>
            <Input
              id="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              disabled={isLoading || isSaving}
              placeholder="Invoice #, Check #, etc."
            />
          </div>
          
          {/* Journal lines */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Line Items</h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={addLine}
                disabled={isLoading || isSaving}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Line
              </Button>
            </div>
            
            <div className="border rounded-md overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Account</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Location</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Vendor</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Funder</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider w-32">Debit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider w-32">Credit</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider w-16">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-black">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-4 py-2">
                        <Select
                          value={line.account_id?.toString() || ""}
                          onValueChange={(value) => updateLine(line.id, 'account_id', value ? parseInt(value, 10) : null)}
                          disabled={isLoading || isSaving}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((account) => (
                              <SelectItem key={account.id} value={account.id.toString()}>
                                {account.code} - {account.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(line.id, 'description', e.target.value)}
                          disabled={isLoading || isSaving}
                          placeholder="Line description"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.category}
                          onChange={(e) => updateLine(line.id, 'category', e.target.value)}
                          disabled={isLoading || isSaving}
                          placeholder="Category"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.location}
                          onChange={(e) => updateLine(line.id, 'location', e.target.value)}
                          disabled={isLoading || isSaving}
                          placeholder="Location"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.vendor}
                          onChange={(e) => updateLine(line.id, 'vendor', e.target.value)}
                          disabled={isLoading || isSaving}
                          placeholder="Vendor"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.funder}
                          onChange={(e) => updateLine(line.id, 'funder', e.target.value)}
                          disabled={isLoading || isSaving}
                          placeholder="Funder"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.debit}
                          onChange={(e) => updateLine(line.id, 'debit', e.target.value)}
                          disabled={isLoading || isSaving || line.credit !== ""}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.credit}
                          onChange={(e) => updateLine(line.id, 'credit', e.target.value)}
                          disabled={isLoading || isSaving || line.debit !== ""}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(line.id)}
                          disabled={isLoading || isSaving}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right font-medium">Totals:</td>
                    <td className="px-4 py-2 font-medium">${totalDebit.toFixed(2)}</td>
                    <td className="px-4 py-2 font-medium">${totalCredit.toFixed(2)}</td>
                    <td className="px-4 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            
            {/* Balance indicator */}
            <div className={`mt-2 p-2 rounded-md ${isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} flex items-center`}>
              {isBalanced ? (
                <div className="flex items-center">
                  <span className="font-medium">Journal is balanced</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  <span className="font-medium">Journal is not balanced: Difference is ${Math.abs(totalDebit - totalCredit).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={saveJournal} disabled={isLoading || isSaving || !isBalanced}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Journal Entry
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Save, Plus, Trash } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { DatePicker } from "@/components/DatePicker";

interface Account {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  notes: string | null;
  is_custom: boolean;
}

interface JournalLine {
  id?: number;
  account_id: number;
  account_code?: string;
  account_name?: string;
  debit: string;
  credit: string;
  description: string;
  category: string;
  location: string;
  vendor: string;
  funder: string;
}

interface Journal {
  id: number;
  date: string;
  memo: string;
  source: string;
  created_by: string;
  created_at: string;
  is_posted: boolean;
  lines: JournalLine[];
}

export default function EditJournalPage() {
  const params = useParams();
  const [journal, setJournal] = useState<Journal | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [memo, setMemo] = useState("");
  const [source, setSource] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const journalId = parseInt(idParam ?? '', 10);

  // Fetch journal and accounts
  useEffect(() => {
    if (!user) return;
    
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const token = await user.getIdToken();
        if (!token) {
          throw new Error('You must be logged in to edit this journal');
        }
        
        // Fetch journal
        const journalRes = await fetch(`/api/journals/${journalId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!journalRes.ok) {
          const journalData = await journalRes.json();
          throw new Error(journalData.error || 'Failed to fetch journal');
        }
        
        const journalData = await journalRes.json();
        const journalDetails = journalData.journal;
        
        if (journalDetails.is_posted) {
          toast({
            title: "Cannot edit posted journal",
            description: "This journal entry has been posted and cannot be edited",
            variant: "destructive",
          });
          router.push(`/dashboard/transactions/${journalId}`);
          return;
        }
        
        // Fetch accounts
        const accountsRes = await fetch('/api/accounts', {
          headers: { Authorization: `Bearer ${token}` },
        });
        
        if (!accountsRes.ok) {
          const accountsData = await accountsRes.json();
          throw new Error(accountsData.error || 'Failed to fetch accounts');
        }
        
        const accountsData = await accountsRes.json();
        
        // Set state
        setJournal(journalDetails);
        setDate(new Date(journalDetails.date));
        setMemo(journalDetails.memo);
        setSource(journalDetails.source || '');
        setLines(journalDetails.lines);
        setAccounts(accountsData.accounts || []);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          title: "Error fetching data",
          description: error instanceof Error ? error.message : "Unknown error occurred",
          variant: "destructive",
        });
        router.push('/dashboard/transactions');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchData();
  }, [user, journalId, toast, router]);

  // Add a new line
  const addLine = () => {
    setLines([
      ...lines,
      {
        account_id: 0,
        debit: '',
        credit: '',
        description: '',
        category: '',
        location: '',
        vendor: '',
        funder: ''
      },
    ]);
  };

  // Remove a line
  const removeLine = (index: number) => {
    const newLines = [...lines];
    newLines.splice(index, 1);
    setLines(newLines);
  };

  // Update a line
  const updateLine = (index: number, field: keyof JournalLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    
    // If account_id is updated, add account_code and account_name
    if (field === 'account_id') {
      const account = accounts.find(a => a.id === parseInt(value, 10));
      if (account) {
        newLines[index].account_code = account.code;
        newLines[index].account_name = account.name;
      }
    }
    
    // If debit is updated and has a value, clear credit
    if (field === 'debit' && value) {
      newLines[index].credit = '';
    }
    
    // If credit is updated and has a value, clear debit
    if (field === 'credit' && value) {
      newLines[index].debit = '';
    }
    
    setLines(newLines);
  };

  // Calculate totals
  const calculateTotals = () => {
    const totals = lines.reduce(
      (acc, line) => {
        const debit = parseFloat(line.debit) || 0;
        const credit = parseFloat(line.credit) || 0;
        return {
          debit: acc.debit + debit,
          credit: acc.credit + credit,
        };
      },
      { debit: 0, credit: 0 }
    );
    
    return {
      ...totals,
      balance: totals.debit - totals.credit,
    };
  };

  // Validate form
  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    if (!date) {
      newErrors.date = 'Date is required';
    }
    
    if (!memo.trim()) {
      newErrors.memo = 'Memo is required';
    }
    
    if (lines.length === 0) {
      newErrors.lines = 'At least one line is required';
    }
    
    // Validate each line
    lines.forEach((line, index) => {
      if (!line.account_id) {
        newErrors[`line_${index}_account`] = 'Account is required';
      }
      
      if (!line.debit && !line.credit) {
        newErrors[`line_${index}_amount`] = 'Either debit or credit is required';
      }
    });
    
    // Check if debits equal credits
    const totals = calculateTotals();
    if (Math.abs(totals.balance) > 0.01) {
      newErrors.balance = 'Debits must equal credits';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Save journal
  const saveJournal = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors before saving",
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
      
      // Format lines for API
      const formattedLines = lines.map(line => ({
        id: line.id,
        account_id: line.account_id,
        debit_amount: parseFloat(line.debit) || 0,
        credit_amount: parseFloat(line.credit) || 0,
        description: line.description || '',
        category: line.category || '',
        location: line.location || '',
        vendor: line.vendor || '',
        funder: line.funder || ''
      }));
      
      // Update journal
      const res = await fetch(`/api/journals/${journalId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          date: date?.toISOString().split('T')[0],
          memo,
          source,
          lines: formattedLines,
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update journal');
      }
      
      toast({
        title: "Journal Updated",
        description: "Journal entry has been updated successfully",
      });
      
      // Redirect to journal detail page
      router.push(`/dashboard/transactions/${journalId}`);
    } catch (error) {
      console.error('Error updating journal:', error);
      toast({
        title: "Error updating journal",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const totals = calculateTotals();

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => router.push(`/dashboard/transactions/${journalId}`)} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Edit Journal Entry</h1>
        </div>
        <Button onClick={saveJournal} disabled={isSaving} className="flex items-center gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Journal Details</CardTitle>
          <CardDescription>
            Edit the details of this journal entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="date">Date <span className="text-red-500">*</span></Label>
              <DatePicker
                id="date"
                date={date}
                setDate={setDate}
                className={errors.date ? 'border-red-500' : ''}
              />
              {errors.date && <p className="text-red-500 text-sm">{errors.date}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">Memo <span className="text-red-500">*</span></Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className={errors.memo ? 'border-red-500' : ''}
              />
              {errors.memo && <p className="text-red-500 text-sm">{errors.memo}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Line Items</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="flex items-center gap-1"
              >
                <Plus className="h-4 w-4" />
                Add Line
              </Button>
            </div>
            
            {errors.lines && <p className="text-red-500 text-sm">{errors.lines}</p>}
            {errors.balance && <p className="text-red-500 text-sm">{errors.balance}</p>}
            
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
                    <th className="px-4 py-2 text-center text-xs font-medium text-black uppercase tracking-wider w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-black">
                  {lines.map((line, index) => (
                    <tr key={index} className="odd:bg-white even:bg-gray-100">
                      <td className="px-4 py-2">
                        <Select
                          value={line.account_id.toString()}
                          onValueChange={(value) => updateLine(index, 'account_id', parseInt(value, 10))}
                        >
                          <SelectTrigger className={errors[`line_${index}_account`] ? 'border-red-500' : ''}>
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
                        {errors[`line_${index}_account`] && (
                          <p className="text-red-500 text-xs mt-1">{errors[`line_${index}_account`]}</p>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          placeholder="Description"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.category || ''}
                          onChange={(e) => updateLine(index, 'category', e.target.value)}
                          placeholder="Category"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.location || ''}
                          onChange={(e) => updateLine(index, 'location', e.target.value)}
                          placeholder="Location"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.vendor || ''}
                          onChange={(e) => updateLine(index, 'vendor', e.target.value)}
                          placeholder="Vendor"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          value={line.funder || ''}
                          onChange={(e) => updateLine(index, 'funder', e.target.value)}
                          placeholder="Funder"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={line.debit}
                          onChange={(e) => updateLine(index, 'debit', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className={errors[`line_${index}_amount`] ? 'border-red-500' : ''}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          type="number"
                          value={line.credit}
                          onChange={(e) => updateLine(index, 'credit', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className={errors[`line_${index}_amount`] ? 'border-red-500' : ''}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeLine(index)}
                          className="h-8 w-8 p-0"
                        >
                          <Trash className="h-4 w-4 text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100">
                  <tr>
                    <td colSpan={6} className="px-4 py-2 text-right font-medium">Totals:</td>
                    <td className="px-4 py-2 text-right">${totals.debit.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">${totals.credit.toFixed(2)}</td>
                    <td></td>
                  </tr>
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-right font-medium">Balance:</td>
                    <td colSpan={2} className={`px-4 py-2 text-right font-medium ${Math.abs(totals.balance) > 0.01 ? 'text-red-500' : 'text-green-500'}`}>
                      ${Math.abs(totals.balance).toFixed(2)} {totals.balance !== 0 ? (totals.balance > 0 ? 'DR' : 'CR') : ''}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push(`/dashboard/transactions/${journalId}`)}>
            Cancel
          </Button>
          <Button onClick={saveJournal} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

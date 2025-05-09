"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { JournalPostButton } from "@/components/journals/JournalPostButton";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, Pencil, Trash2, FileText, Copy } from "lucide-react";
import { AttachmentUpload } from "@/components/journals/AttachmentUpload";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface JournalLine {
  id: number;
  account_id: number;
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
  description: string;
  category?: string;
  location?: string;
  vendor?: string;
  funder?: string;
}

interface Attachment {
  id: number;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
}

interface Journal {
  id: number;
  journal_number?: string;
  journal_type?: string;
  journal_type_name?: string;
  date?: string; // For backward compatibility
  transaction_date: string;
  memo: string;
  source?: string;
  reference_number?: string;
  created_by: string;
  created_at: string;
  is_posted: boolean;
  lines: JournalLine[];
  attachments: Attachment[];
  total_debits?: number;
  total_credits?: number;
  is_balanced?: boolean;
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
}

export default function JournalDetailPage() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const idParam = Array.isArray(params.id) ? params.id[0] : params.id;
  const journalId = parseInt(idParam ?? '', 10);

  // Define fetchJournal function to be used throughout the component
  const fetchJournal = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to access this journal');
      }
      
      const res = await fetch(`/api/journals?id=${journalId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch journal');
      }
      
      setJournal(data);
    } catch (error) {
      console.error('Error fetching journal:', error);
      toast({
        title: "Error fetching journal",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch journal entry on component mount
  useEffect(() => {
    if (user) {
      fetchJournal();
    }
  }, []);  // Empty dependency array since fetchJournal is defined in component body
  
  // Re-fetch when user or journalId changes
  useEffect(() => {
    if (user && journalId) {
      fetchJournal();
    }
  }, [user, journalId]);

  // Delete journal entry
  const deleteJournal = async () => {
    setIsDeleting(true);
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const res = await fetch(`/api/journals/${journalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete journal entry');
      }
      
      toast({
        title: "Journal entry deleted",
        description: "The transaction has been deleted successfully",
      });
      
      // Redirect to journals list
      router.push('/dashboard/transactions');
    } catch (error) {
      console.error('Error deleting journal:', error);
      toast({
        title: "Error deleting journal",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit journal entry
  const editJournal = () => {
    router.push(`/dashboard/transactions/${journalId}/edit`);
  };

  // Function to duplicate a journal entry
  const duplicateJournal = async () => {
    if (!journal || !user) return;
    
    try {
      // Get authentication token
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Create a new journal object without ID and with current date
      const newJournal = {
        journal_type: journal.journal_type || 'GJ',
        transaction_date: new Date().toISOString().split('T')[0],
        memo: `Copy of ${journal.memo}`,
        source: journal.source,
        reference_number: journal.reference_number,
        lines: journal.lines.map(line => ({
          account_id: line.account_id,
          description: line.description,
          debit: parseFloat(line.debit) || 0,
          credit: parseFloat(line.credit) || 0,
          category: line.category || '',
          location: line.location || '',
          vendor: line.vendor || '',
          funder: line.funder || ''
        }))
      };
      
      // Create the new journal entry
      const res = await fetch(`/api/journals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ journal: newJournal })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to duplicate journal');
      }
      
      // Show success message
      toast({
        title: "Journal duplicated",
        description: `Successfully created a copy of journal #${journal.id}`,
      });
      
      // Redirect to the new journal entry
      router.push(`/dashboard/transactions/${data.id}`);
    } catch (error) {
      console.error('Error duplicating journal:', error);
      toast({
        title: "Error duplicating journal",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!journal) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center mb-6">
          <Button variant="ghost" onClick={() => router.back()} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Journal Entry Not Found</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <p className="text-lg text-muted-foreground">
                The requested journal entry could not be found.
              </p>
              <Button onClick={() => router.push('/dashboard/transactions')} className="mt-4">
                Return to Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" onClick={() => router.push('/dashboard/transactions')} className="mr-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Journal Entry #{journal.id}</h1>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={duplicateJournal}>
            <Copy className="h-4 w-4 mr-2" />
            Duplicate
          </Button>
          {!journal.is_posted && (
            <>
              <JournalPostButton 
                journalId={journal.id} 
                onPostComplete={() => fetchJournal()}
              />
              <Button variant="outline" onClick={editJournal}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Journal Entry</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this journal entry? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteJournal}
                      disabled={isDeleting}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Journal details */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Transaction Details</CardTitle>
            <CardDescription>
              View the details of this journal entry.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Journal #</h3>
                <p>{journal.journal_number || journal.id}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Date</h3>
                <p>{journal.transaction_date || journal.date ? 
                    format(new Date(journal.transaction_date || journal.date || ''), 'MMMM d, yyyy') : 
                    '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Journal Type</h3>
                <p>{journal.journal_type_name || journal.journal_type || 'General Journal'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Status</h3>
                <p>
                  <span className={`px-2 py-1 rounded-full text-xs ${journal.is_posted ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {journal.is_posted ? 'Posted' : 'Draft'}
                  </span>
                </p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Memo</h3>
                <p>{journal.memo}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Source</h3>
                <p>{journal.source || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Reference #</h3>
                <p>{journal.reference_number || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Created By</h3>
                <p>{journal.created_by}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Created At</h3>
                <p>{format(new Date(journal.created_at), 'MMM d, yyyy h:mm a')}</p>
              </div>
            </div>
            
            {/* Journal lines */}
            <div>
              <h3 className="text-lg font-medium mb-2">Line Items</h3>
              <div className="border rounded-md overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-200 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Account</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Description</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Category</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Location</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider">Funder</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider w-32">Debit</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-black dark:text-white uppercase tracking-wider w-32">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-black dark:text-gray-100">
                    {journal.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{line.account_code}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-300">{line.account_name}</div>
                        </td>
                        <td className="px-4 py-2">{line.description || '-'}</td>
                        <td className="px-4 py-2">{line.category || '-'}</td>
                        <td className="px-4 py-2">{line.location || '-'}</td>
                        <td className="px-4 py-2">{line.vendor || '-'}</td>
                        <td className="px-4 py-2">{line.funder || '-'}</td>
                        <td className="px-4 py-2 text-right font-medium dark:text-green-400">
                          {parseFloat(line.debit) > 0 ? `$${parseFloat(line.debit).toFixed(2)}` : ''}
                        </td>
                        <td className="px-4 py-2 text-right font-medium dark:text-green-400">
                          {parseFloat(line.credit) > 0 ? `$${parseFloat(line.credit).toFixed(2)}` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right font-medium dark:text-white">Totals:</td>
                      <td className="px-4 py-2 text-right font-bold dark:text-green-400">
                        {
                          (() => {
                            const debitTotal = journal.total_debits ?? journal.totals?.debit ?? journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0);
                            return `$${debitTotal.toFixed(2)}`;
                          })()
                        }
                      </td>
                      <td className="px-4 py-2 text-right font-bold dark:text-green-400">
                        {
                          (() => {
                            const creditTotal = journal.total_credits ?? journal.totals?.credit ?? journal.lines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0);
                            return `$${creditTotal.toFixed(2)}`;
                          })()
                        }
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Attachments */}
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
            <CardDescription>
              Supporting documents for this transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {journal.attachments && journal.attachments.length > 0 ? (
              <ul className="space-y-2">
                {journal.attachments.map((attachment) => (
                  <li key={attachment.id} className="border rounded-md p-3">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 mr-2 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {(attachment.file_size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                          View
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No attachments for this transaction.</p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            {!journal.is_posted && (
              <AttachmentUpload 
                journalId={journal.id} 
                onUploadComplete={() => fetchJournal()} 
                disabled={journal.is_posted} 
              />
            )}
            {journal.is_posted && (
              <p className="text-center text-sm text-muted-foreground w-full">
                Cannot add attachments to posted journal entries
              </p>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

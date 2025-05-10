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
  reversal_of_journal_id?: number;
  reversed_by_journal_id?: number;
  totals: {
    debit: number;
    credit: number;
    balance: number;
  };
  debit: number;
  credit: number;
  balance: number;
}

export default function JournalDetailPage() {
  // State hooks
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReversing, setIsReversing] = useState(false);
  const [journal, setJournal] = useState<Journal | null>(null);
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
  }, [user, journalId]);

  // Delete an attachment
  const deleteAttachment = async (attachmentId: number) => {
    if (!user || !journal) return;

    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to delete an attachment');
      }
      
      const res = await fetch(`/api/journals/${journalId}/attachments/${attachmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete attachment');
      }
      
      toast({
        title: "Attachment deleted",
        description: "The file has been successfully deleted",
        variant: "default",
      });
      
      // Refresh journal to update attachments list
      fetchJournal();
    } catch (error) {
      console.error('Error deleting attachment:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Reverse the journal - creates a new journal with opposite values
  const reverseJournal = async () => {
    if (!user || !journal) return;
    
    setIsReversing(true);
    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to reverse a journal');
      }
      
      const response = await fetch('/api/journals/reverse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ journalId: journal.id })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reverse journal');
      }
      
      toast({
        title: "Journal Reversed",
        description: `Successfully created reversal journal #${data.journalId}`,
        variant: "default"
      });
      
      // Navigate to the new journal
      router.push(`/dashboard/transactions/${data.journalId}`);
    } catch (error) {
      console.error('Error reversing journal:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsReversing(false);
    }
  };

  // Edit journal entry
  const editJournal = () => {
    router.push(`/dashboard/transactions/${journalId}/edit`);
  };
  
  // Duplicate the journal
  const duplicateJournal = () => {
    router.push(`/dashboard/transactions/${journalId}/duplicate`);
  };
  
  // Delete the journal
  const deleteJournal = async () => {
    if (!user || !journal) return;

    setIsDeleting(true);
    try {
      const token = await user.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to delete a journal');
      }
      
      const res = await fetch(`/api/journals/${journalId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete journal');
      }
      
      toast({
        title: "Journal deleted",
        description: "The journal entry has been successfully deleted",
        variant: "default",
      });
      
      // Navigate back to the journals list
      router.push('/dashboard/transactions');
    } catch (error) {
      console.error('Error deleting journal:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error state if journal not found
  if (!journal) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center h-[50vh]">
          <h1 className="text-2xl font-bold mb-4">Journal Entry Not Found</h1>
          <p className="text-muted-foreground mb-6">The requested journal entry does not exist or you do not have permission to view it.</p>
          <Button onClick={() => router.push('/dashboard/transactions')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Transactions
          </Button>
        </div>
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
          {journal.is_posted && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Reverse Journal
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reverse Journal Entry</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a new journal entry with reversed debits and credits to offset this entry.
                    The new entry will be created in draft status for you to review before posting.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={reverseJournal}
                    disabled={isReversing}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isReversing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Reversal'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
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
            <CardDescription>View the details of this journal entry.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Journal #</h3>
                <p>{journal.journal_number || journal.id}</p>
              </div>
              
              {journal.reversal_of_journal_id && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Reversal Of</h3>
                  <p className="text-blue-500 hover:text-blue-700 cursor-pointer"
                     onClick={() => router.push(`/dashboard/transactions/${journal.reversal_of_journal_id}`)}>
                    Journal #{journal.reversal_of_journal_id} 
                    <ArrowLeft className="h-3 w-3 inline ml-1" />
                  </p>
                </div>
              )}
              
              {journal.reversed_by_journal_id && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Reversed By</h3>
                  <p className="text-blue-500 hover:text-blue-700 cursor-pointer"
                     onClick={() => router.push(`/dashboard/transactions/${journal.reversed_by_journal_id}`)}>
                    Journal #{journal.reversed_by_journal_id}
                    <ArrowLeft className="h-3 w-3 inline ml-1" />
                  </p>
                </div>
              )}
              
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
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {journal.lines.map((line, index) => (
                      <tr key={line.id || index} className={index % 2 === 0 ? 'bg-gray-50 dark:bg-gray-900' : ''}>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <div>
                            <p className="text-sm font-medium">{line.account_code}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{line.account_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-sm">{line.description || '-'}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-sm">{line.category || '-'}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-sm">{line.location || '-'}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-sm">{line.vendor || '-'}</p>
                        </td>
                        <td className="px-4 py-2">
                          <p className="text-sm">{line.funder || '-'}</p>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <p className="text-sm font-medium">
                            {parseFloat(line.debit) ? `$${parseFloat(line.debit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </p>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <p className="text-sm font-medium">
                            {parseFloat(line.credit) ? `$${parseFloat(line.credit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-200 dark:bg-gray-700">
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right text-sm font-bold">Total</td>
                      <td className="px-4 py-2 text-right text-sm font-bold">
                        ${(journal.total_debits || journal.totals?.debit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-bold">
                        ${(journal.total_credits || journal.totals?.credit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={6} className="px-4 py-2 text-right text-sm font-bold">Balance</td>
                      <td colSpan={2} className={`px-4 py-2 text-right text-sm font-bold ${journal.is_balanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        ${Math.abs(journal.balance || (journal.totals?.debit || 0) - (journal.totals?.credit || 0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {journal.is_balanced ? ' (Balanced)' : ' (Unbalanced)'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* Attachments section */}
        <Card>
          <CardHeader>
            <CardTitle>Attachments</CardTitle>
            <CardDescription>Supporting documents for this transaction.</CardDescription>
          </CardHeader>
          <CardContent>
            {journal.attachments && journal.attachments.length > 0 ? (
              <div className="space-y-3">
                {journal.attachments.map((attachment) => (
                  <div key={attachment.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">{attachment.file_name}</p>
                        <p className="text-xs text-gray-500">
                          {format(new Date(attachment.uploaded_at), 'MMM d, yyyy')} • 
                          {(attachment.file_size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        asChild
                      >
                        <a href={attachment.file_url} target="_blank" rel="noopener noreferrer">
                          View
                        </a>
                      </Button>
                      {!journal.is_posted && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => deleteAttachment(attachment.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No attachments for this transaction.</p>
            )}
            
            {!journal.is_posted && (
              <AttachmentUpload 
                journalId={journal.id} 
                onUploadComplete={() => fetchJournal()} 
              />
            )}
            {journal.is_posted && (
              <p className="text-sm text-muted-foreground mt-2">Cannot add attachments to posted journal entries</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

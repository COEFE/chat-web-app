"use client";

import { format } from "date-fns";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { getAuth } from "firebase/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { JournalPostButton } from "./JournalPostButton";
import { JournalAttachments, JournalAttachment } from "./JournalAttachments";
import { RecurringJournalForm } from "./RecurringJournalForm";
import { useToast } from "@/components/ui/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JournalEntry } from "./JournalTable";

interface JournalViewProps {
  journal: JournalEntry;
  onClose: () => void;
  onEdit?: () => void;
  onPost?: () => void;
}

export function JournalView({ journal, onClose, onEdit, onPost }: JournalViewProps) {
  const [attachments, setAttachments] = useState<JournalAttachment[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [recurringDialogOpen, setRecurringDialogOpen] = useState(false);
  const [isSubmittingRecurring, setIsSubmittingRecurring] = useState(false);
  const { toast } = useToast();

  // Fetch attachments when the component mounts or when an attachment is added/removed
  useEffect(() => {
    fetchAttachments();
  }, [journal.id]);

  // Fetch attachments for the journal entry
  const fetchAttachments = async () => {
    setIsLoadingAttachments(true);
    setAttachmentError(null);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to view attachments");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch(`/api/journals/${journal.id}/attachments`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch attachments");
      }
      
      setAttachments(data.attachments || []);
    } catch (err: any) {
      console.error("Error fetching attachments:", err);
      setAttachmentError(err.message || "An error occurred while fetching attachments");
    } finally {
      setIsLoadingAttachments(false);
    }
  };
  // Format date for display
  const formatDate = (date: string | Date) => {
    if (!date) return "N/A";
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

  // Calculate totals
  const totalDebit = journal.lines?.reduce((sum, line) => sum + (line.debit || 0), 0) || 0;
  const totalCredit = journal.lines?.reduce((sum, line) => sum + (line.credit || 0), 0) || 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Journal Entry #{journal.id}</CardTitle>
            <CardDescription>
              Created by {journal.created_by} on{" "}
              {formatDate(journal.created_at)}
            </CardDescription>
          </div>
          <Badge
            variant={
              journal.is_deleted
                ? "destructive"
                : journal.is_posted
                ? "default"
                : "outline"
            }
          >
            {journal.is_deleted
              ? "Deleted"
              : journal.is_posted
              ? "Posted"
              : "Draft"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Date
            </h4>
            <p>{formatDate(journal.date)}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Memo
            </h4>
            <p>{journal.memo}</p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-1">
              Source
            </h4>
            <p>{journal.source || "—"}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-medium mb-2">Journal Lines</h4>
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journal.lines?.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.account_code && line.account_name
                      ? `${line.account_code} - ${line.account_name}`
                      : `Account #${line.account_id}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.debit > 0 ? formatAmount(line.debit) : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {line.credit > 0 ? formatAmount(line.credit) : ""}
                  </TableCell>
                  <TableCell>{line.description || "—"}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/50 font-medium">
                <TableCell>Totals</TableCell>
                <TableCell className="text-right">
                  {formatAmount(totalDebit)}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(totalCredit)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </div>
          
          <Separator />
          
          <JournalAttachments
            journalId={journal.id}
            attachments={attachments}
            readOnly={journal.is_posted || journal.is_deleted}
            onAttachmentAdded={fetchAttachments}
            onAttachmentRemoved={fetchAttachments}
          />
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {!journal.is_posted && !journal.is_deleted && (
          <>
            {onEdit && <Button onClick={onEdit}>Edit</Button>}
            <JournalPostButton 
              journalId={journal.id} 
              onPostComplete={() => {
                if (onPost) onPost();
              }} 
            />
          </>
        )}
        <Button 
          variant="outline" 
          onClick={() => setRecurringDialogOpen(true)}
        >
          Set Up Recurring
        </Button>
      </CardFooter>

      {/* Recurring Journal Dialog */}
      <Dialog open={recurringDialogOpen} onOpenChange={setRecurringDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Set Up Recurring Journal Entry</DialogTitle>
          </DialogHeader>
          <RecurringJournalForm
            journal={journal}
            onSubmit={async (values) => {
              setIsSubmittingRecurring(true);
              try {
                // Get authorization token
                const auth = getAuth();
                const user = auth.currentUser;
                
                if (!user) {
                  throw new Error("You must be logged in to set up recurring journals");
                }
                
                const token = await user.getIdToken();
                
                const response = await fetch('/api/journals/recurring', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify(values),
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                  throw new Error(data.error || 'Failed to set up recurring journal');
                }
                
                toast({
                  title: 'Success',
                  description: 'Recurring journal entry set up successfully',
                  variant: 'default',
                });
                
                setRecurringDialogOpen(false);
              } catch (err: any) {
                console.error('Error setting up recurring journal:', err);
                toast({
                  title: 'Error',
                  description: err.message || 'An error occurred while setting up the recurring journal',
                  variant: 'destructive',
                });
              } finally {
                setIsSubmittingRecurring(false);
              }
            }}
            onCancel={() => setRecurringDialogOpen(false)}
            isSubmitting={isSubmittingRecurring}
          />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

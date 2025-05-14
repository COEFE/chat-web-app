"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Trash2 } from 'lucide-react';

interface BillRefund {
  id: number;
  bill_id: number;
  refund_date: string;
  amount: number;
  refund_account_id: number;
  refund_method?: string;
  reference_number?: string;
  journal_id?: number;
  reason?: string;
  created_at: string;
  updated_at: string;
  account_name?: string; // From join with accounts table
}

interface BillRefundsTableProps {
  billId: number;
  billNumber?: string;
  refunds: BillRefund[];
  onRefundDeleted?: () => void;
}

export default function BillRefundsTable({
  billId,
  billNumber,
  refunds,
  onRefundDeleted
}: BillRefundsTableProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedRefundId, setSelectedRefundId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleDeleteClick = (refundId: number) => {
    setSelectedRefundId(refundId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedRefundId) return;
    
    setIsDeleting(true);
    
    try {
      // Get the current user and ID token from Firebase
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "No authenticated user found. Please log in again.",
          variant: "destructive",
        });
        setIsDeleting(false);
        setIsDeleteDialogOpen(false);
        return;
      }
      
      // Get the ID token
      const idToken = await user.getIdToken(true);
      
      // Make the API request to delete the refund
      const response = await fetch(`/api/bill-refunds?id=${selectedRefundId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Refund Deleted",
          description: "The refund has been successfully deleted.",
        });
        
        // Call the onRefundDeleted callback if provided
        if (onRefundDeleted) {
          onRefundDeleted();
        }
        
        // Refresh the page to show the updated bill
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to delete refund",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error deleting refund:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (error) {
      return dateString;
    }
  };

  if (refunds.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No refunds have been created for this bill.
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Account</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {refunds.map((refund) => (
            <TableRow key={refund.id}>
              <TableCell>{formatDate(refund.refund_date)}</TableCell>
              <TableCell>{formatCurrency(refund.amount)}</TableCell>
              <TableCell>{refund.account_name || `Account #${refund.refund_account_id}`}</TableCell>
              <TableCell>{refund.refund_method || '-'}</TableCell>
              <TableCell>{refund.reference_number || '-'}</TableCell>
              <TableCell>{refund.reason || '-'}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(refund.id)}
                  title="Delete Refund"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will delete the refund and reverse any associated journal entries.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

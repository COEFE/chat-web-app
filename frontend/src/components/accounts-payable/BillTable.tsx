"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { Pencil, MoreHorizontal, Trash2, FileText, DollarSign, Copy } from "lucide-react";
import { getAuth } from "firebase/auth";

interface Bill {
  id: number;
  vendor_id: number;
  vendor_name: string;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  ap_account_name: string;
  created_at: string;
  updated_at: string;
}

interface BillTableProps {
  bills: Bill[];
  onEdit: (bill: Bill) => void;
  onViewDetails: (billId: number) => void;
}

export function BillTable({ bills, onEdit, onViewDetails }: BillTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Paid':
        return 'success';
      case 'Partially Paid':
        return 'warning';
      case 'Open':
        return 'secondary';
      case 'Draft':
        return 'outline';
      case 'Void':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const handleDeleteClick = (bill: Bill) => {
    setBillToDelete(bill);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!billToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bills/${billToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        // Handle special case for bills with payments
        if (response.status === 409) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Cannot delete this bill because it has associated payments');
        }
        throw new Error(`Error deleting bill: ${response.status}`);
      }
      
      toast({
        title: "Bill Deleted",
        description: `Bill ${billToDelete.bill_number || billToDelete.id} was successfully deleted.`,
      });
      
      // Refresh the bills list
      router.refresh();
    } catch (err: any) {
      console.error("Error deleting bill:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete bill",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setBillToDelete(null);
    }
  };

  const handlePaymentClick = (bill: Bill) => {
    router.push(`/dashboard/accounts-payable/bills/${bill.id}?showPaymentForm=true`);
  };

  const handleDuplicateBill = async (bill: Bill) => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Fetch the bill with its line items
      const response = await fetch(`/api/bills?id=${bill.id}&includeLines=true`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching bill details: ${response.status}`);
      }
      
      const billData = await response.json();
      
      // Prepare the duplicate bill data
      const duplicateBill = {
        bill: {
          vendor_id: billData.vendor_id,
          bill_number: `${billData.bill_number ? billData.bill_number + ' (Copy)' : '(Copy)'}`,
          bill_date: new Date().toISOString().split('T')[0], // Set to today
          due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0], // Set to 30 days from now
          total_amount: billData.total_amount,
          amount_paid: 0, // Reset amount paid
          status: 'Draft', // Set to draft
          terms: billData.terms,
          memo: billData.memo,
          ap_account_id: billData.ap_account_id
        },
        lines: billData.lines.map((line: any) => ({
          expense_account_id: line.expense_account_id,
          description: line.description || '',
          quantity: line.quantity || 1,
          unit_price: line.unit_price || 0,
          amount: (line.quantity || 1) * (line.unit_price || 0)
        }))
      };
      
      // Create the duplicate bill
      const createResponse = await fetch('/api/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(duplicateBill)
      });
      
      if (!createResponse.ok) {
        let errorData;
        const responseText = await createResponse.text();
        
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          errorData = { error: `Non-JSON response: ${responseText}` };
        }
        
        console.error('Bill duplication error:', errorData);
        throw new Error(`Error creating duplicate bill: ${createResponse.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const result = await createResponse.json();
      
      toast({
        title: "Bill Duplicated",
        description: `A copy of the bill has been created as a draft.`,
      });
      
      // Refresh the bills list
      router.refresh();
      
      // Navigate to the new bill for editing
      if (result.bill && result.bill.id) {
        router.push(`/dashboard/accounts-payable/bills/${result.bill.id}`);
      }
    } catch (err: any) {
      console.error("Error duplicating bill:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to duplicate bill",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const calculateRemainingAmount = (bill: Bill) => {
    return bill.total_amount - bill.amount_paid;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vendor</TableHead>
            <TableHead>Bill #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Paid</TableHead>
            <TableHead>Remaining</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <TableRow key={bill.id} className="cursor-pointer" onClick={() => onViewDetails(bill.id)}>
              <TableCell className="font-medium">{bill.vendor_name}</TableCell>
              <TableCell>{bill.bill_number || "-"}</TableCell>
              <TableCell>{format(new Date(bill.bill_date), 'MM/dd/yyyy')}</TableCell>
              <TableCell>{format(new Date(bill.due_date), 'MM/dd/yyyy')}</TableCell>
              <TableCell>{formatCurrency(bill.total_amount)}</TableCell>
              <TableCell>{formatCurrency(bill.amount_paid)}</TableCell>
              <TableCell>{formatCurrency(calculateRemainingAmount(bill))}</TableCell>
              <TableCell>
                <Badge variant={getStatusBadgeVariant(bill.status) as any}>
                  {bill.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onViewDetails(bill.id)}>
                      <FileText className="mr-2 h-4 w-4" />
                      View Details
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(bill)} disabled={bill.status === 'Paid' || bill.status === 'Void'}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDuplicateBill(bill)}>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    {bill.status !== 'Paid' && bill.status !== 'Void' && (
                      <DropdownMenuItem onClick={() => handlePaymentClick(bill)}>
                        <DollarSign className="mr-2 h-4 w-4" />
                        Record Payment
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={() => handleDeleteClick(bill)}
                      disabled={bill.status === 'Paid' || bill.status === 'Partially Paid'}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete bill {billToDelete?.bill_number || billToDelete?.id}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm} 
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

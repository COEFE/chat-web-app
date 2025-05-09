"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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
import { Pencil, MoreHorizontal, Trash2 } from "lucide-react";
import { getAuth } from "firebase/auth";

interface Vendor {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  default_expense_account_id?: number;
  default_expense_account_name?: string;
  created_at: string;
  updated_at: string;
}

interface VendorTableProps {
  vendors: Vendor[];
  onEdit: (vendor: Vendor) => void;
}

export function VendorTable({ vendors, onEdit }: VendorTableProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState<Vendor | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (vendor: Vendor) => {
    setVendorToDelete(vendor);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!vendorToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/vendors/${vendorToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        // Handle special case for vendors with bills
        if (response.status === 409) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Cannot delete this vendor because it has associated bills');
        }
        throw new Error(`Error deleting vendor: ${response.status}`);
      }
      
      toast({
        title: "Vendor Deleted",
        description: `${vendorToDelete.name} was successfully deleted.`,
      });
      
      // Refresh the vendors list
      router.refresh();
    } catch (err: any) {
      console.error("Error deleting vendor:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete vendor",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setVendorToDelete(null);
    }
  };

  const handleViewBills = (vendorId: number) => {
    router.push(`/dashboard/accounts-payable/bills?vendorId=${vendorId}`);
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Contact Person</TableHead>
            <TableHead>Contact Info</TableHead>
            <TableHead>Default Expense Account</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vendors.map((vendor) => (
            <TableRow key={vendor.id}>
              <TableCell className="font-medium">{vendor.name}</TableCell>
              <TableCell>{vendor.contact_person || "-"}</TableCell>
              <TableCell>
                <div className="flex flex-col">
                  {vendor.email && <span>{vendor.email}</span>}
                  {vendor.phone && <span>{vendor.phone}</span>}
                </div>
              </TableCell>
              <TableCell>{vendor.default_expense_account_name || "-"}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Open menu</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onEdit(vendor)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Vendor
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleViewBills(vendor.id)}>
                      View Bills
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="text-red-600"
                      onClick={() => handleDeleteClick(vendor)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Vendor
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
              This will permanently delete the vendor {vendorToDelete?.name}.
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

"use client";

import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Eye, FileText, MoreHorizontal, Plus, Trash2, Copy, DollarSign, Ban, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Invoice {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_number?: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  ar_account_id: number;
  ar_account_name: string;
  created_at: string;
  updated_at: string;
  terms?: string;
  memo_to_customer?: string;
}

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface InvoiceTableProps {
  invoices: Invoice[];
  onView: (id: number) => void;
  onEdit?: (id: number) => void;
  onDelete?: (invoice: Invoice, isVoid?: boolean) => void;
  onDuplicate?: (invoice: Invoice) => void;
  onRecordPayment?: (id: number) => void;
  pagination: PaginationProps;
  onPageChange: (page: number) => void;
}

export function InvoiceTable({ invoices, onView, onEdit, onDelete, onDuplicate, onRecordPayment, pagination, onPageChange }: InvoiceTableProps) {
  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Get status badge color
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'bg-gray-200 text-gray-800';
      case 'Sent':
        return 'bg-blue-200 text-blue-800';
      case 'Partially Paid':
        return 'bg-yellow-200 text-yellow-800';
      case 'Paid':
        return 'bg-green-200 text-green-800';
      case 'Overdue':
        return 'bg-red-200 text-red-800';
      case 'Void':
        return 'bg-gray-200 text-gray-800';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <>
      <div className="rounded-md border mb-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4 text-gray-500">
                  No invoices found
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => {
                const remainingBalance = invoice.total_amount - invoice.amount_paid;
                
                return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.invoice_number || `INV-${invoice.id}`}
                    </TableCell>
                    <TableCell>{invoice.customer_name}</TableCell>
                    <TableCell>
                      {format(new Date(invoice.invoice_date), 'MM/dd/yyyy')}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.due_date), 'MM/dd/yyyy')}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(invoice.total_amount)}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(remainingBalance)}
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusBadgeColor(invoice.status)}>
                        {invoice.status}
                      </Badge>
                    </TableCell>
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
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onView(invoice.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          {onEdit && invoice.status !== 'Paid' && invoice.status !== 'Void' && (
                            <DropdownMenuItem onClick={() => onEdit(invoice.id)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {(invoice.status === 'Sent' || invoice.status === 'Overdue' || invoice.status === 'Partially Paid') && (
                            <DropdownMenuItem 
                              onClick={() => onRecordPayment ? onRecordPayment(invoice.id) : onView(invoice.id)}
                            >
                              <DollarSign className="mr-2 h-4 w-4" />
                              Record Payment
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => onView(invoice.id)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Print/Download
                          </DropdownMenuItem>
                          {onDuplicate && (
                            <DropdownMenuItem onClick={() => onDuplicate(invoice)}>
                              <Copy className="mr-2 h-4 w-4" />
                              Duplicate
                            </DropdownMenuItem>
                          )}
                          {/* For Sent, Overdue, and Partially Paid invoices, show Void option instead of Delete */}
                          {onDelete && (invoice.status === 'Sent' || invoice.status === 'Overdue' || invoice.status === 'Partially Paid') && (
                            <DropdownMenuItem 
                              onClick={() => onDelete(invoice, true)}
                              className="text-orange-600 hover:text-orange-800 hover:bg-orange-100"
                            >
                              <Ban className="mr-2 h-4 w-4" />
                              Void
                            </DropdownMenuItem>
                          )}
                          {/* For Draft invoices, show Delete option */}
                          {onDelete && invoice.status === 'Draft' && (
                            <DropdownMenuItem 
                              onClick={() => onDelete(invoice)}
                              className="text-red-600 hover:text-red-800 hover:bg-red-100"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-500">
            Showing {(pagination.page - 1) * pagination.limit + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} invoices
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

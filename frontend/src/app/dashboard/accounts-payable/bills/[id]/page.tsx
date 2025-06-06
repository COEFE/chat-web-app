"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  ArrowLeft, 
  Edit, 
  Trash2, 
  FileText, 
  DollarSign,
  AlertTriangle,
  Calendar,
  ClipboardCheck,
  Building,
  CreditCard,
  RotateCcw
} from "lucide-react";
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
import { useAuth } from "@/context/AuthContext";
import { getAuth } from "firebase/auth";
import { BillForm } from "@/components/accounts-payable/BillForm";
import { BillPaymentForm } from "@/components/accounts-payable/BillPaymentForm";
import CreateBillRefundButton from "@/components/bills/CreateBillRefundButton";
import BillRefundsTable from "@/components/bills/BillRefundsTable";
import BillAttachments from "@/components/bills/BillAttachments";
import { 
  Bill, 
  BillLine, 
  BillPayment, 
  BillRefund 
} from "@/lib/accounting/billQueries";

export default function BillDetailsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { id } = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [bill, setBill] = useState<Bill | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showEditForm, setShowEditForm] = useState<boolean>(false);
  const [showPaymentForm, setShowPaymentForm] = useState<boolean>(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  
  const [refunds, setRefunds] = useState<BillRefund[]>([]);
  const [refundsLoading, setRefundsLoading] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<{id: number; name: string; code: string}[]>([]);

  // Check if we should show the payment form (from URL parameter)
  useEffect(() => {
    if (searchParams.get('showPaymentForm') === 'true') {
      setShowPaymentForm(true);
    }
  }, [searchParams]);

  // Fetch bill details
  const fetchBill = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bills/${id}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching bill: ${response.status}`);
      }
      
      const data = await response.json();
      setBill(data);
    } catch (err: any) {
      console.error("Error fetching bill:", err);
      setError(err.message || "Failed to fetch bill details");
      toast({
        title: "Error",
        description: err.message || "Failed to fetch bill details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user && id) {
      fetchBill();
      fetchRefunds();
      fetchAccounts();
    }
  }, [user, id]);
  
  // Fetch refunds for this bill
  const fetchRefunds = async () => {
    if (!id) return;
    
    setRefundsLoading(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bills/${id}/refunds`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching refunds: ${response.status}`);
      }
      
      const data = await response.json();
      setRefunds(data.refunds || []);
    } catch (err: any) {
      console.error("Error fetching refunds:", err);
    } finally {
      setRefundsLoading(false);
    }
  };
  
  // Fetch accounts for the refund form
  const fetchAccounts = async () => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching accounts: ${response.status}`);
      }
      
      const data = await response.json();
      setAccounts(data.accounts || []);
    } catch (err: any) {
      console.error("Error fetching accounts:", err);
    }
  };

  const handleBackClick = () => {
    router.push("/dashboard/accounts-payable/bills");
  };

  const handleEditClick = () => {
    setShowEditForm(true);
  };

  const handleAddPaymentClick = () => {
    setShowPaymentForm(true);
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!bill) return;
    
    setIsDeleting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bills/${bill.id}`, {
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
        description: `Bill ${bill.bill_number || bill.id} was successfully deleted.`,
      });
      
      // Navigate back to bills list
      router.push("/dashboard/accounts-payable/bills");
    } catch (err: any) {
      console.error("Error deleting bill:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete bill",
        variant: "destructive",
      });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handleFormClose = (refreshData = false) => {
    setShowEditForm(false);
    setShowPaymentForm(false);
    
    if (refreshData) {
      fetchBill();
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bill-payments?id=${paymentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error deleting payment: ${response.status}`);
      }
      
      toast({
        title: "Payment Deleted",
        description: "Payment was successfully deleted.",
      });
      
      // Refresh bill data
      fetchBill();
    } catch (err: any) {
      console.error("Error deleting payment:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to delete payment",
        variant: "destructive",
      });
    }
  };

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

  const getNumericValue = (value: number | string): number => {
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(numericValue) ? 0 : numericValue;
  };

  const formatCurrency = (amount: number | string) => {
    const numericAmount = getNumericValue(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numericAmount);
  };

  const calculateRemainingAmount = (bill: Bill) => {
    const totalAmount = getNumericValue(bill.total_amount);
    const amountPaid = getNumericValue(bill.paid_amount || 0);

    return totalAmount - amountPaid;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center py-20">
          <Loader2 className="h-10 w-10 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="container mx-auto py-6">
        <Button onClick={handleBackClick} variant="outline" className="mb-6">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Bills
        </Button>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <AlertTriangle className="h-10 w-10 text-red-500 mb-4" />
              <h2 className="text-2xl font-bold mb-2">Bill Not Found</h2>
              <p className="text-muted-foreground">
                {error || "We couldn't find the bill you're looking for."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <Button onClick={handleBackClick} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Bills
        </Button>
        
        <div className="flex space-x-2">
          {bill.status !== 'Paid' && bill.status !== 'Void' && (
            <>
              <Button 
                onClick={handleEditClick}
                disabled={getNumericValue(bill.paid_amount || 0) > 0}
                variant="outline"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              
              <Button
                onClick={handleAddPaymentClick}
                variant="outline"
                className="bg-green-50 hover:bg-green-100 border-green-200"
              >
                <DollarSign className="mr-2 h-4 w-4" />
                Record Payment
              </Button>
            </>
          )}
          
          {bill.status === 'Paid' && (
            <CreateBillRefundButton
              billId={bill.id || 0}
              billNumber={bill.bill_number}
              amountPaid={getNumericValue(bill.paid_amount || 0)}
              onRefundCreated={fetchRefunds}
              accounts={accounts}
            />
          )}
          
          {getNumericValue(bill.paid_amount || 0) === 0 && (
            <Button 
              onClick={handleDeleteClick}
              variant="outline"
              className="bg-red-50 hover:bg-red-100 border-red-200"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          {/* Bill Header Card */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl">
                    {bill.bill_number 
                      ? `Bill #${bill.bill_number}` 
                      : `Bill ID: ${bill.id}`}
                  </CardTitle>
                  <CardDescription>
                    Vendor: {bill.vendor_name || 'Unknown Vendor'}
                  </CardDescription>
                </div>
                <Badge variant={getStatusBadgeVariant(bill.status || 'Unknown') as any} className="text-sm">
                  {bill.status || 'Unknown'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Bill Date</div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    {format(new Date(bill.bill_date), 'MMMM d, yyyy')}
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">Due Date</div>
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                    {bill.due_date ? format(new Date(bill.due_date), 'MMMM d, yyyy') : 'Not specified'}
                  </div>
                </div>
                
                {bill.terms && (
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Terms</div>
                    <div className="flex items-center">
                      <ClipboardCheck className="h-4 w-4 mr-2 text-muted-foreground" />
                      {bill.terms}
                    </div>
                  </div>
                )}
                
                <div className="space-y-1">
                  <div className="text-sm text-muted-foreground">AP Account</div>
                  <div className="flex items-center">
                    <Building className="h-4 w-4 mr-2 text-muted-foreground" />
                    {bill.ap_account_name || 'Not specified'}
                  </div>
                </div>
              </div>
              
              {bill.memo && (
                <div className="mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground mb-1">Memo</div>
                  <p>{bill.memo}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Line Items Card */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2 pl-3">Account</th>
                      <th className="text-left p-2">Description</th>
                      <th className="text-right p-2">Quantity</th>
                      <th className="text-right p-2">Unit Price</th>
                      <th className="text-right p-2 pr-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill.lines && bill.lines.length > 0 ? (
                      bill.lines.map((line: BillLine) => (
                        <tr key={line.id} className="border-t">
                          <td className="p-2 pl-3">{line.expense_account_name || 'N/A'}</td>
                          <td className="p-2">{line.description || "-"}</td>
                          <td className="p-2 text-right">{line.quantity}</td>
                          <td className="p-2 text-right">{formatCurrency(getNumericValue(line.unit_price))}</td>
                          <td className="p-2 pr-3 text-right">{formatCurrency(line.amount || getNumericValue(line.line_total))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-2 text-center">No line items found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-4 flex justify-end">
                <div className="w-64">
                  <div className="flex justify-between py-2">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(bill.total_amount)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-2 font-medium">
                    <span>Total:</span>
                    <span>{formatCurrency(bill.total_amount)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>Amount Paid:</span>
                    <span>{formatCurrency(bill.paid_amount || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between py-2 font-bold">
                    <span>Balance Due:</span>
                    <span>{formatCurrency(calculateRemainingAmount(bill))}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Attachments Card */}
          <Card>
            <CardHeader>
              <CardTitle>Attachments</CardTitle>
              <CardDescription>
                Upload and manage files related to this bill
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BillAttachments billId={bill.id || 0} />
            </CardContent>
          </Card>
        </div>

        {/* Payment History Card */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
              <CardDescription>
                {bill.payments && bill.payments.length > 0 
                  ? `${bill.payments.length} payment(s) recorded` 
                  : "No payments recorded yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bill.payments && bill.payments.length > 0 ? (
                <div className="space-y-4">
                  {bill.payments.map((payment: BillPayment) => (
                    <div key={payment.id} className="border rounded-md p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-medium">
                          {format(new Date(payment.payment_date), 'MMMM d, yyyy')}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-red-500 hover:text-red-700"
                          onClick={() => handleDeletePayment(payment.id || 0)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Amount:</span>{' '}
                          <span className="font-medium">{formatCurrency(payment.amount_paid)}</span>
                        </div>
                        
                        <div>
                          <span className="text-muted-foreground">Method:</span>{' '}
                          <span>{payment.payment_method || "N/A"}</span>
                        </div>
                        
                        <div>
                          <span className="text-muted-foreground">Account:</span>{' '}
                          <span>{payment.payment_account_name}</span>
                        </div>
                        
                        {payment.reference_number && (
                          <div>
                            <span className="text-muted-foreground">Reference:</span>{' '}
                            <span>{payment.reference_number}</span>
                          </div>
                        )}
                      </div>
                      
                      {payment.journal_id && (
                        <div className="mt-2 pt-2 border-t text-sm">
                          <Button
                            variant="link"
                            size="sm"
                            className="h-6 px-0 text-blue-600"
                            onClick={() => router.push(`/dashboard/transactions/${payment.journal_id}`)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View Journal Entry
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {bill.status !== 'Paid' && bill.status !== 'Void' && (
                    <Button 
                      onClick={handleAddPaymentClick}
                      variant="outline"
                      className="w-full"
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Record Another Payment
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p>No payments have been recorded for this bill.</p>
                  
                  {bill.status !== 'Paid' && bill.status !== 'Void' && (
                    <Button 
                      onClick={handleAddPaymentClick}
                      variant="outline"
                      className="mt-4"
                    >
                      <DollarSign className="mr-2 h-4 w-4" />
                      Record a Payment
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Refunds Card - Only show for paid bills with refunds or if refunds exist */}
          {(bill.status === 'Paid' || refunds.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Refund History</CardTitle>
                <CardDescription>
                  {refunds.length > 0 
                    ? `${refunds.length} refund(s) recorded` 
                    : "No refunds recorded yet"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {refundsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <BillRefundsTable
                    billId={bill.id || 0}
                    billNumber={bill.bill_number}
                    refunds={refunds}
                    onRefundDeleted={fetchRefunds}
                  />
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Bill Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Bill Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <div className="text-sm text-muted-foreground">Created</div>
                  <div>{bill.created_at ? format(new Date(bill.created_at), 'MMM d, yyyy h:mm a') : 'Not specified'}</div>
                </div>
                
                <div>
                  <div className="text-sm text-muted-foreground">Last Updated</div>
                  <div>{bill.updated_at ? format(new Date(bill.updated_at), 'MMM d, yyyy h:mm a') : 'Not specified'}</div>
                </div>
                
                <div>
                  <div className="text-sm text-muted-foreground">Bill ID</div>
                  <div>{bill.id}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Bill Form Dialog */}
      {showEditForm && (
        <BillForm
          bill={bill}
          onClose={handleFormClose}
        />
      )}

      {/* Add Payment Form Dialog */}
      {showPaymentForm && (
        <BillPaymentForm
          bill={bill}
          onClose={handleFormClose}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete bill {bill.bill_number || bill.id}.
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
    </div>
  );
}

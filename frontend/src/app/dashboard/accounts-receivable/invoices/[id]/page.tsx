"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Loader2, 
  Edit, 
  ArrowLeft, 
  Printer,
  FileDown,
  DollarSign,
  X,
  AlertCircle
} from "lucide-react";
import { getAuth } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";
import { InvoicePaymentForm } from "@/components/accounts-receivable/InvoicePaymentForm";

interface Customer {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
}

interface InvoiceLine {
  id: number;
  revenue_account_id: number;
  revenue_account_name: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
}

interface InvoicePayment {
  id: number;
  payment_date: string;
  amount_received: number;
  deposit_to_account_id: number;
  deposit_account_name: string;
  payment_method?: string;
  reference_number?: string;
  journal_id?: number;
  created_at: string;
}

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
  terms?: string;
  memo_to_customer?: string;
  ar_account_id: number;
  ar_account_name: string;
  created_at: string;
  updated_at: string;
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params?.id ? parseInt(params.id as string) : 0;
  const { toast } = useToast();
  
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [payments, setPayments] = useState<InvoicePayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);

  const fetchInvoice = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Use a cache-busting query parameter with the current timestamp
      const timestamp = new Date().getTime();
      const response = await fetch(`/api/invoices/${invoiceId}?_nocache=${timestamp}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Error fetching invoice: ${response.status}`);
      }

      const data = await response.json();
      setInvoice(data.invoice);
      setLines(data.lines);
      setPayments(data.payments);
      
      // Fetch customer details
      if (data.invoice?.customer_id) {
        const customerTimestamp = new Date().getTime();
        const customerResponse = await fetch(`/api/customers/${data.invoice.customer_id}?_=${customerTimestamp}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          setCustomer(customerData.customer);
        }
      }
    } catch (err: any) {
      console.error("Error fetching invoice:", err);
      setError(err.message || "Failed to fetch invoice");
      toast({
        title: "Error",
        description: err.message || "Failed to fetch invoice",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackClick = () => {
    router.push('/dashboard/accounts-receivable/invoices');
  };

  const handleEditClick = () => {
    // Navigate to /dashboard/accounts-receivable/invoices with query param for editing
    if (invoice && invoice.id) {
      router.push(`/dashboard/accounts-receivable/invoices?edit=${invoice.id}`);
    } else {
      toast({
        title: "Error",
        description: "Cannot edit invoice: Invoice details are missing",
        variant: "destructive",
      });
    }
  };

  const handleRecordPayment = () => {
    setShowPaymentForm(true);
  };

  const handlePaymentFormClose = (refreshData = false) => {
    setShowPaymentForm(false);
    if (refreshData) {
      fetchInvoice();
    }
  };

  const handlePrintClick = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MM/dd/yyyy');
  };

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

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mb-6">
          <AlertCircle className="text-red-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-medium">Error loading invoice</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
        <Button onClick={handleBackClick} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="container mx-auto py-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start mb-6">
          <AlertCircle className="text-yellow-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="text-yellow-800 font-medium">Invoice Not Found</h3>
            <p className="text-yellow-700 text-sm">The requested invoice could not be found.</p>
          </div>
        </div>
        <Button onClick={handleBackClick} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
      </div>
    );
  }

  const remainingBalance = invoice.total_amount - invoice.amount_paid;
  const canRecordPayment = ['Sent', 'Partially Paid', 'Overdue'].includes(invoice.status) && remainingBalance > 0;

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4 print:hidden">
        <Button onClick={handleBackClick} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Invoices
        </Button>
        <div className="flex gap-2">
          {canRecordPayment && (
            <Button onClick={handleRecordPayment}>
              <DollarSign className="mr-2 h-4 w-4" />
              Record Payment
            </Button>
          )}
          <Button onClick={handlePrintClick} variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          {invoice.status !== 'Paid' && invoice.status !== 'Void' && (
            <Button onClick={handleEditClick} variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Details */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-2xl">Invoice #{invoice.invoice_number}</CardTitle>
                <CardDescription>
                  Created {formatDate(invoice.created_at)}
                </CardDescription>
              </div>
              <Badge className={getStatusBadgeColor(invoice.status)}>
                {invoice.status}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Invoice Date</h3>
                  <p>{formatDate(invoice.invoice_date)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Due Date</h3>
                  <p>{formatDate(invoice.due_date)}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">AR Account</h3>
                  <p>{invoice.ar_account_name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Terms</h3>
                  <p>{invoice.terms || 'N/A'}</p>
                </div>
              </div>

              {invoice.memo_to_customer && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Memo to Customer</h3>
                  <p className="mt-1 whitespace-pre-wrap">{invoice.memo_to_customer}</p>
                </div>
              )}

              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Description</TableHead>
                      <TableHead>Revenue Account</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id}>
                        <TableCell>{line.description}</TableCell>
                        <TableCell>{line.revenue_account_name}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unit_price)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end space-x-4 text-right">
                <div>
                  <div className="mb-2">
                    <span className="font-medium">Subtotal:</span>
                    <span className="block">{formatCurrency(invoice.total_amount)}</span>
                  </div>
                  <div className="mb-2">
                    <span className="font-medium">Amount Paid:</span>
                    <span className="block">{formatCurrency(invoice.amount_paid)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Balance Due:</span>
                    <span className="block font-bold text-xl">
                      {formatCurrency(remainingBalance)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment History */}
          {payments.length > 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Payment History</CardTitle>
                <CardDescription>
                  Record of all payments received for this invoice
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Payment Method</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Deposit Account</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell>{formatCurrency(payment.amount_received)}</TableCell>
                          <TableCell>{payment.payment_method || 'N/A'}</TableCell>
                          <TableCell>{payment.reference_number || 'N/A'}</TableCell>
                          <TableCell>{payment.deposit_account_name}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Customer Details */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">{customer?.name || invoice.customer_name}</h3>
                {customer?.contact_person && (
                  <p className="text-sm text-gray-500">{customer.contact_person}</p>
                )}
              </div>

              {(customer?.email || customer?.phone) && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    {customer.email && (
                      <p className="text-sm">
                        <span className="font-medium">Email:</span> {customer.email}
                      </p>
                    )}
                    {customer.phone && (
                      <p className="text-sm">
                        <span className="font-medium">Phone:</span> {customer.phone}
                      </p>
                    )}
                  </div>
                </>
              )}

              {customer?.billing_address && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium">Billing Address</h4>
                    <p className="whitespace-pre-wrap text-sm mt-1">{customer.billing_address}</p>
                  </div>
                </>
              )}

              {customer?.shipping_address && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium">Shipping Address</h4>
                    <p className="whitespace-pre-wrap text-sm mt-1">{customer.shipping_address}</p>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter className="print:hidden">
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => router.push(`/dashboard/accounts-receivable/customers`)}
              >
                View Customer Details
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      
      {showPaymentForm && (
        <InvoicePaymentForm
          invoice={invoice}
          onClose={handlePaymentFormClose}
        />
      )}
    </div>
  );
}

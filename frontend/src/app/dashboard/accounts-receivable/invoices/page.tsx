"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Plus, 
  RefreshCw, 
  Filter,
  Search,
  Calendar as CalendarIcon
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { InvoiceTable } from "@/components/accounts-receivable/InvoiceTable";
import { InvoiceForm } from "@/components/accounts-receivable/InvoiceForm";
import { InvoicePaymentForm } from "@/components/accounts-receivable/InvoicePaymentForm";
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

interface Customer {
  id: number;
  name: string;
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
  lines?: any[]; // Added to support duplicated invoices with attached line items
  updated_at: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  
  const [showAddInvoiceForm, setShowAddInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  
  // Delete invoice state
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });
  
  // Fetch filter options (customers and statuses)
  const fetchFilterOptions = async () => {
    try {
      console.log('[Invoices] Fetching filter options...');
      const auth = getAuth();
      if (!auth.currentUser) {
        console.error('[Invoices] User not authenticated when fetching filters');
        return;
      }
      
      const idToken = await auth.currentUser.getIdToken();
      
      // Fetch customers
      const customersResponse = await fetch(`/api/customers`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!customersResponse.ok) {
        throw new Error(`Error fetching customers: ${customersResponse.status}`);
      }
      
      const customersData = await customersResponse.json();
      setCustomers(customersData.customers);
      
      // Fetch statuses
      const statusesResponse = await fetch(`/api/invoices?statuses=true`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!statusesResponse.ok) {
        throw new Error(`Error fetching statuses: ${statusesResponse.status}`);
      }
      
      const statusesData = await statusesResponse.json();
      setStatuses(statusesData);
    } catch (err: any) {
      console.error("Error fetching filter options:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to load filter options",
        variant: "destructive",
      });
    }
  };
  
  // Fetch invoices with filters
  const fetchInvoices = async (page = 1) => {
    setIsLoading(true);
    setError(null);
    console.log(`[Invoices] Fetching invoices page ${page}...`);

    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        console.error('[Invoices] User not authenticated');
        setError('You must be logged in to view invoices');
        setIsLoading(false);
        return;
      }
      
      const idToken = await auth.currentUser.getIdToken();
      console.log('[Invoices] Successfully obtained auth token');
      
      // Add cache-busting timestamp to prevent caching
      // Use a more unique timestamp with milliseconds and a random component
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      let url = `/api/invoices?page=${page}&limit=${pagination.limit}&_=${cacheBuster}`;
      
      if (customerFilter && customerFilter !== 'all') {
        url += `&customerId=${customerFilter}`;
      }
      
      if (statusFilter && statusFilter !== 'all') {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }
      
      if (startDateFilter) {
        url += `&startDate=${format(startDateFilter, 'yyyy-MM-dd')}`;
      }
      
      if (endDateFilter) {
        url += `&endDate=${format(endDateFilter, 'yyyy-MM-dd')}`;
      }
      
      console.log(`[Invoices] Fetching from URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        // Add cache: 'no-store' option to ensure we're not using any cached data
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching invoices: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('[Invoices] Received data:', data);
      
      // Ensure we have invoices array and pagination data
      if (data.invoices) {
        // Double-check to filter out any deleted invoices that might have slipped through
        const filteredInvoices = data.invoices.filter((invoice: any) => !invoice.is_deleted);
        
        // Log if we found any deleted invoices that shouldn't be here
        if (filteredInvoices.length !== data.invoices.length) {
          console.warn(`[Invoices] Filtered out ${data.invoices.length - filteredInvoices.length} deleted invoices that were returned from API`);
        }
        
        console.log(`[Invoices] Setting ${filteredInvoices.length} invoices in state`);
        setInvoices(filteredInvoices);
      } else {
        console.error('[Invoices] No invoices data in response:', data);
        setInvoices([]);
      }
      
      setPagination({
        page: data.pagination?.page || 1,
        limit: data.pagination?.limit || 10,
        total: data.pagination?.total || 0,
        totalPages: data.pagination?.totalPages || 0
      });
    } catch (err: any) {
      console.error("Error fetching invoices:", err);
      setError(err.message || "Failed to fetch invoices");
      toast({
        title: "Error",
        description: err.message || "Failed to fetch invoices",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Check for edit parameter in URL
  useEffect(() => {
    const editId = searchParams.get('edit');
    
    if (editId) {
      const fetchInvoiceForEdit = async () => {
        try {
          const auth = getAuth();
          const idToken = await auth.currentUser?.getIdToken();
          
          // Use a more robust cache busting parameter
          const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
          const response = await fetch(`/api/invoices/${editId}?_=${cacheBuster}`, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            cache: 'no-store' // Add fetch cache option
          });
          
          if (!response.ok) {
            throw new Error(`Error fetching invoice: ${response.status}`);
          }
          
          const data = await response.json();
          setEditingInvoice(data.invoice);
          setShowAddInvoiceForm(true);
        } catch (err: any) {
          console.error("Error fetching invoice for edit:", err);
          toast({
            title: "Error",
            description: err.message || "Failed to load invoice for editing",
            variant: "destructive",
          });
        }
      };
      
      const auth = getAuth();
      if (auth.currentUser) {
        fetchInvoiceForEdit();
      }
    }
  }, [searchParams, toast]);

  // Initialize auth listener for the entire component
  useEffect(() => {
    const auth = getAuth();
    console.log('[Invoices] Setting up auth listener');
    
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log('[Invoices] Auth state changed:', user ? 'Logged in' : 'Not logged in');
      if (user) {
        // Fetch data once authenticated
        fetchFilterOptions();
        fetchInvoices(1);
      }
    });
    
    return () => {
      unsubscribe(); // Clean up listener on unmount
    };
  }, []);

  // Handle page changes
  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser && pagination.page > 0) {
      console.log(`[Invoices] Page changed to ${pagination.page}, fetching...`);
      fetchInvoices(pagination.page);
    }
  }, [pagination.page]);

  const handleAddInvoice = () => {
    setEditingInvoice(null);
    setIsViewOnly(false); // Ensure view-only mode is off when adding new invoice
    setShowAddInvoiceForm(true);
  };

  const handleEditInvoice = async (id: number) => {
    // Fetch the latest invoice data to ensure we have the most up-to-date information
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Use cache busting to ensure fresh data
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const response = await fetch(`/api/invoices/${id}?_=${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching invoice: ${response.status}`);
      }
      
      const data = await response.json();
      setEditingInvoice(data.invoice);
      setIsViewOnly(false); // Explicitly set to edit mode
      setShowAddInvoiceForm(true);
    } catch (err: any) {
      console.error("Error fetching invoice details:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to load invoice for editing",
        variant: "destructive",
      });
    }
  };

  const handleViewInvoice = (id: number) => {
    // Find the invoice by id
    const invoice = invoices.find(inv => inv.id === id);
    if (invoice) {
      // Use view-only mode by setting a viewMode flag
      setEditingInvoice(invoice);
      setIsViewOnly(true); // Add this state to track view-only mode
      setShowAddInvoiceForm(true);
    }
  };
  
  // Handler for recording payments on an invoice
  const handleRecordPayment = (id: number) => {
    // Find the invoice by id
    const invoice = invoices.find(inv => inv.id === id);
    if (invoice) {
      setEditingInvoice(invoice);
      setShowPaymentForm(true); // Show the payment form directly
      setShowAddInvoiceForm(false); // Hide the invoice form if it's open
    }
  };
  
  // Handle duplicate invoice functionality
  const handleDuplicateInvoice = async (invoice: Invoice) => {
    try {
      // Fetch the full invoice with line items to ensure we get everything
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Add cache busting to ensure fresh data
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      const response = await fetch(`/api/invoices/${invoice.id}?_=${cacheBuster}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching invoice: ${response.status}`);
      }
      
      const data = await response.json();
      const invoiceWithLines = data.invoice;
      const lines = data.lines || [];
      
      // Create a duplicate invoice by modifying the original one
      const duplicatedInvoice = {
        ...invoiceWithLines,
        id: 0, // Reset ID so a new one will be generated
        invoice_number: "", // Reset invoice number so a new one will be generated
        invoice_date: new Date().toISOString().split('T')[0], // Set to today's date
        due_date: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString().split('T')[0], // Due in 30 days
        status: "Draft", // Always start as draft
        amount_paid: 0, // Reset amount paid
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Keep customer, terms, AR account, etc.
        journal_id: null, // Reset journal ID so new one will be created
        // Make sure invoice is not deleted
        is_deleted: false,
        deleted_at: null
      };
      
      // Duplicate the line items too
      const duplicatedLines = lines.map((line: any) => ({
        ...line,
        id: 0, // Reset ID so a new one will be generated when the invoice is created
      }));
      
      console.log("[Invoices] Duplicating invoice:", invoice.id, "with", duplicatedLines.length, "line items");
      
      // Set the duplicated invoice and lines as the editing data
      setEditingInvoice({
        ...duplicatedInvoice,
        lines: duplicatedLines // Attach lines to invoice data for the form
      });
      
      setIsViewOnly(false); // Make sure we're in edit mode
      setShowAddInvoiceForm(true); // Show the form
      
      toast({
        title: "Invoice Duplicated",
        description: `Invoice #${invoice.invoice_number} has been duplicated with ${duplicatedLines.length} line items. Please review and save the new invoice.`,
      });
    } catch (err: any) {
      console.error("Error duplicating invoice:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to duplicate invoice",
        variant: "destructive",
      });
    }
  };

  // State to track if we're deleting or voiding an invoice
  const [isVoidingInvoice, setIsVoidingInvoice] = useState<boolean>(false);

  // Handle invoice deletion or voiding
  const handleDeleteInvoice = (invoice: Invoice, isVoid: boolean = false) => {
    setInvoiceToDelete(invoice);
    setIsVoidingInvoice(isVoid);
  };

  // Confirm and process invoice deletion or voiding
  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    
    setIsDeleting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Use cache-busting parameter
      const cacheBuster = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      
      let endpoint, method, successMessage;
      let invoiceData = invoiceToDelete;
      let invoiceLines = [];
      
      // If we're voiding, we need to fetch the full invoice with line items
      if (isVoidingInvoice) {
        try {
          console.log(`[Invoices] Fetching full invoice details for voiding invoice ${invoiceToDelete.id}`);
          const fetchResponse = await fetch(`/api/invoices/${invoiceToDelete.id}?_=${cacheBuster}`, {
            headers: {
              'Authorization': `Bearer ${idToken}`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            },
            cache: 'no-store'
          });
          
          if (fetchResponse.ok) {
            const fetchData = await fetchResponse.json();
            invoiceData = fetchData.invoice;
            invoiceLines = fetchData.lines || [];
            console.log(`[Invoices] Successfully fetched invoice details with ${invoiceLines.length} line items`);
          } else {
            console.error(`[Invoices] Failed to fetch invoice details for voiding`);
            throw new Error('Failed to fetch invoice details for voiding');
          }
        } catch (fetchErr) {
          console.error(`[Invoices] Error fetching invoice details:`, fetchErr);
          throw fetchErr;
        }
        
        // Void the invoice by updating its status to Void
        endpoint = `/api/invoices/${invoiceToDelete.id}?_=${cacheBuster}`;
        method = 'PUT';
        successMessage = `Invoice ${invoiceToDelete.invoice_number || `#${invoiceToDelete.id}`} has been voided successfully.`;
      } else {
        // Delete the draft invoice
        endpoint = `/api/invoices/${invoiceToDelete.id}?_=${cacheBuster}`;
        method = 'DELETE';
        successMessage = `Invoice ${invoiceToDelete.invoice_number || `#${invoiceToDelete.id}`} has been deleted successfully.`;
      }
      
      const response = await fetch(endpoint, {
        method: method,
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: isVoidingInvoice ? JSON.stringify({
          invoice: {
            // Include all required fields from the full invoice
            ...invoiceData,
            // And update the status to Void
            status: 'Void'
          },
          // Include the line items we fetched
          lines: invoiceLines
        }) : undefined,
        cache: 'no-store'
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${isVoidingInvoice ? 'void' : 'delete'} invoice`);
      }
      
      toast({
        title: isVoidingInvoice ? 'Invoice Voided' : 'Invoice Deleted',
        description: successMessage,
      });
      
      // Update or remove the invoice from the local state immediately
      if (isVoidingInvoice) {
        // Update the status of the voided invoice
        setInvoices(currentInvoices => 
          currentInvoices.map(inv => 
            inv.id === invoiceToDelete.id 
              ? { ...inv, status: 'Void' } 
              : inv
          )
        );
      } else {
        // Remove the deleted invoice
        setInvoices(currentInvoices => 
          currentInvoices.filter(inv => inv.id !== invoiceToDelete.id)
        );
      }
      
      // Also refresh from the server to ensure data consistency
      // Use a small delay to ensure the operation has fully completed
      setTimeout(() => {
        console.log(`[Invoices] Fetching fresh data after ${isVoidingInvoice ? 'voiding' : 'deletion'}...`);
        fetchInvoices(pagination.page);
      }, 500);
    } catch (err: any) {
      console.error(`Error ${isVoidingInvoice ? 'voiding' : 'deleting'} invoice:`, err);
      toast({
        title: 'Error',
        description: err.message || `An error occurred while ${isVoidingInvoice ? 'voiding' : 'deleting'} the invoice.`,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setInvoiceToDelete(null);
      setIsVoidingInvoice(false);
    }
  };

  // Cancel invoice deletion
  const cancelDeleteInvoice = () => {
    setInvoiceToDelete(null);
  };

  const handleInvoiceFormClose = (refreshData = false) => {
    setShowAddInvoiceForm(false);
    setEditingInvoice(null);
    setIsViewOnly(false); // Reset view-only mode when closing the form
    
    if (refreshData) {
      console.log('[Invoices] Refreshing data after form close...');
      fetchInvoices(pagination.page);
    }
  };
  
  // Handler for closing the payment form
  const handlePaymentFormClose = (refreshData = false) => {
    setShowPaymentForm(false);
    setEditingInvoice(null);
    
    if (refreshData) {
      console.log('[Invoices] Refreshing data after payment recorded...');
      fetchInvoices(pagination.page);
    }
  };

  const handleApplyFilters = () => {
    // Reset to first page when applying filters
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchInvoices(1);
  };

  const handleResetFilters = () => {
    setCustomerFilter("all");
    setStatusFilter("all");
    setStartDateFilter(undefined);
    setEndDateFilter(undefined);
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchInvoices(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Accounts Receivable</CardTitle>
          <CardDescription>Manage and track your customer invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between mb-4">
            <Tabs defaultValue="invoices" className="w-full">
              <TabsList>
                <TabsTrigger 
                  value="invoices" 
                  onClick={() => router.push('/dashboard/accounts-receivable/invoices')}
                >Invoices</TabsTrigger>
                <TabsTrigger 
                  value="aging" 
                  onClick={() => router.push('/dashboard/accounts-receivable/aging')}
                >Aging Report</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={handleAddInvoice}>
              <Plus className="mr-2 h-4 w-4" />
              Add Invoice
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Filter invoices by customer, status, or date range</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Customer</label>
                  <Select value={customerFilter} onValueChange={setCustomerFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Customers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Customers</SelectItem>
                      {customers.map(customer => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statuses.map(status => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Start Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDateFilter ? format(startDateFilter, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={startDateFilter}
                        onSelect={setStartDateFilter}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">End Date</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDateFilter ? format(endDateFilter, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={endDateFilter}
                        onSelect={setEndDateFilter}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              
              <div className="flex justify-end mt-4 space-x-2">
                <Button variant="outline" onClick={handleResetFilters}>
                  Reset
                </Button>
                <Button onClick={handleApplyFilters}>
                  <Filter className="mr-2 h-4 w-4" />
                  Apply Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">Loading invoices...</span>
              </div>
            ) : error ? (
              <div className="flex flex-col justify-center items-center h-64">
                <p className="text-red-500 mb-2">{error}</p>
                <Button onClick={() => fetchInvoices(pagination.page)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </div>
            ) : invoices.length === 0 ? (
              <div className="flex flex-col justify-center items-center h-64">
                <p className="mb-2">No invoices found.</p>
                <Button onClick={handleAddInvoice}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Invoice
                </Button>
              </div>
            ) : (
              <InvoiceTable 
                invoices={invoices} 
                onView={handleViewInvoice}
                onEdit={handleEditInvoice}
                onDelete={handleDeleteInvoice}
                onDuplicate={handleDuplicateInvoice}
                onRecordPayment={handleRecordPayment}
                pagination={pagination}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {showAddInvoiceForm && (
        <InvoiceForm 
          invoice={editingInvoice} 
          onClose={handleInvoiceFormClose}
          viewOnly={isViewOnly}
        />
      )}

      {/* Invoice Payment Form */}
      {showPaymentForm && editingInvoice && (
        <InvoicePaymentForm
          invoice={editingInvoice}
          onClose={handlePaymentFormClose}
        />
      )}

      {/* Delete/Void Confirmation Dialog */}
      <AlertDialog open={invoiceToDelete !== null} onOpenChange={(open) => !open && cancelDeleteInvoice()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isVoidingInvoice 
                ? 'Are you sure you want to void this invoice?' 
                : 'Are you sure you want to delete this invoice?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {invoiceToDelete && (
                <>
                  {isVoidingInvoice ? (
                    <>
                      You are about to void invoice {invoiceToDelete.invoice_number || `#${invoiceToDelete.id}`} for {invoiceToDelete.customer_name}.
                      <br /><br />
                      Voiding will mark the invoice as void in the system. The invoice will still be visible in reports,
                      but will be excluded from accounts receivable totals. Any journal entries associated with this invoice
                      will be reversed.
                      <br /><br />
                      This action cannot be undone.
                    </>
                  ) : (
                    <>
                      You are about to delete invoice {invoiceToDelete.invoice_number || `#${invoiceToDelete.id}`} for {invoiceToDelete.customer_name}.
                      <br /><br />
                      This action cannot be undone. This will permanently delete the invoice and remove it from our servers.
                      Draft invoices can be deleted but sent invoices can only be voided.
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteInvoice}
              disabled={isDeleting}
              className={isVoidingInvoice 
                ? "bg-orange-600 hover:bg-orange-700 focus:ring-orange-600" 
                : "bg-red-600 hover:bg-red-700 focus:ring-red-600"}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isVoidingInvoice ? 'Voiding...' : 'Deleting...'}
                </>
              ) : (
                isVoidingInvoice ? 'Void Invoice' : 'Delete Invoice'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

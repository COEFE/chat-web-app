"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  updated_at: string;
}

export default function InvoicesPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter states
  const [customerFilter, setCustomerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  
  const [showAddInvoiceForm, setShowAddInvoiceForm] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  // Fetch filter options (customers and statuses)
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Fetch customers
        const customersResponse = await fetch(`/api/customers`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
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
            'Authorization': `Bearer ${idToken}`
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

    const auth = getAuth();
    if (auth.currentUser) {
      fetchFilterOptions();
    }
  }, [toast]);

  // Fetch invoices with filters
  const fetchInvoices = async (page = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      let url = `/api/invoices?page=${page}&limit=${pagination.limit}`;
      
      if (customerFilter) {
        url += `&customerId=${customerFilter}`;
      }
      
      if (statusFilter) {
        url += `&status=${encodeURIComponent(statusFilter)}`;
      }
      
      if (startDateFilter) {
        url += `&startDate=${format(startDateFilter, 'yyyy-MM-dd')}`;
      }
      
      if (endDateFilter) {
        url += `&endDate=${format(endDateFilter, 'yyyy-MM-dd')}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching invoices: ${response.status}`);
      }
      
      const data = await response.json();
      setInvoices(data.invoices);
      setPagination({
        page: data.pagination.page,
        limit: data.pagination.limit,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
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

  useEffect(() => {
    const auth = getAuth();
    if (auth.currentUser) {
      fetchInvoices(pagination.page);
    }
  }, [pagination.page]);

  const handleAddInvoice = () => {
    setEditingInvoice(null);
    setShowAddInvoiceForm(true);
  };

  const handleEditInvoice = (invoice: Invoice) => {
    setEditingInvoice(invoice);
    setShowAddInvoiceForm(true);
  };

  const handleInvoiceFormClose = (refreshData = false) => {
    setShowAddInvoiceForm(false);
    setEditingInvoice(null);
    
    if (refreshData) {
      fetchInvoices(pagination.page);
    }
  };

  const handleApplyFilters = () => {
    // Reset to first page when applying filters
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchInvoices(1);
  };

  const handleResetFilters = () => {
    setCustomerFilter("");
    setStatusFilter("");
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

  const handleViewInvoice = (invoiceId: number) => {
    router.push(`/dashboard/accounts-receivable/invoices/${invoiceId}`);
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Receivable</h1>
      </div>
      
      <Tabs defaultValue="invoices" className="mb-6">
        <TabsList>
          <TabsTrigger value="customers" onClick={() => router.push('/dashboard/accounts-receivable/customers')}>Customers</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="aging-report" onClick={() => router.push('/dashboard/accounts-receivable/aging-report')}>Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Invoices</h2>
        <Button onClick={handleAddInvoice}>
          <Plus className="mr-2 h-4 w-4" />
          Add Invoice
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter invoices by customer, status, or date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Customer</label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Customers</SelectItem>
                  {customers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.id.toString()}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium">Start Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    {startDateFilter ? (
                      format(startDateFilter, "MM/dd/yyyy")
                    ) : (
                      <span className="text-muted-foreground">Pick a date</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDateFilter}
                    onSelect={setStartDateFilter}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div>
              <label className="text-sm font-medium">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    {endDateFilter ? (
                      format(endDateFilter, "MM/dd/yyyy")
                    ) : (
                      <span className="text-muted-foreground">Pick a date</span>
                    )}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
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
              Reset Filters
            </Button>
            <Button onClick={handleApplyFilters}>
              <Filter className="mr-2 h-4 w-4" />
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {isLoading ? (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mb-6">
          <div>
            <h3 className="text-red-800 font-medium">Error loading invoices</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      ) : (
        <InvoiceTable 
          invoices={invoices} 
          onEdit={handleEditInvoice}
          onView={handleViewInvoice}
          pagination={pagination}
          onPageChange={handlePageChange}
        />
      )}
      
      {showAddInvoiceForm && (
        <InvoiceForm 
          invoice={editingInvoice} 
          onClose={handleInvoiceFormClose} 
        />
      )}
    </div>
  );
}

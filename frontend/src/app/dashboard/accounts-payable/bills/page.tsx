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
  AlertCircle,
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
import { useAuth } from "@/context/AuthContext";
import { getAuth } from "firebase/auth";
import { AccountingNav } from "@/components/dashboard/AccountingNav";
import { BillTable } from "@/components/accounts-payable/BillTable";
import { BillForm } from "@/components/accounts-payable/BillForm";

interface Vendor {
  id: number;
  name: string;
}

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

export default function BillsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [vendorFilter, setVendorFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  
  const [showAddBillForm, setShowAddBillForm] = useState<boolean>(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Initialize filters from URL params
  useEffect(() => {
    const vendorId = searchParams.get('vendorId');
    if (vendorId) {
      setVendorFilter(vendorId);
    }
  }, [searchParams]);

  // Fetch filter options (vendors and statuses)
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Fetch vendors
        const vendorsResponse = await fetch(`/api/vendors`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!vendorsResponse.ok) {
          throw new Error(`Error fetching vendors: ${vendorsResponse.status}`);
        }
        
        const vendorsData = await vendorsResponse.json();
        setVendors(vendorsData.vendors);
        
        // Fetch statuses
        const statusesResponse = await fetch(`/api/bills?statuses=true`, {
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

    if (user) {
      fetchFilterOptions();
    }
  }, [user, toast]);

  // Fetch bills with filters
  const fetchBills = async (page = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      let url = `/api/bills?page=${page}&limit=${pagination.limit}`;
      
      if (vendorFilter) {
        url += `&vendorId=${vendorFilter}`;
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
        throw new Error(`Error fetching bills: ${response.status}`);
      }
      
      const data = await response.json();
      setBills(data.bills);
      setPagination({
        page: data.pagination.page,
        limit: data.pagination.limit,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
      });
    } catch (err: any) {
      console.error("Error fetching bills:", err);
      setError(err.message || "Failed to fetch bills");
      toast({
        title: "Error",
        description: err.message || "Failed to fetch bills",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBills(pagination.page);
    }
  }, [user, pagination.page, vendorFilter]);

  const handleApplyFilters = () => {
    // Reset to first page when applying filters
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchBills(1);
  };

  const handleResetFilters = () => {
    setVendorFilter("");
    setStatusFilter("");
    setStartDateFilter(undefined);
    setEndDateFilter(undefined);
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchBills(1);
  };

  const handleAddBill = () => {
    setEditingBill(null);
    setShowAddBillForm(true);
  };

  const handleEditBill = async (bill: Bill) => {
    console.log('Editing bill initial data:', JSON.stringify(bill, null, 2));
    
    // Fetch the complete bill data with lines directly
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bills/${bill.id}?includeLines=true`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (response.ok) {
        const fullBill = await response.json();
        console.log('Full bill data from API:', JSON.stringify(fullBill, null, 2));
        setEditingBill(fullBill);
      } else {
        console.error('Failed to fetch full bill data');
        // Fall back to using the bill data we already have
        setEditingBill(bill);
      }
    } catch (error) {
      console.error('Error fetching bill details:', error);
      setEditingBill(bill);
    }
    
    setShowAddBillForm(true);
  };

  const handleBillFormClose = (refreshData = false) => {
    setShowAddBillForm(false);
    setEditingBill(null);
    
    if (refreshData) {
      fetchBills(pagination.page);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleViewBill = (billId: number) => {
    router.push(`/dashboard/accounts-payable/bills/${billId}`);
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Payable</h1>
      </div>
      
      <Tabs defaultValue="bills" className="mb-6">
        <TabsList>
          <TabsTrigger value="vendors" onClick={() => router.push('/dashboard/accounts-payable/vendors')}>Vendors</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="aging-report" onClick={() => router.push('/dashboard/accounts-payable/aging-report')}>Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Bills</h2>
        <Button onClick={handleAddBill}>
          <Plus className="mr-2 h-4 w-4" />
          Add Bill
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter bills by vendor, status, or date range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Vendor</label>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Vendors</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                      {vendor.name}
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
                  <SelectItem value="All Statuses">All Statuses</SelectItem>
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
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDateFilter ? format(startDateFilter, 'PP') : 'Select date'}
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

            <div>
              <label className="text-sm font-medium">End Date</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDateFilter ? format(endDateFilter, 'PP') : 'Select date'}
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

          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={handleResetFilters}>
              Reset Filters
            </Button>
            <Button onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bills</CardTitle>
          <CardDescription>
            View, add, edit, and manage vendor bills.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end mb-4">
            <Button variant="outline" onClick={() => fetchBills(pagination.page)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-8 text-red-500">
              <AlertCircle className="mr-2 h-5 w-5" />
              <span>{error}</span>
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No bills found. Add your first bill to get started.</p>
            </div>
          ) : (
            <>
              <BillTable 
                bills={bills} 
                onEdit={handleEditBill}
                onViewDetails={handleViewBill}
              />
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {bills.length} of {pagination.total} bills
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                  >
                    Previous
                  </Button>
                  <div className="text-sm">
                    Page {pagination.page} of {pagination.totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Bill Form */}
      {showAddBillForm && (
        <BillForm
          bill={editingBill}
          onClose={handleBillFormClose}
        />
      )}
    </div>
  );
}

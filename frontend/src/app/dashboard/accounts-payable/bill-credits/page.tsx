'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, Plus, Search, RefreshCw, CalendarIcon } from 'lucide-react';
import BillCreditForm from '@/components/accounts-payable/BillCreditForm';
import { BillCredit, BillCreditWithVendor } from '@/lib/accounting/billCreditTypes';
import { DatePicker } from '@/components/DatePicker';
import { Vendor } from '@/lib/accounting/vendorTypes';
import { CustomPagination } from '@/components/ui/custom-pagination';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function BillCreditsPage() {
  const { toast } = useToast();
  
  // State for bill credits and loading status
  const [billCredits, setBillCredits] = useState<BillCreditWithVendor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBillCreditForm, setShowBillCreditForm] = useState(false);
  const [selectedBillCredit, setSelectedBillCredit] = useState<BillCredit | undefined>(undefined);
  
  // State for filters
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [vendorFilter, setVendorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [startDateFilter, setStartDateFilter] = useState<Date | undefined>(undefined);
  const [endDateFilter, setEndDateFilter] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Pagination state
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalItems: 0,
    totalPages: 0,
  });
  
  const searchParams = useSearchParams();
  
  // Load bill credits on component mount and when filters change
  useEffect(() => {
    fetchBillCredits();
    fetchVendors();
    fetchStatuses();
  }, [
    pagination.page, 
    vendorFilter, 
    statusFilter, 
    startDateFilter, 
    endDateFilter,
    searchParams
  ]);
  
  // Fetch bill credits with filters
  const fetchBillCredits = async () => {
    setIsLoading(true);
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Build query parameters
      const queryParams = new URLSearchParams();
      queryParams.append('page', pagination.page.toString());
      queryParams.append('limit', pagination.limit.toString());
      
      if (vendorFilter && vendorFilter !== 'all') {
        queryParams.append('vendor_id', vendorFilter);
      }
      
      if (statusFilter && statusFilter !== 'all') {
        queryParams.append('status', statusFilter);
      }
      
      if (startDateFilter) {
        queryParams.append('start_date', format(startDateFilter, 'yyyy-MM-dd'));
      }
      
      if (endDateFilter) {
        queryParams.append('end_date', format(endDateFilter, 'yyyy-MM-dd'));
      }
      
      // Fetch bill credits
      const response = await fetch(`/api/bill-credits?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch bill credits');
      }
      
      const data = await response.json();
      setBillCredits(data.billCredits);
      setPagination({
        ...pagination,
        totalItems: data.pagination.totalItems,
        totalPages: data.pagination.totalPages,
      });
    } catch (error: any) {
      console.error('Error fetching bill credits:', error);
      
      // Check if the error is related to missing tables
      const errorMessage = error.message || '';
      if (errorMessage.includes('relation "bill_credits" does not exist')) {
        toast({
          variant: "destructive",
          title: "Database Setup Required",
          description: (
            <div data-setup-toast>
              Bill credits tables need to be created. 
              <a 
                href="/dashboard/accounts-payable/bill-credits/setup" 
                className="underline font-medium ml-1"
              >
                Click here to set up
              </a>
            </div>
          )
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load bill credits"
        });
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  // Fetch vendors for filter dropdown
  const fetchVendors = async () => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/vendors', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch vendors');
      }
      
      const data = await response.json();
      
      // Check if the response has a vendors property (API returns { vendors, pagination })
      if (data.vendors) {
        setVendors(data.vendors);
      } else {
        // If the response is a direct array of vendors
        setVendors(data);
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch vendors. Please try again.',
        variant: 'destructive'
      });
    }
  };
  
  // Fetch bill credit statuses for filter dropdown
  const fetchStatuses = async () => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/bill-credits?statuses=true', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch statuses');
      }
      
      const data = await response.json();
      setStatuses(data);
    } catch (error: any) {
      console.error('Error fetching statuses:', error);
      
      // Only show the setup toast if we haven't already shown it from fetchBillCredits
      if (error.message?.includes('relation "bill_credits" does not exist') && !document.querySelector('[data-setup-toast]')) {
        toast({
          variant: "destructive",
          title: "Database Setup Required",
          description: (
            <div data-setup-toast>
              Bill credits tables need to be created. 
              <a 
                href="/dashboard/accounts-payable/bill-credits/setup" 
                className="underline font-medium ml-1"
              >
                Click here to set up
              </a>
            </div>
          )
        });
      }
    }
  };
  
  // Handle page change
  const handlePageChange = (page: number) => {
    setPagination({
      ...pagination,
      page,
    });
  };
  
  // Handle adding a new bill credit
  const handleAddBillCredit = () => {
    setSelectedBillCredit(undefined);
    setShowBillCreditForm(true);
  };
  
  // Handle editing a bill credit
  const handleEditBillCredit = async (id: number) => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/bill-credits/${id}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch bill credit details');
      }
      
      const billCredit = await response.json();
      setSelectedBillCredit(billCredit);
      setShowBillCreditForm(true);
    } catch (error) {
      console.error('Error fetching bill credit details:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load bill credit details"
      });
    }
  };
  
  // Handle successful form submission
  const handleFormSuccess = (billCredit: BillCredit) => {
    fetchBillCredits();
  };
  
  // Handle filter reset
  const handleResetFilters = () => {
    setVendorFilter('');
    setStatusFilter('');
    setStartDateFilter(undefined);
    setEndDateFilter(undefined);
    setSearchTerm('');
    setPagination({
      ...pagination,
      page: 1,
    });
  };
  
  // Get status badge color based on status
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft':
        return 'secondary';
      case 'Pending':
        return 'warning';
      case 'Applied':
        return 'success';
      case 'Closed':
        return 'default';
      default:
        return 'outline';
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Vendor Credits</h1>
        <Button onClick={handleAddBillCredit}>
          <Plus className="h-4 w-4 mr-2" />
          Add Credit
        </Button>
      </div>
      
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filters</CardTitle>
          <CardDescription>Filter vendor credits by various criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Vendor</label>
              <Select value={vendorFilter} onValueChange={setVendorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All vendors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All vendors</SelectItem>
                  {vendors.map((vendor) => (
                    <SelectItem key={vendor.id} value={vendor.id.toString()}>
                      {vendor.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">Start Date</label>
              <DatePicker
                date={startDateFilter}
                setDate={setStartDateFilter}
                placeholder="From date"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-1 block">End Date</label>
              <DatePicker
                date={endDateFilter}
                setDate={setEndDateFilter}
                placeholder="To date"
              />
            </div>
            
            <div className="flex items-end space-x-2">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={handleResetFilters}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button 
                variant="default" 
                className="flex-1"
                onClick={() => fetchBillCredits()}
              >
                <Search className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Bill Credits Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Vendor Credits</CardTitle>
          <CardDescription>
            {pagination.totalItems} total credit{pagination.totalItems !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : billCredits.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No vendor credits found. Create your first vendor credit by clicking the "Add Credit" button.
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Credit #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billCredits.map((billCredit) => (
                      <TableRow key={billCredit.id}>
                        <TableCell>
                          {billCredit.credit_number || '-'}
                        </TableCell>
                        <TableCell>{billCredit.vendor_name}</TableCell>
                        <TableCell>
                          {format(new Date(billCredit.credit_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          {billCredit.due_date 
                            ? format(new Date(billCredit.due_date), 'MMM d, yyyy')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(billCredit.status) as any}>
                            {billCredit.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ${typeof billCredit.total_amount === 'number' 
                            ? billCredit.total_amount.toFixed(2) 
                            : parseFloat(billCredit.total_amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditBillCredit(billCredit.id!)}
                          >
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="mt-4 flex justify-center">
                  <CustomPagination
                    currentPage={pagination.page}
                    totalPages={pagination.totalPages}
                    onPageChange={handlePageChange}
                  />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      
      {/* Bill Credit Form Dialog */}
      {showBillCreditForm && (
        <BillCreditForm
          billCredit={selectedBillCredit}
          onClose={() => setShowBillCreditForm(false)}
          onSuccess={handleFormSuccess}
          title={selectedBillCredit ? "Edit Vendor Credit" : "Create New Vendor Credit"}
        />
      )}
    </div>
  );
}

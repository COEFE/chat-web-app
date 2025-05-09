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
  Search,
  AlertCircle 
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { CustomerTable } from "@/components/accounts-receivable/CustomerTable";
import { CustomerForm } from "@/components/accounts-receivable/CustomerForm";

interface Customer {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  default_revenue_account_id?: number;
  default_revenue_account_name?: string;
  created_at: string;
  updated_at: string;
}

export default function CustomersPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddCustomerForm, setShowAddCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  // Fetch customers on mount or when pagination/search changes
  useEffect(() => {
    const fetchCustomers = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Build query string
        let url = `/api/customers?page=${pagination.page}&limit=${pagination.limit}`;
        if (searchQuery) {
          url += `&search=${encodeURIComponent(searchQuery)}`;
        }
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching customers: ${response.status}`);
        }
        
        const data = await response.json();
        setCustomers(data.customers);
        setPagination({
          page: data.pagination.page,
          limit: data.pagination.limit,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages
        });
      } catch (err: any) {
        console.error("Error fetching customers:", err);
        setError(err.message || "Failed to fetch customers");
        toast({
          title: "Error",
          description: err.message || "Failed to fetch customers",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    const auth = getAuth();
    if (auth.currentUser) {
      fetchCustomers();
    }
  }, [pagination.page, searchQuery, toast]);

  const handleAddCustomer = () => {
    setEditingCustomer(null);
    setShowAddCustomerForm(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowAddCustomerForm(true);
  };

  const handleCustomerFormClose = (refreshData = false) => {
    setShowAddCustomerForm(false);
    setEditingCustomer(null);
    
    if (refreshData) {
      // Reset to first page and refresh data
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handleRefresh = () => {
    // Keep current page but refresh data
    const currentPage = pagination.page;
    setPagination(prev => ({ ...prev, page: currentPage }));
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Receivable</h1>
      </div>
      
      <Tabs defaultValue="customers" className="mb-6">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="invoices" onClick={() => router.push('/dashboard/accounts-receivable/invoices')}>Invoices</TabsTrigger>
          <TabsTrigger value="aging-report" onClick={() => router.push('/dashboard/accounts-receivable/aging-report')}>Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Customers</h2>
        <Button onClick={handleAddCustomer}>
          <Plus className="mr-2 h-4 w-4" />
          Add Customer
        </Button>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>
            Search for customers by name or contact information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex space-x-2">
            <div className="flex-1">
              <Input
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button type="submit">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
            <Button type="button" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
      
      {isLoading ? (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mb-6">
          <AlertCircle className="text-red-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-medium">Error loading customers</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      ) : (
        <CustomerTable 
          customers={customers} 
          onEdit={handleEditCustomer}
          pagination={pagination}
          onPageChange={handlePageChange}
        />
      )}
      
      {showAddCustomerForm && (
        <CustomerForm 
          customer={editingCustomer} 
          onClose={handleCustomerFormClose} 
        />
      )}
    </div>
  );
}

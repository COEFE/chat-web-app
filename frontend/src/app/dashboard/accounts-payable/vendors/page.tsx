"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  AlertCircle
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";
import { getAuth } from "firebase/auth";
import { VendorTable } from "@/components/accounts-payable/VendorTable";
import { VendorForm } from "@/components/accounts-payable/VendorForm";

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

export default function VendorsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  
  const [showAddVendorForm, setShowAddVendorForm] = useState<boolean>(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });

  // Fetch vendors with optional search term
  const fetchVendors = async (page = 1, search = "") => {
    setIsLoading(true);
    setError(null);

    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      let url = `/api/vendors?page=${page}&limit=${pagination.limit}`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error fetching vendors: ${response.status}`);
      }
      
      const data = await response.json();
      setVendors(data.vendors);
      setPagination({
        page: data.pagination.page,
        limit: data.pagination.limit,
        total: data.pagination.total,
        totalPages: data.pagination.totalPages
      });
    } catch (err: any) {
      console.error("Error fetching vendors:", err);
      setError(err.message || "Failed to fetch vendors");
      toast({
        title: "Error",
        description: err.message || "Failed to fetch vendors",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchVendors(pagination.page, searchTerm);
    }
  }, [user, pagination.page]);

  const handleSearch = () => {
    // Reset to first page when searching
    fetchVendors(1, searchTerm);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleAddVendor = () => {
    setEditingVendor(null);
    setShowAddVendorForm(true);
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setShowAddVendorForm(true);
  };

  const handleVendorFormClose = (refreshData = false) => {
    setShowAddVendorForm(false);
    setEditingVendor(null);
    
    if (refreshData) {
      fetchVendors(pagination.page, searchTerm);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page: newPage }));
    }
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
        <Button onClick={handleAddVendor}>
          <Plus className="mr-2 h-4 w-4" />
          Add New Vendor
        </Button>
      </div>
      
      <Tabs defaultValue="vendors" className="mb-6">
        <TabsList>
          <TabsTrigger value="vendors">Vendors</TabsTrigger>
          <TabsTrigger value="bills" onClick={() => router.push('/dashboard/accounts-payable/bills')}>Bills</TabsTrigger>
          <TabsTrigger value="aging-report" onClick={() => router.push('/dashboard/accounts-payable/aging-report')}>Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Vendors</h2>
        <Button onClick={handleAddVendor}>
          <Plus className="mr-2 h-4 w-4" />
          Add Vendor
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vendor Management</CardTitle>
          <CardDescription>
            View, add, edit, and manage your vendors for accounts payable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search vendors..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
            </div>
            <Button variant="outline" onClick={handleSearch}>
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
            <Button variant="outline" onClick={() => fetchVendors(pagination.page, searchTerm)}>
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
          ) : vendors.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No vendors found. Add your first vendor to get started.</p>
            </div>
          ) : (
            <>
              <VendorTable 
                vendors={vendors} 
                onEdit={handleEditVendor}
              />
              
              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {vendors.length} of {pagination.total} vendors
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

      {/* Add/Edit Vendor Form Dialog */}
      {showAddVendorForm && (
        <VendorForm
          vendor={editingVendor}
          onClose={handleVendorFormClose}
        />
      )}
    </div>
  );
}

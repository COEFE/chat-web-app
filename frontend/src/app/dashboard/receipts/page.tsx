"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Receipt, Search, Filter, Eye, Download, Calendar, DollarSign, Store, FileText } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { format } from 'date-fns';
import ReceiptUploadButton from '@/components/receipts/ReceiptUploadButton';
import FloatingAssistant from '@/components/chat/FloatingAssistant';
import { useFeatureFlags } from '@/lib/featureFlags';

interface ReceiptData {
  id: string;
  vendor_name: string;
  receipt_date: string;
  total_amount: number;
  processed_status: string;
  created_at: string;
  line_items: any[];
  receipt_image_url?: string;
  bill_id?: number;
  bill_description?: string;
  bill_status?: string;
  attachment_url?: string;
  sales_tax?: number;
  tax?: number;
  tip?: number;
  subtotal?: number;
  card_last_4?: string;
  bill_line_items?: Array<{
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
    category: string;
    is_tax: boolean;
    is_tip: boolean;
  }>;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [filteredReceipts, setFilteredReceipts] = useState<ReceiptData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptData | null>(null);
  const [showVendorReport, setShowVendorReport] = useState(false);
  const [showCategoryReport, setShowCategoryReport] = useState(false);
  const { user } = useAuth();
  const features = useFeatureFlags();

  // Check if receipt scanning feature is enabled
  if (!features.receiptScanning) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Feature Not Available</CardTitle>
            <CardDescription>
              Receipt scanning is not available in your current plan.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Fetch receipts data
  const fetchReceipts = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      
      const response = await fetch('/api/receipts', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch receipts');
      }

      const data = await response.json();
      setReceipts(data.receipts || []);
      setFilteredReceipts(data.receipts || []);
    } catch (error) {
      console.error('Error fetching receipts:', error);
      toast.error('Failed to load receipts');
    } finally {
      setLoading(false);
    }
  };

  // Filter receipts based on search and status
  useEffect(() => {
    let filtered = receipts;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(receipt => 
        receipt.vendor_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        receipt.bill_description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(receipt => receipt.processed_status === statusFilter);
    }

    setFilteredReceipts(filtered);
  }, [receipts, searchTerm, statusFilter]);

  // Load receipts on component mount
  useEffect(() => {
    fetchReceipts();
  }, [user]);

  const getStatusBadge = (status: string, hasBill: boolean = false) => {
    // If the receipt has an associated bill, it's considered completed
    if (hasBill) {
      return (
        <Badge className="bg-green-100 text-green-800">
          Completed
        </Badge>
      );
    }
    
    const statusConfig = {
      'completed': { variant: 'default' as const, label: 'Completed', color: 'bg-green-100 text-green-800' },
      'pending': { variant: 'secondary' as const, label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
      'failed': { variant: 'destructive' as const, label: 'Failed', color: 'bg-red-100 text-red-800' },
      'processing': { variant: 'outline' as const, label: 'Processing', color: 'bg-blue-100 text-blue-800' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy');
  };

  const handleViewReceipt = (receipt: ReceiptData) => {
    setSelectedReceipt(receipt);
  };

  const handleUploadComplete = () => {
    fetchReceipts(); // Refresh the receipts list
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading receipts...</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate top vendor spend for current month
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentMonthReceipts = receipts.filter(receipt => {
    const receiptDate = new Date(receipt.receipt_date);
    return receiptDate.getMonth() === currentMonth && receiptDate.getFullYear() === currentYear;
  });

  const vendorSpends = currentMonthReceipts.reduce((acc, receipt) => {
    const vendor = receipt.vendor_name;
    acc[vendor] = (acc[vendor] || 0) + (typeof receipt.total_amount === 'string' ? parseFloat(receipt.total_amount) : receipt.total_amount);
    return acc;
  }, {} as Record<string, number>);

  const topVendor = Object.entries(vendorSpends).length > 0 
    ? Object.entries(vendorSpends).reduce((a, b) => a[1] > b[1] ? a : b)
    : ['No data', 0];

  // Calculate top category spend from current month receipts
  const categorySpends = currentMonthReceipts.reduce((acc, receipt) => {
    if (receipt.line_items && Array.isArray(receipt.line_items)) {
      receipt.line_items.forEach((item: any) => {
        if (item.categoryGuess && item.amount) {
          const category = item.categoryGuess;
          const amount = typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount;
          acc[category] = (acc[category] || 0) + amount;
        }
      });
    }
    return acc;
  }, {} as Record<string, number>);

  const topCategory = Object.entries(categorySpends).length > 0
    ? Object.entries(categorySpends).reduce((a, b) => a[1] > b[1] ? a : b)
    : ['No data', 0];

  // Calculate all vendor spending for the report (current month)
  const allVendorSpends = Object.entries(vendorSpends)
    .map(([vendor, amount]) => ({ vendor, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Calculate all category spending for the report (current month)
  const allCategorySpends = Object.entries(categorySpends)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Receipt Tracker</h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Track and manage your uploaded receipts</p>
            </div>
            <ReceiptUploadButton />
          </div>
        </div>

        {/* Summary Cards - Optimized for mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Top Vendor Card */}
          <Card 
            className="bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setShowVendorReport(true)}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Top Vendor (This Month)
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                    {topVendor[0]}
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-blue-600 dark:text-blue-400 mt-1">
                    {formatCurrency(Number(topVendor[1]))}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <Store className="h-8 w-8 sm:h-10 sm:w-10 text-blue-500 dark:text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Category Card */}
          <Card 
            className="bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => setShowCategoryReport(true)}
          >
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Top Category (This Month)
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                    {topCategory[0]}
                  </p>
                  <p className="text-sm sm:text-base font-semibold text-green-600 dark:text-green-400 mt-1">
                    {formatCurrency(Number(topCategory[1]))}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <DollarSign className="h-8 w-8 sm:h-10 sm:w-10 text-green-500 dark:text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Receipts Card */}
          <Card className="bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Total Receipts
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                    {receipts.length}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-indigo-500 dark:text-indigo-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Total Amount Card */}
          <Card className="bg-white dark:bg-gray-800 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Total Amount
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                    {formatCurrency(receipts.reduce((sum, receipt) => sum + (typeof receipt.total_amount === 'string' ? parseFloat(receipt.total_amount) : receipt.total_amount), 0))}
                  </p>
                </div>
                <div className="ml-3 flex-shrink-0">
                  <DollarSign className="h-8 w-8 sm:h-10 sm:w-10 text-yellow-500 dark:text-yellow-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search by vendor or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="sm:w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={fetchReceipts}>
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Receipts Table */}
        <Card className="bg-white dark:bg-gray-800 shadow-sm">
          <CardHeader>
            <CardTitle>Receipts ({filteredReceipts.length})</CardTitle>
            <CardDescription>
              View and manage your uploaded receipts
            </CardDescription>
          </CardHeader>
          <CardContent>
            {filteredReceipts.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No receipts found</h3>
                <p className="text-gray-600 mb-4">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filter criteria.'
                    : 'Upload your first receipt to get started.'
                  }
                </p>
                {!searchTerm && statusFilter === 'all' && (
                  <ReceiptUploadButton />
                )}
              </div>
            ) : (
              /* Mobile-first receipt list */
              <div className="space-y-4 md:hidden">
                {filteredReceipts.map((receipt) => (
                  <div key={receipt.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 dark:text-white">{receipt.vendor_name}</h4>
                        <p className="text-sm text-gray-500">{formatDate(receipt.receipt_date)}</p>
                      </div>
                      <p className="font-semibold text-lg text-blue-600 dark:text-blue-400">
                        {formatCurrency(typeof receipt.total_amount === 'string' ? parseFloat(receipt.total_amount) : receipt.total_amount)}
                      </p>
                    </div>
                    
                    {receipt.bill_description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {receipt.bill_description}
                      </p>
                    )}
                    
                    <div className="flex items-center justify-between pt-2">
                      <div>{getStatusBadge(receipt.processed_status, !!receipt.bill_id)}</div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewReceipt(receipt)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {receipt.attachment_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(receipt.attachment_url, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Desktop table view */}
            {filteredReceipts.length > 0 && (
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center">
                            <Store className="h-4 w-4 text-gray-400 mr-2" />
                            {receipt.vendor_name}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(receipt.receipt_date)}</TableCell>
                        <TableCell className="font-medium">
                          {formatCurrency(typeof receipt.total_amount === 'string' ? parseFloat(receipt.total_amount) : receipt.total_amount)}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {receipt.bill_description || 'No description'}
                        </TableCell>
                        <TableCell>{getStatusBadge(receipt.processed_status, !!receipt.bill_id)}</TableCell>
                        <TableCell className="text-gray-600">
                          {formatDate(receipt.created_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewReceipt(receipt)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {receipt.attachment_url && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(receipt.attachment_url, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendor Report Modal */}
        <Dialog open={showVendorReport} onOpenChange={setShowVendorReport}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Vendor Spending Report</DialogTitle>
              <DialogDescription>
                All vendors sorted by spending amount for {format(new Date(), 'MMMM yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="overflow-y-auto flex-1 pr-2">
              {allVendorSpends.length === 0 ? (
                <div className="text-center py-12">
                  <Store className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No vendor data</h3>
                  <p className="text-gray-600">No receipts found for this month.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allVendorSpends.map((vendor, index) => (
                    <div 
                      key={vendor.vendor} 
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                              {index + 1}
                            </span>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {vendor.vendor}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {currentMonthReceipts.filter(r => r.vendor_name === vendor.vendor).length} receipt(s)
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {formatCurrency(vendor.amount)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {((vendor.amount / allVendorSpends.reduce((sum, v) => sum + v.amount, 0)) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Summary */}
              {allVendorSpends.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">Total Spending</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {allVendorSpends.length} vendor(s) • {currentMonthReceipts.length} receipt(s)
                      </p>
                    </div>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                      {formatCurrency(allVendorSpends.reduce((sum, v) => sum + v.amount, 0))}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={() => setShowVendorReport(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Category Report Modal */}
        <Dialog open={showCategoryReport} onOpenChange={setShowCategoryReport}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Category Spending Report</DialogTitle>
              <DialogDescription>
                All categories sorted by spending amount for {format(new Date(), 'MMMM yyyy')}
              </DialogDescription>
            </DialogHeader>
            
            <div className="overflow-y-auto flex-1 pr-2">
              {allCategorySpends.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No category data</h3>
                  <p className="text-gray-600">No receipts found for this month.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {allCategorySpends.map((category, index) => (
                    <div 
                      key={category.category} 
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                              {index + 1}
                            </span>
                          </div>
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 dark:text-white">
                            {category.category}
                          </h4>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {currentMonthReceipts.filter(r => r.line_items && r.line_items.some(item => item.categoryGuess === category.category)).length} receipt(s)
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                          {formatCurrency(category.amount)}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {((category.amount / allCategorySpends.reduce((sum, c) => sum + c.amount, 0)) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Summary */}
              {allCategorySpends.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold text-blue-900 dark:text-blue-100">Total Spending</h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {allCategorySpends.length} category(s) • {currentMonthReceipts.length} receipt(s)
                      </p>
                    </div>
                    <p className="text-xl font-bold text-blue-900 dark:text-blue-100">
                      {formatCurrency(allCategorySpends.reduce((sum, c) => sum + c.amount, 0))}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button variant="outline" onClick={() => setShowCategoryReport(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Receipt Detail Modal */}
        <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>Receipt Details</DialogTitle>
              <DialogDescription>
                View detailed information about this receipt
              </DialogDescription>
            </DialogHeader>
            
            {selectedReceipt && (
              <div className="space-y-6 overflow-y-auto flex-1 pr-2">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">Vendor</label>
                    <p className="text-lg font-semibold">{selectedReceipt.vendor_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Date</label>
                    <p className="text-lg">{formatDate(selectedReceipt.receipt_date)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Total Amount</label>
                    <p className="text-lg font-semibold text-green-600">
                      {formatCurrency(typeof selectedReceipt.total_amount === 'string' ? parseFloat(selectedReceipt.total_amount) : selectedReceipt.total_amount)}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">Status</label>
                    <div>
                      {getStatusBadge(selectedReceipt.processed_status, !!selectedReceipt.bill_id)}
                    </div>
                  </div>
                  {selectedReceipt.card_last_4 && (
                    <div>
                      <label className="text-sm font-medium text-gray-600">Card Last 4</label>
                      <p className="text-lg">•••• {selectedReceipt.card_last_4}</p>
                    </div>
                  )}
                </div>

                {/* Description */}
                {selectedReceipt.bill_description && (
                  <div>
                    <label className="text-sm font-medium text-gray-600">Description</label>
                    <p className="text-lg">{selectedReceipt.bill_description}</p>
                  </div>
                )}

                {/* Line Items */}
                {((selectedReceipt.bill_line_items && selectedReceipt.bill_line_items.length > 0) || 
                  (selectedReceipt.line_items && selectedReceipt.line_items.length > 0)) && (
                  <div>
                    <label className="text-sm font-medium text-gray-600 mb-2 block">Line Items</label>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Unit Price</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {/* Use bill_line_items if available, filtering out tax and tip items */}
                          {selectedReceipt.bill_line_items && selectedReceipt.bill_line_items.length > 0 ? (
                            selectedReceipt.bill_line_items
                              .filter(item => !item.is_tax && !item.is_tip)
                              .map((item, index) => (
                                <TableRow key={item.id || index}>
                                  <TableCell>{item.description || 'Item'}</TableCell>
                                  <TableCell className="text-right">
                                    {item.quantity || 1}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price)}
                                  </TableCell>
                                  <TableCell className="text-right">
                                    {formatCurrency(typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount)}
                                  </TableCell>
                                </TableRow>
                              ))
                          ) : (
                            /* Fallback to original line_items */
                            selectedReceipt.line_items.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>{item.description || item.name || item.item || 'Item'}</TableCell>
                                <TableCell className="text-right">
                                  {item.quantity || item.qty || 1}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price || typeof item.price === 'string' ? parseFloat(item.price) : item.price || 0)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount || typeof item.total === 'string' ? parseFloat(item.total) : item.total || (item.quantity || 1) * (typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price || typeof item.price === 'string' ? parseFloat(item.price) : item.price || 0))}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                          
                          {/* Subtotal */}
                          <TableRow className="border-t-2">
                            <TableCell colSpan={3} className="text-right font-medium">Subtotal:</TableCell>
                            <TableCell className="text-right font-medium">
                              {selectedReceipt.subtotal ? 
                                formatCurrency(typeof selectedReceipt.subtotal === 'string' ? parseFloat(selectedReceipt.subtotal) : selectedReceipt.subtotal) :
                                formatCurrency(
                                  selectedReceipt.line_items.reduce((sum, item) => 
                                    sum + (typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount || typeof item.total === 'string' ? parseFloat(item.total) : item.total || (item.quantity || 1) * (typeof item.unit_price === 'string' ? parseFloat(item.unit_price) : item.unit_price || typeof item.price === 'string' ? parseFloat(item.price) : item.price || 0)), 0
                                  )
                                )
                              }
                            </TableCell>
                          </TableRow>
                          
                          {/* Sales Tax */}
                          {(selectedReceipt.sales_tax && Number(selectedReceipt.sales_tax) > 0) && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-right">Sales Tax:</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(typeof selectedReceipt.sales_tax === 'string' ? parseFloat(selectedReceipt.sales_tax) : selectedReceipt.sales_tax)}
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Tax (alternative field name) */}
                          {(selectedReceipt as any).tax && Number((selectedReceipt as any).tax) > 0 && !selectedReceipt.sales_tax && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-right">Tax:</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(typeof (selectedReceipt as any).tax === 'string' ? parseFloat((selectedReceipt as any).tax) : (selectedReceipt as any).tax)}
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Tips */}
                          {selectedReceipt.tip && Number(selectedReceipt.tip) > 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-right">Tip:</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(typeof selectedReceipt.tip === 'string' ? parseFloat(selectedReceipt.tip) : selectedReceipt.tip)}
                              </TableCell>
                            </TableRow>
                          )}
                          
                          {/* Final Total */}
                          <TableRow className="border-t-4 border-gray-800 bg-gray-100 dark:bg-gray-800">
                            <TableCell colSpan={3} className="text-right font-bold text-xl py-4 text-gray-900 dark:text-white">
                              Total:
                            </TableCell>
                            <TableCell className="text-right font-bold text-xl py-4 text-gray-900 dark:text-white">
                              {formatCurrency(typeof selectedReceipt.total_amount === 'string' ? parseFloat(selectedReceipt.total_amount) : selectedReceipt.total_amount)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                
                {/* Actions */}
                <div className="flex justify-end space-x-2">
                  {(selectedReceipt.attachment_url || selectedReceipt.receipt_image_url) && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(selectedReceipt.attachment_url || selectedReceipt.receipt_image_url, '_blank')}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Receipt
                    </Button>
                  )}
                  
                  {selectedReceipt.attachment_url && (
                    <Button
                      variant="outline"
                      onClick={() => window.open(selectedReceipt.attachment_url, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Receipt
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSelectedReceipt(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        
        {/* Floating AI Assistant */}
        <FloatingAssistant />
      </div>
    </div>
  );
}

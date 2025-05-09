"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInDays } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  RefreshCw, 
  FileDown,
  Printer,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { getAuth } from "firebase/auth";
import { useToast } from "@/components/ui/use-toast";

// Define interfaces for our data
interface Customer {
  id: number;
  name: string;
}

interface Invoice {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
}

interface CustomerAgingData {
  customer_id: number;
  customer_name: string;
  current: number;
  thirtyDays: number;
  sixtyDays: number;
  ninetyDays: number;
  total: number;
  invoices: Invoice[];
}

interface AgingReport {
  report_date: string;
  total_current: number;
  total_thirtyDays: number;
  total_sixtyDays: number;
  total_ninetyDays: number;
  grand_total: number;
  customers: CustomerAgingData[];
}

export default function ARAgingReportPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [agingReport, setAgingReport] = useState<AgingReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<number | null>(null);

  useEffect(() => {
    loadAgingReport();
  }, []);

  const loadAgingReport = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch all unpaid/partially paid invoices
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/invoices?status=Sent&status=Partially%20Paid&status=Overdue', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch invoices data');
      }

      const data = await response.json();
      const invoices: Invoice[] = data.invoices;
      
      // Today's date for aging calculations
      const today = new Date();
      
      // Group invoices by customer and calculate aging buckets
      const customerMap = new Map<number, CustomerAgingData>();
      
      invoices.forEach(invoice => {
        const dueDate = parseISO(invoice.due_date);
        const remainingAmount = invoice.total_amount - (invoice.amount_paid || 0);
        
        if (remainingAmount <= 0) return; // Skip fully paid invoices
        
        // Calculate days overdue
        const daysOverdue = differenceInDays(today, dueDate);
        
        // Get or create customer entry
        let customerData = customerMap.get(invoice.customer_id);
        if (!customerData) {
          customerData = {
            customer_id: invoice.customer_id,
            customer_name: invoice.customer_name || `Customer ID: ${invoice.customer_id}`,
            current: 0,
            thirtyDays: 0,
            sixtyDays: 0,
            ninetyDays: 0,
            total: 0,
            invoices: []
          };
          customerMap.set(invoice.customer_id, customerData);
        }
        
        // Add invoice to customer's invoice list
        customerData.invoices.push(invoice);
        
        // Assign to appropriate bucket based on days overdue
        if (daysOverdue <= 0) {
          // Not yet due (current)
          customerData.current += remainingAmount;
        } else if (daysOverdue <= 30) {
          // 1-30 days overdue
          customerData.thirtyDays += remainingAmount;
        } else if (daysOverdue <= 60) {
          // 31-60 days overdue
          customerData.sixtyDays += remainingAmount;
        } else {
          // Over 60 days overdue (90+ bucket)
          customerData.ninetyDays += remainingAmount;
        }
        
        // Update total
        customerData.total += remainingAmount;
      });
      
      // Convert map to array and sort by customer name
      const customersArray = Array.from(customerMap.values())
        .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
      
      // Calculate totals
      const totals = customersArray.reduce(
        (acc, customer) => {
          acc.total_current += customer.current;
          acc.total_thirtyDays += customer.thirtyDays;
          acc.total_sixtyDays += customer.sixtyDays;
          acc.total_ninetyDays += customer.ninetyDays;
          acc.grand_total += customer.total;
          return acc;
        },
        {
          total_current: 0,
          total_thirtyDays: 0,
          total_sixtyDays: 0,
          total_ninetyDays: 0,
          grand_total: 0
        }
      );
      
      // Create the aging report
      const report: AgingReport = {
        report_date: format(today, 'yyyy-MM-dd'),
        ...totals,
        customers: customersArray
      };
      
      setAgingReport(report);
    } catch (error: any) {
      console.error('Error loading aging report:', error);
      setError(error.message || 'An error occurred while loading the aging report');
      toast({
        title: "Error",
        description: error.message || "Failed to load aging report",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomerClick = (customerId: number) => {
    if (expandedCustomer === customerId) {
      setExpandedCustomer(null);
    } else {
      setExpandedCustomer(customerId);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const printReport = () => {
    window.print();
  };

  const downloadReport = () => {
    // Generate CSV content
    if (!agingReport) return;
    
    let csvContent = "Customer,Current,1-30 Days,31-60 Days,61+ Days,Total\n";
    
    // Add customer rows
    agingReport.customers.forEach(customer => {
      csvContent += `"${customer.customer_name}",${customer.current},${customer.thirtyDays},${customer.sixtyDays},${customer.ninetyDays},${customer.total}\n`;
    });
    
    // Add total row
    csvContent += `"TOTAL",${agingReport.total_current},${agingReport.total_thirtyDays},${agingReport.total_sixtyDays},${agingReport.total_ninetyDays},${agingReport.grand_total}\n`;
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Set download attributes
    link.setAttribute('href', url);
    link.setAttribute('download', `ar-aging-report-${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Receivable</h1>
      </div>
      
      <Tabs defaultValue="aging-report" className="mb-6">
        <TabsList>
          <TabsTrigger value="customers" onClick={() => router.push('/dashboard/accounts-receivable/customers')}>Customers</TabsTrigger>
          <TabsTrigger value="invoices" onClick={() => router.push('/dashboard/accounts-receivable/invoices')}>Invoices</TabsTrigger>
          <TabsTrigger value="aging-report">Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Accounts Receivable Aging Report</h2>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={loadAgingReport}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={printReport}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={downloadReport}>
            <FileDown className="mr-2 h-4 w-4" />
            Download CSV
          </Button>
        </div>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mb-6">
          <AlertCircle className="text-red-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="text-red-800 font-medium">Error loading aging report</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      ) : agingReport && agingReport.customers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center p-4">
              <p className="text-gray-500">No outstanding invoices found.</p>
            </div>
          </CardContent>
        </Card>
      ) : agingReport && (
        <Card className="mb-6 print:shadow-none">
          <CardHeader className="print:py-2">
            <div className="flex justify-between items-center">
              <CardTitle>Accounts Receivable Aging Summary</CardTitle>
              <div className="text-sm text-gray-500">
                Report Date: {format(new Date(agingReport.report_date), 'MM/dd/yyyy')}
              </div>
            </div>
            <CardDescription>
              Outstanding invoices by customer and age
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium">Customer</th>
                    <th className="text-right py-2 px-4 font-medium">Current</th>
                    <th className="text-right py-2 px-4 font-medium">1-30 Days</th>
                    <th className="text-right py-2 px-4 font-medium">31-60 Days</th>
                    <th className="text-right py-2 px-4 font-medium">61+ Days</th>
                    <th className="text-right py-2 px-4 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {agingReport.customers.map((customer) => (
                    <React.Fragment key={customer.customer_id}>
                      <tr 
                        className={`border-b hover:bg-muted/50 cursor-pointer ${customer.total > 0 ? '' : 'opacity-60'}`}
                        onClick={() => handleCustomerClick(customer.customer_id)}
                      >
                        <td className="py-3 px-4">{customer.customer_name}</td>
                        <td className="text-right py-3 px-4">
                          {customer.current > 0 ? formatCurrency(customer.current) : '-'}
                        </td>
                        <td className="text-right py-3 px-4">
                          {customer.thirtyDays > 0 ? formatCurrency(customer.thirtyDays) : '-'}
                        </td>
                        <td className="text-right py-3 px-4">
                          {customer.sixtyDays > 0 ? formatCurrency(customer.sixtyDays) : '-'}
                        </td>
                        <td className="text-right py-3 px-4">
                          {customer.ninetyDays > 0 ? formatCurrency(customer.ninetyDays) : '-'}
                        </td>
                        <td className="text-right py-3 px-4 font-bold">{formatCurrency(customer.total)}</td>
                      </tr>
                      
                      {/* Customer Detail View */}
                      {expandedCustomer === customer.customer_id && (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="py-3 px-4">
                            <div className="rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="bg-muted/50">
                                    <th className="text-left py-2 px-3">Invoice #</th>
                                    <th className="text-left py-2 px-3">Date</th>
                                    <th className="text-left py-2 px-3">Due Date</th>
                                    <th className="text-right py-2 px-3">Amount</th>
                                    <th className="text-right py-2 px-3">Paid</th>
                                    <th className="text-right py-2 px-3">Balance</th>
                                    <th className="text-left py-2 px-3">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customer.invoices.map((invoice) => {
                                    const balance = invoice.total_amount - invoice.amount_paid;
                                    return (
                                      <tr 
                                        key={invoice.id} 
                                        className="border-t border-muted hover:bg-muted/40 cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/dashboard/accounts-receivable/invoices/${invoice.id}`);
                                        }}
                                      >
                                        <td className="py-2 px-3">{invoice.invoice_number || `#${invoice.id}`}</td>
                                        <td className="py-2 px-3">{format(new Date(invoice.invoice_date), 'MMM d, yyyy')}</td>
                                        <td className="py-2 px-3">{format(new Date(invoice.due_date), 'MMM d, yyyy')}</td>
                                        <td className="text-right py-2 px-3">${invoice.total_amount.toFixed(2)}</td>
                                        <td className="text-right py-2 px-3">${(invoice.amount_paid || 0).toFixed(2)}</td>
                                        <td className="text-right py-2 px-3 font-medium">${balance.toFixed(2)}</td>
                                        <td className="py-2 px-3">
                                          <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium
                                            ${invoice.status === 'Overdue' ? 'bg-destructive/10 text-destructive' : 
                                              invoice.status === 'Partially Paid' ? 'bg-amber-100 text-amber-800' :
                                              'bg-blue-100 text-blue-800'
                                            }`}
                                          >
                                            {invoice.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  
                  {/* Totals Row */}
                  <tr className="border-t border-b bg-muted/50 font-bold">
                    <td className="py-3 px-4">TOTAL</td>
                    <td className="text-right py-3 px-4">
                      {agingReport.total_current > 0 ? formatCurrency(agingReport.total_current) : '-'}
                    </td>
                    <td className="text-right py-3 px-4">
                      {agingReport.total_thirtyDays > 0 ? formatCurrency(agingReport.total_thirtyDays) : '-'}
                    </td>
                    <td className="text-right py-3 px-4">
                      {agingReport.total_sixtyDays > 0 ? formatCurrency(agingReport.total_sixtyDays) : '-'}
                    </td>
                    <td className="text-right py-3 px-4">
                      {agingReport.total_ninetyDays > 0 ? formatCurrency(agingReport.total_ninetyDays) : '-'}
                    </td>
                    <td className="text-right py-3 px-4">{formatCurrency(agingReport.grand_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

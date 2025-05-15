"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, isAfter, differenceInDays, subDays } from "date-fns";
import { 
  Loader2,
  RefreshCw, 
  FileDown,
  Printer,
  AlertCircle
} from "lucide-react";
import { getAuth } from "firebase/auth";

// Define interfaces for our data
interface Vendor {
  id: number;
  name: string;
}

interface Bill {
  id: number;
  vendor_id: number;
  vendor_name?: string;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
}

interface VendorAgingData {
  vendor_id: number;
  vendor_name: string;
  current: number; // 0-30 days
  thirtyDays: number; // 31-60 days
  sixtyDays: number; // 61-90 days
  ninetyDays: number; // 91+ days
  total: number;
  bills: Bill[];
}

interface AgingReport {
  report_date: string;
  total_current: number;
  total_thirtyDays: number;
  total_sixtyDays: number;
  total_ninetyDays: number;
  grand_total: number;
  vendors: VendorAgingData[];
}

export default function APAgingReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<AgingReport | null>(null);
  const [expandedVendor, setExpandedVendor] = useState<number | null>(null);

  useEffect(() => {
    loadAgingReport();
  }, []);

  const loadAgingReport = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all unpaid/partially paid bills
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Get Draft, Open and Partially Paid bills
      const response = await fetch('/api/bills?status=Draft&status=Open&status=Partially%20Paid', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch bills data');
      }

      const data = await response.json();
      const bills: Bill[] = data.bills;
      
      // Today's date for aging calculations
      const today = new Date();
      
      // Group bills by vendor and calculate aging buckets
      const vendorMap = new Map<number, VendorAgingData>();
      
      bills.forEach(bill => {
        const dueDate = parseISO(bill.due_date);
        const remainingAmount = bill.total_amount - (bill.amount_paid || 0);
        
        if (remainingAmount <= 0) return; // Skip fully paid bills
        
        // Calculate days overdue
        const daysOverdue = differenceInDays(today, dueDate);
        
        // Get or create vendor entry
        let vendorData = vendorMap.get(bill.vendor_id);
        if (!vendorData) {
          vendorData = {
            vendor_id: bill.vendor_id,
            vendor_name: bill.vendor_name || `Vendor ID: ${bill.vendor_id}`,
            current: 0,
            thirtyDays: 0,
            sixtyDays: 0,
            ninetyDays: 0,
            total: 0,
            bills: []
          };
          vendorMap.set(bill.vendor_id, vendorData);
        }
        
        // Add bill to vendor's bill list
        vendorData.bills.push(bill);
        
        // Assign to appropriate bucket based on days overdue
        if (daysOverdue <= 30) {
          vendorData.current += remainingAmount;
        } else if (daysOverdue <= 60) {
          vendorData.thirtyDays += remainingAmount;
        } else if (daysOverdue <= 90) {
          vendorData.sixtyDays += remainingAmount;
        } else {
          vendorData.ninetyDays += remainingAmount;
        }
        
        // Update vendor total
        vendorData.total += remainingAmount;
      });
      
      // Calculate report totals
      let total_current = 0;
      let total_thirtyDays = 0;
      let total_sixtyDays = 0;
      let total_ninetyDays = 0;
      let grand_total = 0;
      
      const vendorAgingData = Array.from(vendorMap.values())
        .sort((a, b) => b.total - a.total); // Sort by total amount, highest first
      
      vendorAgingData.forEach(vendor => {
        total_current += vendor.current;
        total_thirtyDays += vendor.thirtyDays;
        total_sixtyDays += vendor.sixtyDays;
        total_ninetyDays += vendor.ninetyDays;
        grand_total += vendor.total;
      });
      
      // Construct the report
      const agingReport: AgingReport = {
        report_date: format(today, 'yyyy-MM-dd'),
        total_current,
        total_thirtyDays,
        total_sixtyDays,
        total_ninetyDays,
        grand_total,
        vendors: vendorAgingData
      };
      
      setReportData(agingReport);
    } catch (err: any) {
      console.error('Error loading AP aging report:', err);
      setError(err.message || 'An error occurred while loading the report');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    loadAgingReport();
  };

  const toggleVendorExpand = (vendorId: number) => {
    if (expandedVendor === vendorId) {
      setExpandedVendor(null);
    } else {
      setExpandedVendor(vendorId);
    }
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    
    // Create CSV content
    let csvContent = "Vendor,Current (0-30 days),31-60 days,61-90 days,90+ days,Total\n";
    
    reportData.vendors.forEach(vendor => {
      csvContent += `"${vendor.vendor_name}",${vendor.current.toFixed(2)},${vendor.thirtyDays.toFixed(2)},${vendor.sixtyDays.toFixed(2)},${vendor.ninetyDays.toFixed(2)},${vendor.total.toFixed(2)}\n`;
    });
    
    csvContent += `\n"TOTAL",${reportData.total_current.toFixed(2)},${reportData.total_thirtyDays.toFixed(2)},${reportData.total_sixtyDays.toFixed(2)},${reportData.total_ninetyDays.toFixed(2)},${reportData.grand_total.toFixed(2)}\n`;
    
    // Create and download the CSV file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `AP_Aging_Report_${reportData.report_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Payable</h1>
      </div>
      
      <Tabs defaultValue="aging-report" className="mb-6">
        <TabsList>
          <TabsTrigger value="vendors" onClick={() => router.push('/dashboard/accounts-payable/vendors')}>Vendors</TabsTrigger>
          <TabsTrigger value="bills" onClick={() => router.push('/dashboard/accounts-payable/bills')}>Bills</TabsTrigger>
          <TabsTrigger value="aging-report">Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">AP Aging Report</h2>
        <div className="flex space-x-2">
          <Button onClick={handleRefresh} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={handleExportCSV} variant="outline" disabled={loading || !reportData}>
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button onClick={handlePrint} variant="outline" disabled={loading || !reportData}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <p>Loading aging report...</p>
        </div>
      ) : error ? (
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertCircle className="h-6 w-6 mr-2 text-destructive" />
              <p className="text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      ) : reportData ? (
        <div className="space-y-6 print:text-black">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between">
                <div>
                  <CardTitle>AP Aging Summary</CardTitle>
                  <CardDescription>
                    Report as of {format(parseISO(reportData.report_date), 'MMMM d, yyyy')}
                  </CardDescription>
                </div>
                <div className="text-right print:hidden">
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-2xl font-bold">${reportData.grand_total.toFixed(2)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4">Vendor</th>
                      <th className="text-right py-3 px-4">Current<br/>(0-30 days)</th>
                      <th className="text-right py-3 px-4">31-60 days</th>
                      <th className="text-right py-3 px-4">61-90 days</th>
                      <th className="text-right py-3 px-4">90+ days</th>
                      <th className="text-right py-3 px-4">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.vendors.map((vendor) => (
                      <React.Fragment key={vendor.vendor_id}>
                        <tr 
                          className={`border-b hover:bg-muted/50 cursor-pointer ${vendor.total > 0 ? '' : 'opacity-60'}`}
                          onClick={() => toggleVendorExpand(vendor.vendor_id)}
                        >
                          <td className="py-3 px-4">{vendor.vendor_name}</td>
                          <td className="text-right py-3 px-4">
                            {vendor.current > 0 ? `$${vendor.current.toFixed(2)}` : '-'}
                          </td>
                          <td className="text-right py-3 px-4">
                            {vendor.thirtyDays > 0 ? `$${vendor.thirtyDays.toFixed(2)}` : '-'}
                          </td>
                          <td className="text-right py-3 px-4">
                            {vendor.sixtyDays > 0 ? `$${vendor.sixtyDays.toFixed(2)}` : '-'}
                          </td>
                          <td className="text-right py-3 px-4">
                            {vendor.ninetyDays > 0 ? `$${vendor.ninetyDays.toFixed(2)}` : '-'}
                          </td>
                          <td className="text-right py-3 px-4 font-bold">
                            ${vendor.total.toFixed(2)}
                          </td>
                        </tr>
                        {expandedVendor === vendor.vendor_id && (
                          <tr className="bg-muted/30">
                            <td colSpan={6} className="py-3 px-4">
                              <div className="rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-muted/50">
                                      <th className="text-left py-2 px-3">Bill #</th>
                                      <th className="text-left py-2 px-3">Date</th>
                                      <th className="text-left py-2 px-3">Due Date</th>
                                      <th className="text-right py-2 px-3">Amount</th>
                                      <th className="text-right py-2 px-3">Paid</th>
                                      <th className="text-right py-2 px-3">Balance</th>
                                      <th className="text-left py-2 px-3">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {vendor.bills.map(bill => {
                                      const totalAmount = parseFloat(bill.total_amount.toString());
                                      const amountPaid = parseFloat((bill.amount_paid || 0).toString());
                                      const remainingAmount = totalAmount - amountPaid;
                                      return (
                                        <tr 
                                          key={bill.id} 
                                          className="border-t border-muted hover:bg-muted/40 cursor-pointer"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            router.push(`/dashboard/accounts-payable/bills/${bill.id}`);
                                          }}
                                        >
                                          <td className="py-2 px-3">{bill.bill_number || `#${bill.id}`}</td>
                                          <td className="py-2 px-3">{format(parseISO(bill.bill_date), 'MMM d, yyyy')}</td>
                                          <td className="py-2 px-3">{format(parseISO(bill.due_date), 'MMM d, yyyy')}</td>
                                          <td className="text-right py-2 px-3">${parseFloat(bill.total_amount.toString()).toFixed(2)}</td>
                                          <td className="text-right py-2 px-3">${(parseFloat((bill.amount_paid || 0).toString())).toFixed(2)}</td>
                                          <td className="text-right py-2 px-3 font-medium">${parseFloat(remainingAmount.toString()).toFixed(2)}</td>
                                          <td className="py-2 px-3">
                                            <span className={`inline-block px-2 py-1 rounded-full text-xs ${
                                              bill.status === 'Paid' ? 'bg-green-100 text-green-800' :
                                              bill.status === 'Partially Paid' ? 'bg-amber-100 text-amber-800' :
                                              isAfter(new Date(), parseISO(bill.due_date)) ? 'bg-red-100 text-red-800' :
                                              'bg-blue-100 text-blue-800'
                                            }`}>
                                              {bill.status === 'Open' && isAfter(new Date(), parseISO(bill.due_date)) 
                                                ? 'Overdue' 
                                                : bill.status}
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
                    <tr className="bg-muted/50 font-bold">
                      <td className="py-3 px-4">TOTAL</td>
                      <td className="text-right py-3 px-4">${reportData.total_current.toFixed(2)}</td>
                      <td className="text-right py-3 px-4">${reportData.total_thirtyDays.toFixed(2)}</td>
                      <td className="text-right py-3 px-4">${reportData.total_sixtyDays.toFixed(2)}</td>
                      <td className="text-right py-3 px-4">${reportData.total_ninetyDays.toFixed(2)}</td>
                      <td className="text-right py-3 px-4">${reportData.grand_total.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Aging Distribution</CardTitle>
              <CardDescription>Breakdown of outstanding amounts by aging period</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                {reportData.total_current > 0 && (
                  <div 
                    className="bg-green-500 h-full" 
                    style={{ width: `${(reportData.total_current / reportData.grand_total) * 100}%` }}
                    title={`Current: $${reportData.total_current.toFixed(2)}`}
                  ></div>
                )}
                {reportData.total_thirtyDays > 0 && (
                  <div 
                    className="bg-yellow-500 h-full" 
                    style={{ width: `${(reportData.total_thirtyDays / reportData.grand_total) * 100}%` }}
                    title={`31-60 days: $${reportData.total_thirtyDays.toFixed(2)}`}
                  ></div>
                )}
                {reportData.total_sixtyDays > 0 && (
                  <div 
                    className="bg-orange-500 h-full" 
                    style={{ width: `${(reportData.total_sixtyDays / reportData.grand_total) * 100}%` }}
                    title={`61-90 days: $${reportData.total_sixtyDays.toFixed(2)}`}
                  ></div>
                )}
                {reportData.total_ninetyDays > 0 && (
                  <div 
                    className="bg-red-500 h-full" 
                    style={{ width: `${(reportData.total_ninetyDays / reportData.grand_total) * 100}%` }}
                    title={`90+ days: $${reportData.total_ninetyDays.toFixed(2)}`}
                  ></div>
                )}
              </div>
              
              <div className="grid grid-cols-4 gap-2 mt-3 text-center text-sm">
                <div>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    <span>Current</span>
                  </div>
                  <p className="font-medium">${reportData.total_current.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{((reportData.total_current / reportData.grand_total) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                    <span>31-60 days</span>
                  </div>
                  <p className="font-medium">${reportData.total_thirtyDays.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{((reportData.total_thirtyDays / reportData.grand_total) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                    <span>61-90 days</span>
                  </div>
                  <p className="font-medium">${reportData.total_sixtyDays.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{((reportData.total_sixtyDays / reportData.grand_total) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <div className="flex items-center justify-center space-x-1">
                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                    <span>90+ days</span>
                  </div>
                  <p className="font-medium">${reportData.total_ninetyDays.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">{((reportData.total_ninetyDays / reportData.grand_total) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No data available for the AP aging report.</p>
            <Button onClick={handleRefresh} variant="outline" className="mt-4">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from "@/components/ui/table";
import { ReportDatePicker } from "./ReportDatePicker";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, FileText, Download, Loader2 } from "lucide-react";

interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalance: number;
  creditBalance: number;
}

interface TrialBalanceTotals {
  debits: number;
  credits: number;
  difference: number;
}

export function TrialBalanceReport() {
  const [dateRange, setDateRange] = useState<{
    startDate: string;
    endDate: string;
  }>({
    startDate: format(new Date(), "yyyy-MM-01"), // First day of current month
    endDate: format(new Date(), "yyyy-MM-dd"), // Current day
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TrialBalanceRow[]>([]);
  const [totals, setTotals] = useState<TrialBalanceTotals | null>(null);
  
  const { toast } = useToast();
  
  const generateReport = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to generate reports");
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch("/api/reports/trial-balance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        })
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || "Failed to generate trial balance");
      }
      
      setData(responseData.trialBalance);
      setTotals(responseData.totals);
    } catch (err: any) {
      console.error("Error generating trial balance:", err);
      setError(err.message || "An error occurred while generating the trial balance");
      toast({
        title: "Error",
        description: err.message || "Failed to generate trial balance",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Format currency values
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };
  
  // Handle date range changes
  const handleDateChange = (range: { startDate: string; endDate: string }) => {
    setDateRange(range);
  };
  
  // Export to CSV
  const exportToCSV = () => {
    if (!data.length) return;
    
    const headers = ["Account Code", "Account Name", "Account Type", "Debit Balance", "Credit Balance"];
    const csvRows = [headers.join(",")];
    
    // Add rows
    data.forEach(row => {
      const values = [
        row.accountCode,
        `"${row.accountName.replace(/"/g, '""')}"`, // Escape quotes for CSV
        row.accountType,
        row.debitBalance.toFixed(2),
        row.creditBalance.toFixed(2)
      ];
      csvRows.push(values.join(","));
    });
    
    // Add totals
    if (totals) {
      csvRows.push([
        "",
        `"TOTALS"`,
        "",
        totals.debits.toFixed(2),
        totals.credits.toFixed(2)
      ].join(","));
    }
    
    // Create the CSV blob and trigger download
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `trial_balance_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-bold">Trial Balance</CardTitle>
        <div className="flex space-x-2">
          <ReportDatePicker 
            onChange={handleDateChange}
            defaultRange={{
              from: new Date(dateRange.startDate),
              to: new Date(dateRange.endDate)
            }}
          />
          <Button onClick={generateReport} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
          {data.length > 0 && (
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {data.length > 0 ? (
          <Table>
            <TableCaption>
              Trial Balance for period {format(new Date(dateRange.startDate), "MMMM d, yyyy")} to {format(new Date(dateRange.endDate), "MMMM d, yyyy")}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead className="w-32">Account Type</TableHead>
                <TableHead className="text-right w-40">Debit</TableHead>
                <TableHead className="text-right w-40">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow key={index}>
                  <TableCell className="font-mono">{row.accountCode}</TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell className="capitalize">{row.accountType}</TableCell>
                  <TableCell className="text-right">
                    {row.debitBalance > 0 ? formatCurrency(row.debitBalance) : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.creditBalance > 0 ? formatCurrency(row.creditBalance) : ""}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {totals && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold">TOTALS</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(totals.debits)}</TableCell>
                  <TableCell className="text-right font-bold">{formatCurrency(totals.credits)}</TableCell>
                </TableRow>
                {totals.difference > 0.01 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-bold text-red-500">DIFFERENCE</TableCell>
                    <TableCell colSpan={2} className="text-right font-bold text-red-500">
                      {formatCurrency(totals.difference)}
                    </TableCell>
                  </TableRow>
                )}
              </TableFooter>
            )}
          </Table>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            {isLoading ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Generating trial balance...</p>
              </div>
            ) : (
              <>
                <FileText className="mx-auto h-12 w-12 mb-4 text-muted-foreground/60" />
                <p>Select a date range and click "Generate Report" to view the trial balance.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

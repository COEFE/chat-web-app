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

interface IncomeStatementRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

interface IncomeStatementTotals {
  revenue: number;
  expenses: number;
  netIncome: number;
}

export function IncomeStatementReport() {
  const [dateRange, setDateRange] = useState<{
    startDate: string;
    endDate: string;
  }>({
    startDate: format(new Date(), "yyyy-01-01"), // First day of current year
    endDate: format(new Date(), "yyyy-MM-dd"), // Current day
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IncomeStatementRow[]>([]);
  const [totals, setTotals] = useState<IncomeStatementTotals | null>(null);
  
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
      
      const response = await fetch("/api/reports/income-statement", {
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
        throw new Error(responseData.error || "Failed to generate income statement");
      }
      
      setData(responseData.incomeStatement);
      setTotals(responseData.totals);
    } catch (err: any) {
      console.error("Error generating income statement:", err);
      setError(err.message || "An error occurred while generating the income statement");
      toast({
        title: "Error",
        description: err.message || "Failed to generate income statement",
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
    
    const headers = ["Account Code", "Account Name", "Account Type", "Balance"];
    const csvRows = [headers.join(",")];
    
    // Add rows
    data.forEach(row => {
      const values = [
        row.accountCode,
        `"${row.accountName.replace(/"/g, '""')}"`, // Escape quotes for CSV
        row.accountType,
        row.balance.toFixed(2)
      ];
      csvRows.push(values.join(","));
    });
    
    // Create the CSV blob and trigger download
    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `income_statement_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-bold">Income Statement</CardTitle>
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
              Income Statement for period {format(new Date(dateRange.startDate), "MMMM d, yyyy")} to {format(new Date(dateRange.endDate), "MMMM d, yyyy")}
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead className="w-32">Account Type</TableHead>
                <TableHead className="text-right w-40">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, index) => (
                <TableRow 
                  key={index} 
                  className={
                    row.isTotal 
                      ? "font-bold border-t-2" 
                      : row.isSubtotal 
                        ? "font-semibold border-t" 
                        : ""
                  }
                >
                  <TableCell className="font-mono">{row.accountCode}</TableCell>
                  <TableCell>{row.accountName}</TableCell>
                  <TableCell className="capitalize">
                    {!row.isTotal && !row.isSubtotal ? row.accountType : ""}
                  </TableCell>
                  <TableCell className={`text-right ${row.balance < 0 ? "text-red-600" : ""}`}>
                    {formatCurrency(row.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            {isLoading ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Generating income statement...</p>
              </div>
            ) : (
              <>
                <FileText className="mx-auto h-12 w-12 mb-4 text-muted-foreground/60" />
                <p>Select a date range and click "Generate Report" to view the income statement.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

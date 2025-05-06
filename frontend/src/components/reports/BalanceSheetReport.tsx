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
import { AsOfDatePicker } from "./AsOfDatePicker";
import { useToast } from "@/components/ui/use-toast";
import { AlertCircle, FileText, Download, Loader2 } from "lucide-react";

interface BalanceSheetRow {
  accountCode: string;
  accountName: string;
  accountType: string;
  balance: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
}

interface BalanceSheetTotals {
  assets: number;
  liabilities: number;
  equity: number;
  liabilitiesAndEquity: number;
  difference: number;
}

export function BalanceSheetReport() {
  const [asOfDate, setAsOfDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd") // Current day
  );
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BalanceSheetRow[]>([]);
  const [totals, setTotals] = useState<BalanceSheetTotals | null>(null);
  
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
      
      const response = await fetch("/api/reports/balance-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          asOfDate
        })
      });
      
      const responseData = await response.json();
      
      if (!response.ok) {
        throw new Error(responseData.error || "Failed to generate balance sheet");
      }
      
      setData(responseData.balanceSheet);
      setTotals(responseData.totals);
    } catch (err: any) {
      console.error("Error generating balance sheet:", err);
      setError(err.message || "An error occurred while generating the balance sheet");
      toast({
        title: "Error",
        description: err.message || "Failed to generate balance sheet",
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
  
  // Handle date change
  const handleDateChange = (date: string) => {
    setAsOfDate(date);
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
    link.setAttribute("download", `balance_sheet_as_of_${asOfDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xl font-bold">Balance Sheet</CardTitle>
        <div className="flex space-x-2">
          <AsOfDatePicker 
            onChange={handleDateChange}
            defaultDate={new Date(asOfDate)}
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
              Balance Sheet as of {format(new Date(asOfDate), "MMMM d, yyyy")}
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
            {totals && totals.difference > 0.01 && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-bold text-red-500">OUT OF BALANCE</TableCell>
                  <TableCell className="text-right font-bold text-red-500">
                    {formatCurrency(totals.difference)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        ) : (
          <div className="py-12 text-center text-muted-foreground">
            {isLoading ? (
              <div className="flex flex-col items-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p>Generating balance sheet...</p>
              </div>
            ) : (
              <>
                <FileText className="mx-auto h-12 w-12 mb-4 text-muted-foreground/60" />
                <p>Select a date and click "Generate Report" to view the balance sheet.</p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

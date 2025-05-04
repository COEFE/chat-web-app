"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";

interface JournalSummaryProps {
  startDate?: Date;
  endDate?: Date;
}

interface SummaryData {
  totalJournals: number;
  totalPosted: number;
  totalDebits: number;
  totalCredits: number;
  topAccounts: {
    account_id: number;
    account_code: string;
    account_name: string;
    total_amount: number;
  }[];
}

export function JournalSummary({ startDate, endDate }: JournalSummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSummary();
  }, [startDate, endDate]);

  const fetchSummary = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to view journal summaries");
      }
      
      const token = await user.getIdToken();
      
      // Build query parameters
      const params = new URLSearchParams();
      
      if (startDate) {
        params.append("startDate", format(startDate, "yyyy-MM-dd"));
      }
      
      if (endDate) {
        params.append("endDate", format(endDate, "yyyy-MM-dd"));
      }
      
      const url = `/api/journals/summary${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch journal summary");
      }
      
      setSummaryData(data);
    } catch (err: any) {
      console.error("Error fetching journal summary:", err);
      setError(err.message || "An error occurred while fetching summary data");
    } finally {
      setIsLoading(false);
    }
  };

  // Format currency for display
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Journals Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Journals</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <div className="text-2xl font-bold">
              {summaryData?.totalJournals || 0}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {summaryData?.totalPosted || 0} posted
          </p>
        </CardContent>
      </Card>

      {/* Total Debits Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <div className="text-2xl font-bold">
              {formatCurrency(summaryData?.totalDebits || 0)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Total Credits Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <div className="text-2xl font-bold">
              {formatCurrency(summaryData?.totalCredits || 0)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Balance Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Net Balance</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <div className={`text-2xl font-bold ${
              Math.abs((summaryData?.totalDebits || 0) - (summaryData?.totalCredits || 0)) < 0.01 
                ? 'text-green-500' 
                : 'text-red-500'
            }`}>
              {formatCurrency(
                Math.abs((summaryData?.totalDebits || 0) - (summaryData?.totalCredits || 0))
              )}
              {Math.abs((summaryData?.totalDebits || 0) - (summaryData?.totalCredits || 0)) < 0.01 
                ? ' (Balanced)' 
                : ' (Unbalanced)'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="col-span-full text-sm text-red-500">
          Error: {error}
        </div>
      )}
    </div>
  );
}

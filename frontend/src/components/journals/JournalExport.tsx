"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";

interface JournalExportProps {
  startDate?: Date;
  endDate?: Date;
  searchTerm?: string;
  searchField?: string;
}

export function JournalExport({
  startDate,
  endDate,
  searchTerm,
  searchField,
}: JournalExportProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      // Get authorization token
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("You must be logged in to export journal entries");
      }
      
      const token = await user.getIdToken();
      
      // Build query parameters for filtering
      const params = new URLSearchParams();
      
      if (startDate) {
        params.append("startDate", format(startDate, "yyyy-MM-dd"));
      }
      
      if (endDate) {
        params.append("endDate", format(endDate, "yyyy-MM-dd"));
      }
      
      if (searchTerm && searchField) {
        params.append("searchTerm", searchTerm);
        params.append("searchField", searchField);
      }
      
      // Add export flag
      params.append("export", "true");
      
      // Request CSV data
      const response = await fetch(`/api/journals/export?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to export journal entries");
      }
      
      // Get CSV content
      const csvContent = await response.text();
      
      // Create a Blob and download link
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      
      // Set download attributes
      link.setAttribute("href", url);
      link.setAttribute("download", `journal_entries_${format(new Date(), "yyyy-MM-dd")}.csv`);
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Error exporting journal entries:", err);
      alert(`Export failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Exporting...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" /> Export to CSV
        </>
      )}
    </Button>
  );
}

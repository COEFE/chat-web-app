"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import JournalUpload from "@/components/JournalUpload";

export default function ImportTransactionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("upload");

  const handleSuccess = () => {
    router.push("/dashboard/transactions");
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center mb-6">
        <Button variant="ghost" onClick={() => router.push("/dashboard/transactions")} className="mr-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Transactions
        </Button>
        <h1 className="text-3xl font-bold">Import Transactions</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Import Transactions</CardTitle>
          <CardDescription>
            Upload transaction data from CSV or Excel files
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="upload">Upload File</TabsTrigger>
              <TabsTrigger value="help">Help & Instructions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload">
              <JournalUpload onSuccess={handleSuccess} />
            </TabsContent>
            
            <TabsContent value="help">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium">File Format Instructions</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your CSV or Excel file should include the following columns:
                  </p>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    <li><strong>Date</strong> - Transaction date (required)</li>
                    <li><strong>Memo</strong> - Description of the transaction (required)</li>
                    <li><strong>Account</strong> - GL account code or name (required)</li>
                    <li><strong>Debit</strong> - Debit amount (either debit or credit is required)</li>
                    <li><strong>Credit</strong> - Credit amount (either debit or credit is required)</li>
                    <li><strong>Description</strong> - Additional details (optional)</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium">Sample Format</h3>
                  <div className="border rounded-md overflow-x-auto mt-2">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Memo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        <tr>
                          <td className="px-4 py-2 text-sm text-gray-500">2023-10-15</td>
                          <td className="px-4 py-2 text-sm text-gray-500">Office Supplies</td>
                          <td className="px-4 py-2 text-sm text-gray-500">6100</td>
                          <td className="px-4 py-2 text-sm text-gray-500">150.00</td>
                          <td className="px-4 py-2 text-sm text-gray-500"></td>
                          <td className="px-4 py-2 text-sm text-gray-500">Printer paper and toner</td>
                        </tr>
                        <tr>
                          <td className="px-4 py-2 text-sm text-gray-500">2023-10-15</td>
                          <td className="px-4 py-2 text-sm text-gray-500">Office Supplies</td>
                          <td className="px-4 py-2 text-sm text-gray-500">1000</td>
                          <td className="px-4 py-2 text-sm text-gray-500"></td>
                          <td className="px-4 py-2 text-sm text-gray-500">150.00</td>
                          <td className="px-4 py-2 text-sm text-gray-500">Cash payment</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium">Important Notes</h3>
                  <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                    <li>Each journal entry must balance (total debits must equal total credits)</li>
                    <li>Account codes or names must match existing GL accounts in the system</li>
                    <li>Dates should be in a standard format (YYYY-MM-DD recommended)</li>
                    <li>The system will automatically group related transactions by date and memo</li>
                    <li>Duplicate transactions will be detected and removed automatically</li>
                  </ul>
                </div>
                
                <div className="pt-4">
                  <Button onClick={() => setActiveTab("upload")}>
                    Go to Upload
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

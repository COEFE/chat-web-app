"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ConvertJournalsPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [limit, setLimit] = useState<number>(100);
  const router = useRouter();

  const handleConvert = async () => {
    setIsProcessing(true);
    setResult(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      const response = await fetch("/api/bank-accounts/convert-journals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ limit })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to convert journals");
      }
      
      setResult(data);
      
      toast({
        title: "Conversion Complete",
        description: data.message,
      });
    } catch (err: any) {
      console.error("Error converting journals:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to convert journals to bank transactions",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center space-x-2 mb-6">
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/banking')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Banking
        </Button>
        
        <h1 className="text-2xl font-bold">Convert Journal Entries to Bank Transactions</h1>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Journal to Bank Transaction Converter</CardTitle>
          <CardDescription>
            Convert existing journal entries affecting bank accounts into bank transactions for reconciliation.
            This tool will find journal entries that involve bank accounts and create corresponding bank transactions
            that can be used in the bank reconciliation process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <Label htmlFor="limit">Maximum Journals to Process</Label>
                <Input
                  id="limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 100)}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Limit the number of journals to process at once (1-1000)
                </p>
              </div>
            </div>
            
            <Button 
              onClick={handleConvert} 
              disabled={isProcessing}
              className="w-full md:w-auto"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Convert Journals to Bank Transactions
                </>
              )}
            </Button>
          </div>
          
          {result && (
            <div className="mt-6 p-4 bg-muted rounded-md">
              <h3 className="font-semibold mb-2">Results:</h3>
              <p>Journals Processed: <span className="font-medium">{result.journals_processed}</span></p>
              <p>Bank Transactions Created: <span className="font-medium">{result.transactions_created}</span></p>
              {result.transactions_created > 0 && (
                <p className="mt-4 text-sm">
                  ✅ Your bank transactions are now ready for reconciliation! 
                  <Button
                    variant="link"
                    className="p-0 h-auto text-sm"
                    onClick={() => router.push('/dashboard/banking')}
                  >
                    Go to Banking
                  </Button>
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>About Bank Transaction Conversion</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            This utility helps you convert journal entries that affect bank accounts into bank transactions
            that can be used in the reconciliation process. It will:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Find journal entries that involve bank accounts</li>
            <li>Create corresponding bank transactions with appropriate transaction types</li>
            <li>Link the journal entries to the bank transactions for traceability</li>
            <li>Mark the transactions as "unmatched" so they appear in the reconciliation interface</li>
          </ul>
          
          <p className="text-sm text-muted-foreground">
            Note: This process only needs to be run once for existing journal entries. New journal entries 
            will automatically create bank transactions when they are posted.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import { Loader2, ArrowLeft, FileCode } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export default function RunMigrationPage() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [migrations, setMigrations] = useState<string[]>([]);
  const [selectedMigration, setSelectedMigration] = useState<string>("");
  const router = useRouter();

  // Fetch available migrations
  useEffect(() => {
    // List available migrations in order. Ideally fetched from API, but for now keep in-sync manually.
    const available = [
      "011_create_bank_transactions_table.sql",
      "016_add_bank_transaction_id_to_journal_lines.sql"
    ];
    setMigrations(available);
    setSelectedMigration(available[available.length - 1]);
  }, []);

  const handleRunMigration = async () => {
    if (!selectedMigration) {
      toast({
        title: "Error",
        description: "Please select a migration to run",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      const response = await fetch("/api/run-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${idToken}`
        },
        body: JSON.stringify({ filename: selectedMigration })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to run migration");
      }
      
      toast({
        title: "Migration Complete",
        description: data.message,
      });
      
      // Redirect to convert journals page after successful migration
      router.push('/dashboard/banking/convert-journals');
    } catch (err: any) {
      console.error("Error running migration:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to run migration",
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
        
        <h1 className="text-2xl font-bold">Database Migration</h1>
      </div>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Run Database Migration</CardTitle>
          <CardDescription>
            Apply database schema updates to enable bank reconciliation features.
            This is required to fix the bank transaction linking error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2">
                <Label htmlFor="migration">Select Migration</Label>
                <Select
                  value={selectedMigration}
                  onValueChange={setSelectedMigration}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a migration" />
                  </SelectTrigger>
                  <SelectContent>
                    {migrations.map((migration) => (
                      <SelectItem key={migration} value={migration}>
                        {migration}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <Button 
              onClick={handleRunMigration} 
              disabled={isProcessing || !selectedMigration}
              className="w-full md:w-auto"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running Migration...
                </>
              ) : (
                <>
                  <FileCode className="h-4 w-4 mr-2" />
                  Run Migration
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>About This Migration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            This migration adds a necessary database column to link journal entries with bank transactions.
            After running this migration, you will be able to:
          </p>
          
          <ul className="list-disc pl-6 space-y-2 mb-4">
            <li>Convert existing journal entries to bank transactions</li>
            <li>See these transactions in the bank reconciliation interface</li>
            <li>Automatically create bank transactions when posting new journal entries</li>
          </ul>
          
          <p className="text-sm text-muted-foreground">
            Note: This migration is required only once. After successful completion, you'll be
            redirected to the journal conversion utility to create bank transactions from existing journals.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Check,
  AlertCircle,
  Building,
  Calendar,
  Clock,
  CircleDollarSign,
  FileCheck,
  ChevronRight,
  Plus,
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  institution_name: string;
  gl_account_name: string;
  last_reconciled_date: string | null;
  current_balance?: number;
  is_active: boolean;
}

interface ActiveReconciliation {
  id: number;
  bank_account_id: number;
  bank_account_name: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export default function BankReconciliationPage() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [activeReconciliations, setActiveReconciliations] = useState<ActiveReconciliation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Fetch all bank accounts
  useEffect(() => {
    const fetchBankAccounts = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        // Fetch bank accounts
        const accountsResponse = await fetch("/api/bank-accounts", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!accountsResponse.ok) {
          throw new Error(`Error fetching bank accounts: ${accountsResponse.status}`);
        }
        
        const accountsData = await accountsResponse.json();
        setBankAccounts(accountsData.bankAccounts || []);
        
        // Fetch any active reconciliation sessions
        const reconciliationsResponse = await fetch("/api/bank-accounts/reconciliation/active", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (reconciliationsResponse.ok) {
          const reconciliationsData = await reconciliationsResponse.json();
          setActiveReconciliations(reconciliationsData.activeSessions || []);
        }
      } catch (err: any) {
        console.error("Failed to fetch bank accounts:", err);
        setError(err.message || "Failed to load bank accounts");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBankAccounts();
  }, []);

  const handleStartReconciliation = (accountId: number) => {
    router.push(`/dashboard/banking/reconciliation/${accountId}`);
  };
  
  const handleContinueReconciliation = (session: ActiveReconciliation) => {
    router.push(`/dashboard/banking/reconciliation/${session.bank_account_id}?sessionId=${session.id}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <p>Loading bank accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card className="bg-destructive/10 border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center">
              <AlertCircle className="text-destructive mr-3 h-5 w-5" />
              <p className="text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bank Reconciliation</h1>
        <p className="text-muted-foreground mt-1">
          Reconcile your bank statements with your accounting records
        </p>
      </div>
      
      {activeReconciliations.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardHeader>
            <CardTitle className="flex items-center text-amber-700">
              <Clock className="h-5 w-5 mr-2" />
              Active Reconciliation Sessions
            </CardTitle>
            <CardDescription className="text-amber-600">
              You have reconciliation sessions in progress
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeReconciliations.map((session) => (
                <div 
                  key={session.id} 
                  className="flex items-center justify-between p-4 border rounded-md bg-white"
                >
                  <div>
                    <h3 className="font-medium">{session.bank_account_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      Started {format(new Date(session.created_at), "MMM d, yyyy")} • 
                      Period: {format(new Date(session.start_date), "MMM d")} to {format(new Date(session.end_date), "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button onClick={() => handleContinueReconciliation(session)}>
                    Continue <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts</CardTitle>
          <CardDescription>
            Select a bank account to reconcile
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bankAccounts.length === 0 ? (
            <div className="text-center py-12 border rounded-md">
              <Building className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No Bank Accounts Found</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                You need to create a bank account before you can start reconciling
              </p>
              <Button onClick={() => router.push("/dashboard/banking")}>
                <Plus className="h-4 w-4 mr-2" /> Add Bank Account
              </Button>
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Current Balance</TableHead>
                    <TableHead>Last Reconciled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((account) => {
                    // Check if this account has an active reconciliation
                    const activeSession = activeReconciliations.find(
                      (session) => session.bank_account_id === account.id
                    );
                    
                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{account.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {account.institution_name} • {account.account_number.slice(-4).padStart(account.account_number.length, '•')}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {account.current_balance !== undefined 
                            ? formatCurrency(account.current_balance) 
                            : 'N/A'}
                        </TableCell>
                        <TableCell>
                          {account.last_reconciled_date 
                            ? format(new Date(account.last_reconciled_date), 'MMM d, yyyy')
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          {activeSession ? (
                            <Button 
                              variant="outline" 
                              onClick={() => handleContinueReconciliation(activeSession)}
                              className="whitespace-nowrap"
                            >
                              <Clock className="h-4 w-4 mr-2" />
                              Continue
                            </Button>
                          ) : (
                            <Button 
                              onClick={() => handleStartReconciliation(account.id)}
                              className="whitespace-nowrap"
                            >
                              <FileCheck className="h-4 w-4 mr-2" />
                              Reconcile
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Benefits of Bank Reconciliation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex items-start space-x-3">
              <div className="bg-primary/10 p-3 rounded-full">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Detect Errors</h3>
                <p className="text-sm text-muted-foreground">
                  Identify and correct bookkeeping errors and discrepancies
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="bg-primary/10 p-3 rounded-full">
                <CircleDollarSign className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Prevent Fraud</h3>
                <p className="text-sm text-muted-foreground">
                  Detect unauthorized transactions and potential fraud
                </p>
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <div className="bg-primary/10 p-3 rounded-full">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Accurate Reporting</h3>
                <p className="text-sm text-muted-foreground">
                  Ensure financial reports reflect your actual cash position
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

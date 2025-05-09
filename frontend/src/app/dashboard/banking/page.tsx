"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlusCircle, RefreshCw, Loader2, Building, CreditCard } from "lucide-react";
import { getAuth } from "firebase/auth";
import BankAccountList from "@/components/banking/BankAccountList";
import BankAccountForm from "@/components/banking/BankAccountForm";

export default function BankingPage() {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddAccount, setShowAddAccount] = useState<boolean>(false);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const router = useRouter();

  // Fetch bank accounts
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
        
        const response = await fetch('/api/bank-accounts', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching bank accounts: ${response.status}`);
        }
        
        const data = await response.json();
        setBankAccounts(data.bankAccounts || []);
      } catch (err: any) {
        console.error("Failed to fetch bank accounts:", err);
        setError(err.message || "Failed to load bank accounts");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBankAccounts();
  }, [refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleAccountCreated = () => {
    setShowAddAccount(false);
    handleRefresh();
  };

  return (
    <div className="container mx-auto py-6 space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Banking</h1>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
          
          {!showAddAccount && (
            <Button onClick={() => setShowAddAccount(true)}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Bank Account
            </Button>
          )}
        </div>
      </div>
      
      <Tabs defaultValue="accounts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="accounts">
            <Building className="h-4 w-4 mr-2" />
            Bank Accounts
          </TabsTrigger>
          <TabsTrigger value="reconciliation">
            <CreditCard className="h-4 w-4 mr-2" />
            Reconciliation
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="accounts" className="space-y-4">
          {showAddAccount ? (
            <BankAccountForm 
              onClose={() => setShowAddAccount(false)}
              onAccountCreated={handleAccountCreated}
            />
          ) : isLoading ? (
            <Card>
              <CardContent className="py-10">
                <div className="flex justify-center items-center">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <p>Loading bank accounts...</p>
                </div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="bg-destructive/10 border-destructive">
              <CardContent className="pt-6">
                <div className="flex items-center">
                  <p className="text-destructive">{error}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <BankAccountList 
              accounts={bankAccounts} 
              onRefresh={handleRefresh}
              onSelectAccount={(id) => router.push(`/dashboard/banking/accounts/${id}`)}
            />
          )}
        </TabsContent>
        
        <TabsContent value="reconciliation">
          <Card>
            <CardHeader>
              <CardTitle>Bank Reconciliation</CardTitle>
              <CardDescription>
                Match your bank statement transactions with your accounting records to ensure accuracy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bankAccounts.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">
                    You need to add at least one bank account before you can start reconciliation.
                  </p>
                  <Button onClick={() => setShowAddAccount(true)}>
                    <PlusCircle className="h-4 w-4 mr-2" />
                    Add Bank Account
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-muted-foreground">
                    Select a bank account to reconcile:
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {bankAccounts.map((account) => (
                      <Card 
                        key={account.id}
                        className="cursor-pointer hover:bg-accent"
                        onClick={() => router.push(`/dashboard/banking/reconciliation/${account.id}`)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Building className="h-5 w-5 text-primary" />
                            <div>
                              <h3 className="font-medium">{account.name}</h3>
                              <p className="text-sm text-muted-foreground">
                                {account.gl_account_code} - {account.gl_account_name}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

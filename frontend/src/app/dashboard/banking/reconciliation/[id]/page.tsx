"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Calendar,
  DollarSign,
  AlertCircle,
  FileCheck,
  FileInput,
  Building,
  CircleCheck
} from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

// Import components
import ReconciliationSetup from "@/components/banking/ReconciliationSetup";
import SageStyleReconciliation from "@/components/banking/SageStyleReconciliation";
// Keep TransactionMatcher import for backward compatibility if needed
import TransactionMatcher from "@/components/banking/TransactionMatcher";

interface BankAccount {
  id: number;
  name: string;
  institution_name: string;
  gl_account_name: string;
  last_reconciled_date?: string;
  current_balance?: number;
}

export default function BankReconciliationPage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap params (Promise) using React.use() per Next.js guidance
  const { id } = use(params) as { id: string };
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [currentTab, setCurrentTab] = useState<string>("setup");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [activeSession, setActiveSession] = useState<boolean>(false);
  const router = useRouter();

  // Fetch bank account details and check for active reconciliation session
  useEffect(() => {
    const fetchBankAccountAndSession = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        // Fetch bank account details
        const response = await fetch(`/api/bank-accounts/${id}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching bank account: ${response.status}`);
        }
        
        const data = await response.json();
        // API returns the account directly, not wrapped in a bankAccount property
        setAccount(data);
        
        // Check for active reconciliation session
        const sessionResponse = await fetch(`/api/bank-accounts/${id}/reconciliation`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (sessionResponse.ok) {
          const sessionData = await sessionResponse.json();
          if (sessionData.active_session) {
            setActiveSession(true);
            setSessionId(sessionData.session.id);
            setCurrentTab("match");
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch bank account:", err);
        setError(err.message || "Failed to load bank account details");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBankAccountAndSession();
  }, [id]);

  // Handle reconciliation setup completion
  const handleSetupComplete = (newSessionId: number) => {
    setSessionId(newSessionId);
    setActiveSession(true);
    setCurrentTab("match");
    toast({
      title: "Reconciliation Started",
      description: "You can now begin matching transactions",
    });
  };
  
  // Handle reconciliation completion
  const handleReconciliationComplete = () => {
    toast({
      title: "Reconciliation Completed",
      description: "Bank account has been successfully reconciled",
    });
    router.push(`/dashboard/banking/accounts/${id}`);
  };
  
  // Handle cancel reconciliation
  const handleCancel = () => {
    router.push(`/dashboard/banking/accounts/${id}`);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <p>Loading account details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/banking')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Banking
        </Button>
        
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

  if (!account) {
    return (
      <div className="container mx-auto py-6">
        <Button 
          variant="outline" 
          onClick={() => router.push('/dashboard/banking')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Banking
        </Button>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p>Bank account not found</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{account.name}</h1>
          <p className="text-muted-foreground">
            Account {account.institution_name} • {account.gl_account_name}
          </p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => router.push(`/dashboard/banking/accounts/${id}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Account
        </Button>
      </div>
      
      <Separator />
      
      <Tabs 
        value={currentTab} 
        onValueChange={setCurrentTab}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="setup" disabled={activeSession}>
            <Calendar className="h-4 w-4 mr-2" />
            Setup
          </TabsTrigger>
          <TabsTrigger value="match" disabled={!activeSession}>
            <FileCheck className="h-4 w-4 mr-2" />
            Match Transactions
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="setup" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2 text-primary" />
                  Reconciliation Setup
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activeSession ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  <CircleCheck className="h-12 w-12 text-primary" />
                  <h3 className="text-xl font-medium">Reconciliation In Progress</h3>
                  <p className="text-center text-muted-foreground max-w-md">
                    There is an active reconciliation session for this account. 
                    Continue with the transaction matching process.
                  </p>
                  <Button 
                    onClick={() => setCurrentTab("match")}
                    className="mt-4"
                  >
                    Continue to Matching
                  </Button>
                </div>
              ) : (
                <ReconciliationSetup
                  bankAccountId={parseInt(id, 10)}
                  onComplete={(newSessionId: number) => handleSetupComplete(newSessionId)}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="match" className="mt-6">
          {sessionId && (
            <SageStyleReconciliation
              sessionId={sessionId}
              bankAccountId={parseInt(id, 10)}
              onComplete={handleReconciliationComplete}
              onCancel={handleCancel}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

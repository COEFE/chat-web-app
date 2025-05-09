"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  ArrowLeft,
  RefreshCw,
  Loader2,
  Building,
  Plus,
  UploadCloud,
  Download,
  Search,
  Check,
  FileEdit,
  History
} from "lucide-react";
import BankAccountForm from "@/components/banking/BankAccountForm";
import BankTransactionList from "@/components/banking/BankTransactionList";
import PriorReconciliationsList from '@/components/banking/PriorReconciliationsList';
import { formatCurrency } from "@/lib/formatters";
import { Badge } from '@/components/ui/badge';

interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  institution_name: string;
  routing_number?: string;
  gl_account_id: number;
  gl_account_name: string;
  gl_account_code: string;
  is_active: boolean;
  last_reconciled_date: string | null;
  last_reconciled_balance?: number;
  current_balance?: number;
  created_at: string;
  updated_at: string;
}

export default function BankAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  // unwrap params Promise per Next.js 14 guidance
  const { id } = use(params) as { id: string };
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditForm, setShowEditForm] = useState<boolean>(false);
  const [showPriorReconciliations, setShowPriorReconciliations] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const router = useRouter();

  // Fetch bank account details
  useEffect(() => {
    const fetchBankAccount = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        const response = await fetch(`/api/bank-accounts/${id}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching bank account: ${response.status}`);
        }
        
        const data = await response.json();
        setAccount(data);
      } catch (err: any) {
        console.error("Failed to fetch bank account:", err);
        setError(err.message || "Failed to load bank account details");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBankAccount();
  }, [id, refreshTrigger]);

  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  const handleAccountUpdated = () => {
    setShowEditForm(false);
    handleRefresh();
    toast({
      title: "Bank Account Updated",
      description: "Bank account details have been updated successfully.",
    });
  };

  const handleStartReconciliation = () => {
    router.push(`/dashboard/banking/reconciliation/${id}`);
  };

  const handleViewPriorReconciliations = () => {
    setShowPriorReconciliations(prev => !prev);
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

  if (showEditForm) {
    return (
      <div className="container mx-auto py-6">
        <Button 
          variant="outline" 
          onClick={() => setShowEditForm(false)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Account Details
        </Button>
        
        <BankAccountForm 
          bankAccount={account}
          onClose={() => setShowEditForm(false)}
          onAccountUpdated={handleAccountUpdated}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            onClick={() => router.push('/dashboard/banking')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          
          <h1 className="text-2xl font-bold">{account?.name || 'Bank Account'}</h1>
          
          {account?.is_active && (
            <Badge variant="outline" className="bg-green-100 text-green-800 hover:bg-green-100 ml-2">
              Active
            </Badge>
          )}
          
          {!account?.is_active && (
            <Badge variant="outline" className="bg-red-100 text-red-800 hover:bg-red-100 ml-2">
              Inactive
            </Badge>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="flex items-center"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowEditForm(true)}
            className="flex items-center"
          >
            <FileEdit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Institution</dt>
                <dd className="mt-1 text-sm">{account?.institution_name}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Account Number</dt>
                <dd className="mt-1 text-sm">••••{account?.account_number?.slice(-4)}</dd>
              </div>
              
              {account?.routing_number && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Routing Number</dt>
                  <dd className="mt-1 text-sm">{account?.routing_number}</dd>
                </div>
              )}
              
              <div>
                <dt className="text-sm font-medium text-gray-500">GL Account</dt>
                <dd className="mt-1 text-sm">{account?.gl_account_code} - {account?.gl_account_name}</dd>
              </div>
              
              <div>
                <dt className="text-sm font-medium text-gray-500">Current Balance</dt>
                <dd className="mt-1 text-sm font-semibold">{formatCurrency(account?.current_balance || 0)}</dd>
              </div>
              
              {account?.last_reconciled_date && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Last Reconciled</dt>
                  <dd className="mt-1 text-sm">
                    {format(new Date(account.last_reconciled_date), 'PP')}
                    {account?.last_reconciled_balance !== undefined && (
                      <> • {formatCurrency(account.last_reconciled_balance)}</>
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Manage your bank account</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {/* Reconcile Account */}
              <div
                onClick={handleStartReconciliation}
                className="flex flex-col items-center justify-center p-6 bg-blue-100 rounded-lg hover:bg-blue-200 cursor-pointer transition-colors"
              >
                <Check className="h-6 w-6 mb-2 text-blue-700" />
                <h3 className="font-medium text-blue-700 text-center">Reconcile Account</h3>
                <p className="text-xs text-blue-600 text-center mt-1">Match bank transactions</p>
              </div>

              {/* Import Transactions */}
              <div 
                className="flex flex-col items-center justify-center p-6 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/banking/import?accountId=${account?.id}`)}
              >
                <UploadCloud className="h-6 w-6 mb-2 text-gray-700" />
                <h3 className="font-medium text-gray-700 text-center">Import Transactions</h3>
                <p className="text-xs text-gray-600 text-center mt-1">Upload CSV statements</p>
              </div>
              
              {/* Prior Reconciliations */}
              <div 
                className="flex flex-col items-center justify-center p-6 bg-purple-100 rounded-lg hover:bg-purple-200 cursor-pointer transition-colors"
                onClick={handleViewPriorReconciliations}
              >
                <History className="h-6 w-6 mb-2 text-purple-700" />
                <h3 className="font-medium text-purple-700 text-center">Prior Reconciliations</h3>
                <p className="text-xs text-purple-600 text-center mt-1">View or reopen sessions</p>
              </div>
              
              {/* Add Transaction */}
              <div 
                className="flex flex-col items-center justify-center p-6 bg-green-100 rounded-lg hover:bg-green-200 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/transactions/new?accountId=${account?.id}`)}
              >
                <Plus className="h-6 w-6 mb-2 text-green-700" />
                <h3 className="font-medium text-green-700 text-center">Add Transaction</h3>
                <p className="text-xs text-green-600 text-center mt-1">Manually enter transaction</p>
              </div>
              
              {/* Find Transactions */}
              <div 
                className="flex flex-col items-center justify-center p-6 bg-amber-100 rounded-lg hover:bg-amber-200 cursor-pointer transition-colors"
              >
                <Search className="h-6 w-6 mb-2 text-amber-700" />
                <h3 className="font-medium text-amber-700 text-center">Find Transactions</h3>
                <p className="text-xs text-amber-600 text-center mt-1">Search and filter</p>
              </div>
              
              {/* Export Data */}
              <div 
                className="flex flex-col items-center justify-center p-6 bg-sky-100 rounded-lg hover:bg-sky-200 cursor-pointer transition-colors"
              >
                <Download className="h-6 w-6 mb-2 text-sky-700" />
                <h3 className="font-medium text-sky-700 text-center">Export Data</h3>
                <p className="text-xs text-sky-600 text-center mt-1">Download as CSV</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {account && showPriorReconciliations && (
        <div className="animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-semibold">Prior Reconciliation Sessions</h2>
            <Button variant="ghost" onClick={handleViewPriorReconciliations} size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Hide</Button>
          </div>
          <PriorReconciliationsList bankAccountId={account.id.toString()} />
        </div>
      )}
      
      {account && (
        <div className="mt-6">
          <h2 className="text-2xl font-semibold mb-4">Recent Transactions</h2>
          <BankTransactionList bankAccountId={account.id} />
        </div>
      )}
    </div>
  );
}

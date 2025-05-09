"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/use-toast";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import TransactionImportForm from "@/components/banking/TransactionImportForm";
import { ArrowLeft, Building } from "lucide-react";

interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  gl_account_id: number;
  current_balance: number;
}

export default function BankImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [bankAccount, setBankAccount] = useState<BankAccount | null>(null);

  // Get bank account ID from query parameters
  const bankAccountId = searchParams.get("accountId");

  useEffect(() => {
    // If no bank account ID is provided, redirect to the banking page
    if (!bankAccountId) {
      router.push("/dashboard/banking");
      return;
    }
    
    // Fetch bank account details
    const fetchBankAccount = async () => {
      try {
        setIsLoading(true);
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          toast({
            title: "Authentication error",
            description: "You must be logged in to view this page",
            variant: "destructive",
          });
          router.push("/login");
          return;
        }
        
        const idToken = await user.getIdToken();
        
        const response = await fetch(`/api/bank-accounts/${bankAccountId}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch bank account");
        }
        
        const data = await response.json();
        setBankAccount(data.bankAccount);
      } catch (error) {
        console.error("Error fetching bank account:", error);
        toast({
          title: "Error",
          description: "Failed to load bank account details",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchBankAccount();
  }, [bankAccountId, router]);

  const handleImportComplete = () => {
    // Redirect back to bank account details page
    router.push(`/dashboard/banking/accounts/${bankAccountId}`);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
        <div>
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard/banking">Banking</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              {bankAccount && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink href={`/dashboard/banking/accounts/${bankAccountId}`}>
                      {bankAccount.name}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage>Import Transactions</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          
          <h1 className="text-3xl font-bold tracking-tight">Import Bank Transactions</h1>
          {bankAccount && (
            <p className="text-muted-foreground">
              Import transactions for {bankAccount.name} - {bankAccount.account_number}
            </p>
          )}
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => router.back()}
          className="w-full md:w-auto"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
      
      {isLoading ? (
        <Card>
          <CardContent className="py-10">
            <div className="flex justify-center items-center h-40">
              <div className="text-center">
                <Building className="w-12 h-12 mx-auto mb-4 text-primary/30 animate-pulse" />
                <p className="text-muted-foreground">Loading bank account details...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        bankAccount && (
          <TransactionImportForm
            bankAccountId={bankAccount.id}
            onClose={() => router.back()}
            onImportComplete={handleImportComplete}
          />
        )
      )}
    </div>
  );
}

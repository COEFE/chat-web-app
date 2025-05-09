"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { getAuth } from "firebase/auth";
import { AccountingNav } from "@/components/dashboard/AccountingNav";

export default function ARSetupPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const runMigration = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/db-migrations/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          migrationFile: 'accounts-receivable-setup.sql'
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setResult({
          success: true,
          message: 'Accounts Receivable database setup completed successfully'
        });
        toast({
          title: "Setup Complete",
          description: "Accounts Receivable database has been set up successfully",
        });
      } else {
        setResult({
          success: false,
          message: data.error || 'An error occurred during setup'
        });
        toast({
          title: "Setup Failed",
          description: data.error || 'An error occurred during setup',
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Setup error:', error);
      setResult({
        success: false,
        message: error.message || 'An unexpected error occurred'
      });
      toast({
        title: "Setup Error",
        description: error.message || 'An unexpected error occurred',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-6">
      <AccountingNav />
      
      <h1 className="text-3xl font-bold mb-6">Accounts Receivable Setup</h1>
      
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>Database Setup</CardTitle>
          <CardDescription>
            Set up the required database tables for Accounts Receivable functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>
            This will create all the necessary tables for Accounts Receivable:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Customers</li>
            <li>Invoices</li>
            <li>Invoice Lines</li>
            <li>Invoice Payments</li>
          </ul>
          
          {result && (
            <Alert variant={result.success ? "default" : "destructive"} className="mt-4">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertTitle>{result.success ? 'Success' : 'Error'}</AlertTitle>
              </div>
              <AlertDescription className="mt-2">
                {result.message}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button 
            onClick={runMigration} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting Up...
              </>
            ) : (
              'Run Database Setup'
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

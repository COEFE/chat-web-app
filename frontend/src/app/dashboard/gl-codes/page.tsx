"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import GLCodeUpload from "@/components/GLCodeUpload";
import GLCodeForm from "@/components/GLCodeForm"; // Import GLCodeForm
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Database } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/context/AuthContext";

interface Account {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  parent_code: string | null;
  notes: string | null;
  is_custom: boolean;
}

export default function GLCodesPage() {
  const [activeTab, setActiveTab] = useState("upload");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingClearGLCodes, setLoadingClearGLCodes] = useState<boolean>(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Auto-run DB setup on mount
  useEffect(() => {
    if (!user) return;
    (async () => {
      const token = await user?.getIdToken();
      if (!token) return;
      try {
        await fetch('/api/accounts/db-setup', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        console.error('[accounts] auto-setup error', e);
      }
    })();
  }, [user]);

  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      // Get Firebase token
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('You must be logged in to access chart of accounts');
      }
      // Fetch accounts
      const res = await fetch('/api/accounts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.setupRequired) {
          toast({
            title: "Setting up accounts...",
            description: "Initializing chart of accounts database",
            variant: "default",
          });
          // Already ran db-setup above, retry fetch
          return fetchAccounts();
        }
        throw new Error(data.error || 'Failed to fetch accounts');
      }
      setAccounts(data.accounts || []);
    } catch (error) {
      // If token invalid or unauthorized, redirect to login
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        router.push('/login');
        return;
      }
      console.error('Error fetching accounts:', error);
      toast({
        title: "Error fetching accounts",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  async function clearGLCodes() {
    setLoadingClearGLCodes(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');
      const res = await fetch('/api/clear-gl-codes', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clear failed');
      toast({ title: 'GL Codes Cleared', description: data.message });
      fetchAccounts();
    } catch (err: any) {
      toast({ title: 'Clear error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingClearGLCodes(false);
    }
  }

  // Fetch accounts when viewing the manage tab
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "manage") {
      fetchAccounts();
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">GL Code Management</h1>
      </div>
        
        <Tabs defaultValue="upload" onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="upload" className="flex items-center">
              <Upload className="w-4 h-4 mr-2" />
              Upload GL Codes
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center">
              <Database className="w-4 h-4 mr-2" />
              Manage Accounts
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="space-y-4">
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Upload or Create GL Codes</CardTitle>
                <CardDescription>
                  Upload your chart of accounts or create individual GL codes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <GLCodeUpload />
                <div className="border-t pt-6">
                  <h3 className="text-lg font-medium">Add Custom GL Code</h3>
                  <GLCodeForm />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="manage" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Manage Chart of Accounts</CardTitle>
                  <CardDescription>
                    View and manage your chart of accounts.
                  </CardDescription>
                </div>
                <div className="space-x-2">
                  <Button variant="outline" onClick={fetchAccounts} disabled={isLoading || loadingClearGLCodes}>
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
                  </Button>
                  <Button variant="destructive" onClick={clearGLCodes} disabled={loadingClearGLCodes || isLoading}>
                    {loadingClearGLCodes ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clear"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : accounts.length > 0 ? (
                  <div className="border rounded-md overflow-auto max-h-[500px]">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-200 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Parent</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Notes</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">Custom</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-black">
                        {accounts.map((acc) => (
                          <tr key={acc.id} className="odd:bg-white even:bg-gray-100">
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">{acc.code}</td>
                            <td className="px-4 py-2 text-sm">{acc.name}</td>
                            <td className="px-4 py-2 text-sm">{acc.parent_code || '-'}</td>
                            <td className="px-4 py-2 text-sm">{acc.notes || '-'}</td>
                            <td className="px-4 py-2 text-sm">{acc.is_custom ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No accounts found. Populate the chart using the upload tab.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
    </div>
  );
}

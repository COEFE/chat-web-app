"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { AccountTree, AccountNode } from "@/components/accounts/AccountTree";
import { AccountForm } from "@/components/accounts/AccountForm";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountNode[]>([]);
  const [flatAccounts, setFlatAccounts] = useState<AccountNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("hierarchy");
  
  // Dialog states
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountNode | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);
  
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();

  // Fetch accounts on component mount
  useEffect(() => {
    if (!user) {
      router.push("/login");
      return;
    }
    
    fetchAccounts();
  }, [user, router]);

  // Fetch accounts from API
  const fetchAccounts = async () => {
    setIsLoading(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      
      const res = await fetch("/api/accounts/hierarchy", {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch accounts");
      }
      
      const data = await res.json();
      setAccounts(data.accounts || []);
      setFlatAccounts(data.flatAccounts || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch accounts",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle adding a new account
  const handleAddAccount = (parentId: number | null = null) => {
    setSelectedAccount(null);
    setSelectedParentId(parentId);
    setShowAccountForm(true);
  };

  // Handle editing an existing account
  const handleEditAccount = (account: AccountNode) => {
    setSelectedAccount(account);
    setSelectedParentId(null);
    setShowAccountForm(true);
  };

  // Handle deleting an account
  const handleDeleteAccount = (account: AccountNode) => {
    setSelectedAccount(account);
    setShowDeleteDialog(true);
  };

  // Submit account form (create or update)
  const handleSubmitAccount = async (values: any) => {
    setIsSubmitting(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      
      let url = "/api/accounts";
      let method = "POST";
      
      // If editing an existing account, use PATCH method
      if (selectedAccount) {
        url = `/api/accounts/${selectedAccount.id}`;
        method = "PATCH";
      }
      
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save account");
      }
      
      toast({
        title: selectedAccount ? "Account Updated" : "Account Created",
        description: `${values.name} has been ${selectedAccount ? "updated" : "created"} successfully.`,
      });
      
      // Refresh accounts list
      fetchAccounts();
      
      // Close form dialog
      setShowAccountForm(false);
    } catch (error) {
      console.error("Error saving account:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save account",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirm account deletion
  const confirmDeleteAccount = async () => {
    if (!selectedAccount) return;
    
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication required");
      
      const res = await fetch(`/api/accounts/${selectedAccount.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete account");
      }
      
      toast({
        title: "Account Deleted",
        description: `${selectedAccount.name} has been deleted successfully.`,
      });
      
      // Refresh accounts list
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting account:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete account",
        variant: "destructive",
      });
    } finally {
      setShowDeleteDialog(false);
      setSelectedAccount(null);
    }
  };

  // Filter accounts based on search query
  const filteredFlatAccounts = searchQuery
    ? flatAccounts.filter(
        (account) =>
          account.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          account.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : flatAccounts;

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Chart of Accounts</h1>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center"
            onClick={fetchAccounts}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="flex items-center"
            onClick={() => handleAddAccount()}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="hierarchy">Hierarchy View</TabsTrigger>
          <TabsTrigger value="flat">Flat View</TabsTrigger>
        </TabsList>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts by code or name..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <TabsContent value="hierarchy">
          <Card>
            <CardHeader>
              <CardTitle>Account Hierarchy</CardTitle>
              <CardDescription>
                Chart of accounts organized in a hierarchical structure
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No accounts found. Click "Add Account" to create one.
                </div>
              ) : (
                <AccountTree
                  accounts={accounts}
                  onAddAccount={handleAddAccount}
                  onEditAccount={handleEditAccount}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flat">
          <Card>
            <CardHeader>
              <CardTitle>All Accounts</CardTitle>
              <CardDescription>
                Complete list of all accounts in the chart of accounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredFlatAccounts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery
                    ? "No accounts match your search criteria."
                    : "No accounts found. Click 'Add Account' to create one."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-4">Code</th>
                        <th className="text-left py-2 px-4">Name</th>
                        <th className="text-left py-2 px-4">Parent</th>
                        <th className="text-left py-2 px-4">Type</th>
                        <th className="text-right py-2 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFlatAccounts.map((account) => {
                        const parentAccount = flatAccounts.find(
                          (a) => a.id === account.parent_id
                        );
                        
                        return (
                          <tr
                            key={account.id}
                            className="border-b hover:bg-muted/50"
                          >
                            <td className="py-2 px-4 font-mono">{account.code}</td>
                            <td className="py-2 px-4">{account.name}</td>
                            <td className="py-2 px-4">
                              {parentAccount
                                ? `${parentAccount.code} - ${parentAccount.name}`
                                : "None"}
                            </td>
                            <td className="py-2 px-4">
                              {account.is_custom ? "Custom" : "Default"}
                            </td>
                            <td className="py-2 px-4 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditAccount(account)}
                              >
                                Edit
                              </Button>
                              {account.is_custom && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive"
                                  onClick={() => handleDeleteAccount(account)}
                                >
                                  Delete
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Form Dialog */}
      <Dialog open={showAccountForm} onOpenChange={setShowAccountForm}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {selectedAccount ? "Edit Account" : "Create New Account"}
            </DialogTitle>
            <DialogDescription>
              {selectedAccount
                ? "Update the details of an existing account"
                : "Add a new account to the chart of accounts"}
            </DialogDescription>
          </DialogHeader>
          <AccountForm
            account={selectedAccount || undefined}
            parentId={selectedParentId}
            availableParents={flatAccounts.filter(a => 
              // Don't allow an account to be its own parent
              selectedAccount ? a.id !== selectedAccount.id : true
            )}
            onSubmit={handleSubmitAccount}
            onCancel={() => setShowAccountForm(false)}
            isSubmitting={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the account{" "}
              <strong>
                {selectedAccount?.code} - {selectedAccount?.name}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteAccount}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

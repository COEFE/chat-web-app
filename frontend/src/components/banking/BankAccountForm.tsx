import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Save, X } from "lucide-react";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Define form schema with validation
const bankAccountSchema = z.object({
  name: z.string().min(1, { message: "Bank account name is required" }),
  institution_name: z.string().min(1, { message: "Institution name is required" }),
  account_number: z.string().min(1, { message: "Account number is required" }),
  routing_number: z.string().optional(),
  gl_account_id: z.string().min(1, { message: "GL account is required" }),
  is_active: z.boolean().optional(),
});

type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

// Account type for GL account select
interface Account {
  id: number;
  code: string;
  name: string;
  type: string;
}

interface BankAccountFormProps {
  bankAccount?: any; // Existing bank account for editing (optional)
  onClose: () => void;
  onAccountCreated?: () => void;
  onAccountUpdated?: () => void;
}

export default function BankAccountForm({
  bankAccount,
  onClose,
  onAccountCreated,
  onAccountUpdated,
}: BankAccountFormProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFetchingAccounts, setIsFetchingAccounts] = useState<boolean>(true);

  // Initialize form with default values or existing account data
  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(bankAccountSchema),
    defaultValues: {
      name: bankAccount?.name || "",
      institution_name: bankAccount?.institution_name || "",
      account_number: bankAccount?.account_number || "",
      routing_number: bankAccount?.routing_number || "",
      gl_account_id: bankAccount?.gl_account_id ? bankAccount.gl_account_id.toString() : "",
      is_active: typeof bankAccount?.is_active === 'boolean' ? bankAccount.is_active : true,
    },
  });

  // Fetch GL accounts for dropdown
  useEffect(() => {
    const fetchAccounts = async () => {
      setIsFetchingAccounts(true);
      
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        const response = await fetch('/api/accounts', {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching accounts: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Sort accounts by code
        const sortedAccounts = data.accounts.sort((a: Account, b: Account) => (
          a.code.localeCompare(b.code)
        ));
        
        setAccounts(sortedAccounts);
      } catch (err: any) {
        console.error("Failed to fetch accounts:", err);
        toast({
          title: "Error",
          description: "Failed to load GL accounts. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsFetchingAccounts(false);
      }
    };
    
    fetchAccounts();
  }, []);

  const onSubmit = async (data: BankAccountFormValues) => {
    setIsLoading(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      let response;
      
      if (bankAccount) {
        // Update existing bank account
        response = await fetch(`/api/bank-accounts/${bankAccount.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            name: data.name,
            institution_name: data.institution_name,
            account_number: data.account_number,
            routing_number: data.routing_number || null,
            gl_account_id: parseInt(data.gl_account_id),
            is_active: data.is_active ?? true,
          })
        });
      } else {
        // Create new bank account
        response = await fetch('/api/bank-accounts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            name: data.name,
            institution_name: data.institution_name,
            account_number: data.account_number,
            routing_number: data.routing_number || null,
            gl_account_id: parseInt(data.gl_account_id),
            is_active: data.is_active ?? true,
          })
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        console.log('Bank account error response:', errorData);
        throw new Error(
          (errorData.error ? `${errorData.error}: ${errorData.details || ''}` : `Error ${bankAccount ? 'updating' : 'creating'} bank account: ${response.status}`)
        );
      }
      
      toast({
        title: bankAccount ? "Bank Account Updated" : "Bank Account Created",
        description: `Bank account was successfully ${bankAccount ? 'updated' : 'created'}.`,
      });
      
      // Call appropriate callback
      if (bankAccount && onAccountUpdated) {
        onAccountUpdated();
      } else if (!bankAccount && onAccountCreated) {
        onAccountCreated();
      }
      
      onClose();
    } catch (err: any) {
      console.error(`Error ${bankAccount ? 'updating' : 'creating'} bank account:`, err);
      toast({
        title: "Error",
        description: err.message || `Failed to ${bankAccount ? 'update' : 'create'} bank account`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{bankAccount ? "Edit Bank Account" : "Add Bank Account"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Business Checking" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="institution_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Institution Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Chase Bank" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>
                      This is stored securely and only the last 4 digits will be displayed.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="routing_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Routing Number (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="gl_account_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>General Ledger Account</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    disabled={isFetchingAccounts}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id.toString()}>
                          {account.code} - {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    This GL account represents this bank account in your chart of accounts.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Active Account</FormLabel>
                    <FormDescription>
                      Inactive accounts won't show up in default account lists.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || isFetchingAccounts}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              {bankAccount ? "Update" : "Save"} Bank Account
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}

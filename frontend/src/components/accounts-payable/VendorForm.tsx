"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { getAuth } from "firebase/auth";

// Define the validation schema
const vendorFormSchema = z.object({
  name: z.string().min(1, "Vendor name is required"),
  contact_person: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  phone: z.string().optional(),
  address: z.string().optional(),
  default_expense_account_id: z.string().optional(),
});

type VendorFormValues = z.infer<typeof vendorFormSchema>;

interface Account {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface Vendor {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  default_expense_account_id?: number;
  default_expense_account_name?: string;
}

interface VendorFormProps {
  vendor: Vendor | null;
  onClose: (refreshData?: boolean) => void;
  standalone?: boolean; // When true, render without a dialog
}

export function VendorForm({ vendor, onClose, standalone = false }: VendorFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Initialize the form
  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorFormSchema),
    defaultValues: {
      name: vendor?.name || "",
      contact_person: vendor?.contact_person || "",
      email: vendor?.email || "",
      phone: vendor?.phone || "",
      address: vendor?.address || "",
      default_expense_account_id: vendor?.default_expense_account_id?.toString() || "",
    },
  });

  // Fetch all general ledger accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      setIsLoadingAccounts(true);
      
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Fetch all accounts without type filter
        const response = await fetch("/api/accounts", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching accounts: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Sort all accounts by code
        const sortedAccounts = data.accounts
          .sort((a: Account, b: Account) => a.code.localeCompare(b.code));
        
        setAccounts(sortedAccounts);
      } catch (err: any) {
        console.error("Error fetching general ledger accounts:", err);
        toast({
          title: "Error",
          description: "Failed to load general ledger accounts",
          variant: "destructive",
        });
      } finally {
        setIsLoadingAccounts(false);
      }
    };

    fetchAccounts();
  }, [toast]);

  // Handle form submission
  const onSubmit = async (data: VendorFormValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      const payload = {
        vendor: {
          name: data.name,
          contact_person: data.contact_person || null,
          email: data.email || null,
          phone: data.phone || null,
          address: data.address || null,
          default_expense_account_id: (data.default_expense_account_id && data.default_expense_account_id !== "None") ? 
            parseInt(data.default_expense_account_id) : null,
        }
      };
      
      let response;
      if (vendor) {
        // Update existing vendor
        response = await fetch(`/api/vendors/${vendor.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create new vendor
        response = await fetch('/api/vendors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify(payload)
        });
      }
      
      if (!response.ok) {
        throw new Error(`Error ${vendor ? 'updating' : 'creating'} vendor: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: vendor ? "Vendor Updated" : "Vendor Created",
        description: `${data.name} was successfully ${vendor ? 'updated' : 'created'}.`,
      });
      
      // Close the form and refresh data
      onClose(true);
    } catch (err: any) {
      console.error(`Error ${vendor ? 'updating' : 'creating'} vendor:`, err);
      toast({
        title: "Error",
        description: err.message || `Failed to ${vendor ? 'update' : 'create'} vendor`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Choose rendering based on standalone mode
  const renderForm = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vendor Name*</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter vendor name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="contact_person"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contact Person</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Primary contact name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="contact@vendor.com" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="(123) 456-7890" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Enter address" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="default_expense_account_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Default Account</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
                disabled={isLoadingAccounts}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a general ledger account" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                The default general ledger account for this vendor's transactions.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="mt-6 flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={() => onClose()} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || isLoadingAccounts}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {vendor ? 'Updating...' : 'Creating...'}
              </>
            ) : (
              <>{vendor ? 'Update Vendor' : 'Create Vendor'}</>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
  
  // Render based on standalone mode
  return standalone ? (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h2>
        <p className="text-sm text-muted-foreground">
          {vendor ? 'Update vendor information' : 'Add a new vendor to your accounts payable'}
        </p>
      </div>
      {renderForm()}
    </div>
  ) : (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{vendor ? 'Edit Vendor' : 'Add Vendor'}</DialogTitle>
          <DialogDescription>
            {vendor ? 'Update vendor information' : 'Add a new vendor to your accounts payable'}
          </DialogDescription>
        </DialogHeader>
        {renderForm()}
      </DialogContent>
    </Dialog>
  );
}

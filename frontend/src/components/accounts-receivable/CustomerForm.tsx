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

// Define validation schema
const customerFormSchema = z.object({
  name: z.string().min(1, "Customer name is required"),
  contact_person: z.string().optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal('')),
  phone: z.string().optional(),
  billing_address: z.string().optional(),
  shipping_address: z.string().optional(),
  default_revenue_account_id: z.string().optional(),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface Account {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface Customer {
  id: number;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  billing_address?: string;
  shipping_address?: string;
  default_revenue_account_id?: number;
  default_revenue_account_name?: string;
  created_at: string;
  updated_at: string;
}

interface CustomerFormProps {
  customer: Customer | null;
  onClose: (refreshData?: boolean) => void;
}

export function CustomerForm({ customer, onClose }: CustomerFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize form with default or customer data
  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: customer?.name || "",
      contact_person: customer?.contact_person || "",
      email: customer?.email || "",
      phone: customer?.phone || "",
      billing_address: customer?.billing_address || "",
      shipping_address: customer?.shipping_address || "",
      default_revenue_account_id: customer?.default_revenue_account_id?.toString() || "",
    },
  });

  // Fetch revenue accounts
  useEffect(() => {
    const fetchAccounts = async () => {
      setIsLoading(true);
      
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        const response = await fetch("/api/accounts", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching accounts: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Sort all accounts by code for the dropdown
        const sortedAccounts = data.accounts
          .sort((a: Account, b: Account) => a.code.localeCompare(b.code));
        
        // Set all accounts to be available in the dropdown
        setAccounts(sortedAccounts);
      } catch (err: any) {
        console.error("Error fetching accounts:", err);
        toast({
          title: "Error",
          description: "Failed to load revenue accounts",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [toast]);

  // Handle form submission
  const onSubmit = async (data: CustomerFormValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      let response;
      
      if (customer) {
        // Update existing customer
        response = await fetch(`/api/customers/${customer.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            customer: {
              name: data.name,
              contact_person: data.contact_person || null,
              email: data.email || null,
              phone: data.phone || null,
              billing_address: data.billing_address || null,
              shipping_address: data.shipping_address || null,
              default_revenue_account_id: data.default_revenue_account_id ? parseInt(data.default_revenue_account_id) : null,
            }
          })
        });
      } else {
        // Create new customer
        response = await fetch('/api/customers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            name: data.name,
            contact_person: data.contact_person || null,
            email: data.email || null,
            phone: data.phone || null,
            billing_address: data.billing_address || null,
            shipping_address: data.shipping_address || null,
            default_revenue_account_id: data.default_revenue_account_id ? parseInt(data.default_revenue_account_id) : null,
          })
        });
      }
      
      if (!response.ok) {
        throw new Error(`Error ${customer ? 'updating' : 'creating'} customer: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: customer ? "Customer Updated" : "Customer Created",
        description: `Customer was successfully ${customer ? 'updated' : 'created'}.`,
      });
      
      // Close the form and refresh data
      onClose(true);
    } catch (err: any) {
      console.error(`Error ${customer ? 'updating' : 'creating'} customer:`, err);
      toast({
        title: "Error",
        description: err.message || `Failed to ${customer ? 'update' : 'create'} customer`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Copy shipping address from billing address
  const copyBillingAddress = () => {
    const billingAddress = form.getValues('billing_address');
    form.setValue('shipping_address', billingAddress);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add New Customer"}</DialogTitle>
          <DialogDescription>
            {customer
              ? "Update the customer information below."
              : "Fill in the details to create a new customer record."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Name */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name*</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Contact Person */}
                <FormField
                  control={form.control}
                  name="contact_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contact Person</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Default Revenue Account */}
                <FormField
                  control={form.control}
                  name="default_revenue_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Default Revenue Account</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an account" />
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Phone */}
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Billing Address */}
              <FormField
                control={form.control}
                name="billing_address"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center">
                      <FormLabel>Billing Address</FormLabel>
                    </div>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Shipping Address */}
              <FormField
                control={form.control}
                name="shipping_address"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between items-center">
                      <FormLabel>Shipping Address</FormLabel>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        onClick={copyBillingAddress}
                        className="h-7 text-xs"
                      >
                        Copy from Billing
                      </Button>
                    </div>
                    <FormControl>
                      <Textarea {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => onClose()} 
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {customer ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>{customer ? "Update" : "Create"} Customer</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

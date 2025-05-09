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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/use-toast";
import { CalendarDays, Calendar as CalendarIcon, Loader2, DollarSign } from "lucide-react";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Define validation schema
const paymentFormSchema = z.object({
  payment_date: z.date({
    required_error: "Payment date is required",
  }),
  amount_received: z.string().min(1, "Payment amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Amount must be a positive number"
  ),
  deposit_to_account_id: z.string().min(1, "Deposit account is required"),
  payment_method: z.string().optional(),
  reference_number: z.string().optional(),
  create_journal_entry: z.boolean().default(true),
});

// Update type definition to match schema
type PaymentFormValues = z.infer<typeof paymentFormSchema>;

interface Account {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface Invoice {
  id: number;
  customer_id: number;
  customer_name: string;
  invoice_number?: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  ar_account_id: number;
  ar_account_name: string;
}

interface InvoicePaymentFormProps {
  invoice: Invoice;
  onClose: (refreshData?: boolean) => void;
}

export function InvoicePaymentForm({ invoice, onClose }: InvoicePaymentFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [maxAmount, setMaxAmount] = useState(0);

  // List of payment methods
  const paymentMethods = [
    "Credit Card",
    "Bank Transfer",
    "Check",
    "Cash",
    "PayPal",
    "Other"
  ];

  // Initialize form with default values
  const form = useForm({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      payment_date: new Date(),
      amount_received: (invoice.total_amount - invoice.amount_paid).toFixed(2),
      deposit_to_account_id: "",
      payment_method: "",
      reference_number: "",
      create_journal_entry: true,
    },
  });

  // Calculate maximum payment amount
  useEffect(() => {
    if (invoice) {
      const remainingBalance = invoice.total_amount - invoice.amount_paid;
      setMaxAmount(remainingBalance);
    }
  }, [invoice]);

  // Fetch bank/asset accounts for deposit
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
        
        // Filter for deposit accounts (bank, cash, other assets)
        const depositAccounts = data.accounts
          .filter((account: Account) => {
            // Include all asset accounts
            if (account.type && account.type.toLowerCase() === 'asset') {
              return true;
            }
            
            // Include accounts with bank/cash-related names regardless of type
            if (account.name && (
              account.name.toLowerCase().includes('cash') || 
              account.name.toLowerCase().includes('bank') ||
              account.name.toLowerCase().includes('deposit') ||
              account.name.toLowerCase().includes('checking') ||
              account.name.toLowerCase().includes('savings')
            )) {
              return true;
            }
            
            // Include accounts with 1xxx code prefix (typical asset accounts)
            if (account.code && account.code.startsWith('1')) {
              return true;
            }
            
            return false;
          })
          .sort((a: Account, b: Account) => a.code.localeCompare(b.code));
        
        setAccounts(depositAccounts);
      } catch (err: any) {
        console.error("Error fetching accounts:", err);
        toast({
          title: "Error",
          description: "Failed to load deposit accounts",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchAccounts();
  }, [toast]);

  // Handle form submission
  const onSubmit = async (data: PaymentFormValues) => {
    setIsSubmitting(true);
    
    try {
      const amountReceived = parseFloat(data.amount_received);
      
      // Validate payment amount
      if (amountReceived <= 0) {
        throw new Error("Payment amount must be greater than zero");
      }
      
      if (amountReceived > maxAmount) {
        throw new Error(`Payment amount cannot exceed the remaining balance (${maxAmount.toFixed(2)})`);
      }
      
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Format date
      const formattedPaymentDate = format(data.payment_date, 'yyyy-MM-dd');
      
      // Submit payment
      const response = await fetch(`/api/invoices/${invoice.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          payment: {
            payment_date: formattedPaymentDate,
            amount_received: amountReceived,
            deposit_to_account_id: parseInt(data.deposit_to_account_id),
            payment_method: data.payment_method || null,
            reference_number: data.reference_number || null,
            create_journal_entry: data.create_journal_entry
          }
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error recording payment: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: "Payment Recorded",
        description: `Payment of ${formatCurrency(amountReceived)} was successfully recorded.`,
      });
      
      // Close the form and refresh data
      onClose(true);
    } catch (err: any) {
      console.error("Error recording payment:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment for Invoice #{invoice.invoice_number}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Form {...form as any}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Invoice Summary */}
              <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Total Amount:</span>
                  <span>
                    {formatCurrency(invoice.total_amount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Amount Paid:</span>
                  <span>
                    {formatCurrency(invoice.amount_paid)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="text-sm font-medium">Balance Due:</span>
                  <span className="font-bold">
                    {formatCurrency(maxAmount)}
                  </span>
                </div>
              </div>

              {/* Payment Date */}
              <FormField
                control={form.control as any}
                name="payment_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Payment Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Amount Received */}
              <FormField
                control={form.control as any}
                name="amount_received"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Amount*</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                        <Input {...field} type="number" step="0.01" min="0.01" max={maxAmount} className="pl-9" />
                      </div>
                    </FormControl>
                    <FormDescription>
                      Maximum payment: {formatCurrency(maxAmount)}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Deposit Account */}
              <FormField
                control={form.control as any}
                name="deposit_to_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Deposit Account*</FormLabel>
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

              {/* Payment Method */}
              <FormField
                control={form.control as any}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Payment Method</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a payment method" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Reference Number */}
              <FormField
                control={form.control as any}
                name="reference_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Check #, Transaction ID, etc." />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Create Journal Entry */}
              <FormField
                control={form.control as any}
                name="create_journal_entry"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Create Journal Entry</FormLabel>
                      <FormDescription>
                        Automatically create a journal entry for this payment
                      </FormDescription>
                    </div>
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
                      Recording...
                    </>
                  ) : (
                    <>Record Payment</>
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

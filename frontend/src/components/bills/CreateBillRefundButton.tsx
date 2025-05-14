"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { format } from 'date-fns';

// Define the form schema with Zod
const refundFormSchema = z.object({
  refund_date: z.string().min(1, { message: "Refund date is required" }),
  amount: z.string().refine(
    (val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    },
    { message: "Amount must be a positive number" }
  ),
  refund_account_id: z.string().min(1, { message: "Refund account is required" }),
  refund_method: z.string().optional(),
  reference_number: z.string().optional(),
  reason: z.string().optional(),
});

type RefundFormValues = z.infer<typeof refundFormSchema>;

interface CreateBillRefundButtonProps {
  billId: number;
  billNumber?: string;
  amountPaid: number;
  onRefundCreated?: () => void;
  accounts: { id: number; name: string; code: string }[];
}

export default function CreateBillRefundButton({
  billId,
  billNumber,
  amountPaid,
  onRefundCreated,
  accounts
}: CreateBillRefundButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  // Set up form with default values
  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: {
      refund_date: format(new Date(), 'yyyy-MM-dd'),
      amount: '',
      refund_account_id: '',
      refund_method: '',
      reference_number: '',
      reason: '',
    },
  });

  const onSubmit = async (data: RefundFormValues) => {
    setIsLoading(true);
    
    try {
      // Get the current user and ID token from Firebase
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Authentication Error",
          description: "No authenticated user found. Please log in again.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      // Get the ID token
      const idToken = await user.getIdToken(true);
      
      // Prepare the refund data
      const refundData = {
        bill_id: billId,
        refund_date: data.refund_date,
        amount: parseFloat(data.amount),
        refund_account_id: parseInt(data.refund_account_id),
        refund_method: data.refund_method || undefined,
        reference_number: data.reference_number || undefined,
        reason: data.reason || undefined,
      };
      
      // Make the API request
      const response = await fetch('/api/bill-refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(refundData),
      });
      
      const result = await response.json();
      
      if (response.ok) {
        toast({
          title: "Refund Created",
          description: `Successfully created refund for bill ${billNumber || billId}`,
        });
        
        // Close the dialog
        setIsOpen(false);
        
        // Call the onRefundCreated callback if provided
        if (onRefundCreated) {
          onRefundCreated();
        }
        
        // Refresh the page to show the updated bill
        router.refresh();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create refund",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error creating refund:", error);
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button 
        onClick={() => setIsOpen(true)}
        variant="outline"
      >
        Create Refund
      </Button>
      
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Refund for Bill {billNumber || billId}</DialogTitle>
            <DialogDescription>
              Enter the refund details below. The refund amount cannot exceed the paid amount of {amountPaid}.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="refund_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01" 
                        min="0.01" 
                        max={amountPaid.toString()} 
                        placeholder="0.00" 
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum refund amount: {amountPaid}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="refund_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund Account</FormLabel>
                    <FormControl>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        {...field}
                      >
                        <option value="">Select an account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.code} - {account.name}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>
                      Select the account that will receive the refund
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="refund_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Refund Method</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Check, ACH, Credit Card" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="reference_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Check #, Transaction ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reason</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter the reason for the refund" 
                        className="min-h-[80px]" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsOpen(false)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Refund'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

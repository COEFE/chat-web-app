import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAuth } from "firebase/auth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CalendarIcon, Edit } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Define form schema with validation
const updateSchema = z.object({
  end_date: z.date({
    required_error: "End date is required",
  }),
  bank_statement_balance: z.coerce.number({
    required_error: "Statement balance is required",
    invalid_type_error: "Must be a valid number",
  }),
});

type UpdateValues = z.infer<typeof updateSchema>;

interface StatementUpdateDialogProps {
  bankAccountId: string | number;
  sessionId: string | number;
  currentEndDate: string;
  currentBalance: number;
  onUpdate: (newEndDate: string, newBalance: number) => void;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "link" | "destructive" | "secondary";
}

export default function StatementUpdateDialog({
  bankAccountId,
  sessionId,
  currentEndDate,
  currentBalance,
  onUpdate,
  className,
  variant = "outline",
}: StatementUpdateDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form with current values
  const form = useForm<UpdateValues>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      end_date: currentEndDate ? new Date(currentEndDate) : new Date(),
      bank_statement_balance: currentBalance,
    },
  });

  const onSubmit = async (data: UpdateValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      // Update reconciliation session
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/update`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          end_date: format(data.end_date, 'yyyy-MM-dd'),
          bank_statement_balance: data.bank_statement_balance,
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error updating reconciliation: ${response.status}`);
      }
      
      const responseData = await response.json();
      
      toast.success("Statement details updated successfully");
      
      // Call callback with updated data
      onUpdate(
        format(data.end_date, 'yyyy-MM-dd'),
        data.bank_statement_balance
      );
      
      // Close the dialog
      setIsOpen(false);
    } catch (err: any) {
      console.error("Error updating reconciliation:", err);
      toast.error(err.message || "Failed to update reconciliation details");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" className={className}>
          <Edit className="h-4 w-4 mr-2" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Statement Details</DialogTitle>
          <DialogDescription>
            Update the statement end date and balance as needed for reconciliation.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="end_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Statement End Date</FormLabel>
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
                            format(field.value, "MMM d, yyyy")
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
                        disabled={(date) => date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    The end date on your bank statement
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="bank_statement_balance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statement Ending Balance</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    The ending balance shown on your bank statement
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CalendarIcon } from "lucide-react";
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
import { format, addDays, startOfMonth, endOfMonth } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

// Define form schema with validation
const reconciliationSetupSchema = z.object({
  start_date: z.date({
    required_error: "Start date is required",
  }),
  end_date: z.date({
    required_error: "End date is required",
  }),
  bank_statement_balance: z.coerce.number({
    required_error: "Ending balance is required",
    invalid_type_error: "Must be a valid number",
  }),
});

type ReconciliationSetupValues = z.infer<typeof reconciliationSetupSchema>;

interface ReconciliationSetupProps {
  bankAccountId: number;
  onComplete: (sessionId: number) => void;
}

export default function ReconciliationSetup({ bankAccountId, onComplete }: ReconciliationSetupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [lastReconciled, setLastReconciled] = useState<Date | null>(null);
  const [bookBalance, setBookBalance] = useState<number | null>(null);

  // Initialize form with default values
  const form = useForm<ReconciliationSetupValues>({
    resolver: zodResolver(reconciliationSetupSchema),
    defaultValues: {
      start_date: startOfMonth(new Date()),
      end_date: endOfMonth(new Date()),
      bank_statement_balance: 0,
    },
  });
  
  // Fetch bank account details to get last reconciled date and current balance
  useEffect(() => {
    const fetchBankAccountDetails = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        const response = await fetch(`/api/bank-accounts/${bankAccountId}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching bank account: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Set last reconciled date if available
        if (data.last_reconciled_date) {
          setLastReconciled(new Date(data.last_reconciled_date));
          
          // Set start date to the day after last reconciliation
          const nextDay = addDays(new Date(data.last_reconciled_date), 1);
          form.setValue('start_date', nextDay);
        }
        
        // Set current book balance
        if (data.current_balance !== undefined) {
          setBookBalance(data.current_balance);
        }
      } catch (err) {
        console.error("Failed to fetch bank account details:", err);
      }
    };
    
    fetchBankAccountDetails();
  }, [bankAccountId, form]);

  const onSubmit = async (data: ReconciliationSetupValues) => {
    setIsLoading(true);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      // Create reconciliation session
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          start_date: format(data.start_date, 'yyyy-MM-dd'),
          end_date: format(data.end_date, 'yyyy-MM-dd'),
          bank_statement_balance: data.bank_statement_balance,
        })
      });
      
      // Parse response (try JSON, else raw string)
      const rawText = await response.text();
      let responseData: any;
      try {
        responseData = rawText ? JSON.parse(rawText) : {};
      } catch {
        responseData = { raw: rawText };
      }
      
      console.error('Reconciliation API error response:', responseData);
      if (!response.ok) {
        // If an active session already exists, the API responds with 409 and returns the sessionId we should use instead
        if (response.status === 409) {
          // Try response body first
          if (responseData.sessionId) {
            toast({
              title: "Active Reconciliation Session",
              description: "There is already an in-progress reconciliation for this account. Redirecting you to that session…",
            });
            onComplete(responseData.sessionId);
            return;
          }
          // Fallback: fetch latest active session
          try {
            const activeRes = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation`, {
              headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (activeRes.ok) {
              const activeData = await activeRes.json();
              if (activeData.active_session && activeData.session?.id) {
                toast({
                  title: "Active Reconciliation Session",
                  description: "Redirecting you to the existing session…",
                });
                onComplete(activeData.session.id);
                return;
              }
            }
          } catch (_err) {}
        }
        throw new Error(responseData.error || responseData.details || responseData.raw || `Error creating reconciliation session: ${response.status}`);
      }
      
      // Extract session ID
      const sessionId = responseData.sessionId;
      
      if (!sessionId) {
        throw new Error('No session ID returned from server');
      }
      
      toast({
        title: "Reconciliation Started",
        description: "Your reconciliation session has been set up successfully.",
      });
      
      // Call callback to move to next step with the session ID
      onComplete(sessionId);
    } catch (err: any) {
      console.error("Error setting up reconciliation:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to set up reconciliation",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Reconciliation Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="max-w-2xl mx-auto">
          <div className="mb-6 bg-muted/30 p-4 rounded-lg">
            <h3 className="font-medium mb-2">Current Book Balance</h3>
            <p className="text-xl font-bold">
              {bookBalance !== null ? formatCurrency(bookBalance) : 'Loading...'}
            </p>
            {lastReconciled && (
              <p className="text-sm text-muted-foreground mt-2">
                Last reconciled on {format(lastReconciled, 'MMMM d, yyyy')}
              </p>
            )}
          </div>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="start_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Statement Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant={"outline"}
                                className={cn(
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "MMMM d, yyyy")
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
                              disabled={(date) =>
                                date > new Date() || (lastReconciled ? date <= lastReconciled : false)
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          The first day of your bank statement period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
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
                                  "pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value ? (
                                  format(field.value, "MMMM d, yyyy")
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
                              disabled={(date) =>
                                date > new Date() || 
                                date < form.getValues("start_date")
                              }
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          The last day of your bank statement period
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="bank_statement_balance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bank Statement Ending Balance</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            $
                          </span>
                          <Input 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                            className="pl-8"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        The ending balance from your bank statement
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="pt-2 space-y-4">
                <div className="bg-muted/30 p-4 rounded-lg">
                  <h3 className="font-medium mb-2">Next Steps</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    After setting up your reconciliation period, you'll need to:
                  </p>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1 pl-2">
                    <li>Upload or import your bank transactions</li>
                    <li>Match them with your accounting records</li>
                    <li>Review and complete the reconciliation</li>
                  </ol>
                </div>
                
                <div className="flex justify-between items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => window.history.back()}
                  >
                    Cancel
                  </Button>
                  
                  <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Continue to Transaction Matching
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </div>
      </CardContent>
    </Card>
  );
}

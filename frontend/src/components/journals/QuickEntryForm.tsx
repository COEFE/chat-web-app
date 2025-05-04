"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, AlertCircle, DollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AccountNode } from "@/components/accounts/AccountTree";

// Define form schema with zod
const journalLineSchema = z.object({
  account_id: z.string({
    required_error: "Account is required",
  }),
  debit: z.string().optional(),
  credit: z.string().optional(),
  description: z.string().optional(),
});

const journalFormSchema = z.object({
  date: z.date({
    required_error: "Date is required",
  }),
  memo: z.string().min(2, {
    message: "Memo must be at least 2 characters.",
  }),
  source: z.string().optional(),
  lines: z.array(journalLineSchema)
    .min(2, {
      message: "Journal must have at least 2 lines",
    })
    .refine(
      (lines) => {
        // Calculate total debits and credits
        const totalDebit = lines.reduce((sum, line) => {
          const debitValue = parseFloat(line.debit || "0");
          return sum + (isNaN(debitValue) ? 0 : debitValue);
        }, 0);
        
        const totalCredit = lines.reduce((sum, line) => {
          const creditValue = parseFloat(line.credit || "0");
          return sum + (isNaN(creditValue) ? 0 : creditValue);
        }, 0);
        
        // Check if they balance (with small rounding tolerance)
        return Math.abs(totalDebit - totalCredit) < 0.01;
      },
      {
        message: "Journal entry must balance (total debits must equal total credits)",
        path: ["lines"],
      }
    ),
});

type JournalFormValues = z.infer<typeof journalFormSchema>;

interface QuickEntryFormProps {
  accounts: AccountNode[];
  onSubmit: (values: JournalFormValues) => Promise<void>;
  isSubmitting: boolean;
}

export function QuickEntryForm({
  accounts,
  onSubmit,
  isSubmitting,
}: QuickEntryFormProps) {
  // Flatten accounts for select dropdown
  const flatAccounts = flattenAccounts(accounts);
  
  // Calculate totals for the form
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [isBalanced, setIsBalanced] = useState(false);
  const [difference, setDifference] = useState(0);
  const [showImbalanceTooltip, setShowImbalanceTooltip] = useState(false);

  // Initialize form with default values
  const form = useForm<JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: {
      date: new Date(),
      memo: "",
      source: "",
      lines: [
        { account_id: "", debit: "", credit: "", description: "" },
        { account_id: "", debit: "", credit: "", description: "" },
      ],
    },
    mode: "onChange", // Enable real-time validation
  });

  // Use field array for dynamic journal lines
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  // Watch form values to calculate totals
  const formValues = form.watch();

  // Calculate totals when form values change
  useEffect(() => {
    let debitTotal = 0;
    let creditTotal = 0;

    formValues.lines.forEach((line) => {
      const debitValue = parseFloat(line.debit || "0");
      const creditValue = parseFloat(line.credit || "0");

      if (!isNaN(debitValue)) {
        debitTotal += debitValue;
      }

      if (!isNaN(creditValue)) {
        creditTotal += creditValue;
      }
    });

    const diff = debitTotal - creditTotal;
    
    setTotalDebit(debitTotal);
    setTotalCredit(creditTotal);
    setDifference(diff);
    setIsBalanced(Math.abs(diff) < 0.01);
    
    // Only show tooltip when there's an actual imbalance and user has started entering data
    setShowImbalanceTooltip(Math.abs(diff) >= 0.01 && (debitTotal > 0 || creditTotal > 0));
  }, [formValues]);

  // Function to add a new line
  const addLine = () => {
    append({ account_id: "", debit: "", credit: "", description: "" });
  };

  // Handle form submission
  const handleSubmit = async (values: JournalFormValues) => {
    try {
      await onSubmit(values);
      
      // Reset form after successful submission
      form.reset({
        date: new Date(),
        memo: "",
        source: "",
        lines: [
          { account_id: "", debit: "", credit: "", description: "" },
          { account_id: "", debit: "", credit: "", description: "" },
        ],
      });
    } catch (error) {
      console.error("Error submitting journal entry:", error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Date Field */}
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Date</FormLabel>
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
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Memo Field */}
          <FormField
            control={form.control}
            name="memo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Memo</FormLabel>
                <FormControl>
                  <Input placeholder="Enter memo" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Source Field */}
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Source</FormLabel>
                <FormControl>
                  <Input placeholder="Optional source" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Journal Lines */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Journal Lines</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="flex items-center"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
          </div>

          {/* Quick Entry Table */}
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-4 font-medium">Account</th>
                  <th className="text-right py-2 px-4 font-medium">Debit</th>
                  <th className="text-right py-2 px-4 font-medium">Credit</th>
                  <th className="text-left py-2 px-4 font-medium">Description</th>
                  <th className="py-2 px-4 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr key={field.id} className="border-b last:border-b-0">
                    {/* Account Select */}
                    <td className="py-2 px-4">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.account_id`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {flatAccounts.map((account) => (
                                    <SelectItem
                                      key={account.id}
                                      value={account.id.toString()}
                                    >
                                      {account.code} - {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    {/* Debit Input */}
                    <td className="py-2 px-4">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.debit`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="text-right"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  // Clear credit if debit has a value
                                  if (e.target.value) {
                                    form.setValue(`lines.${index}.credit`, "");
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    {/* Credit Input */}
                    <td className="py-2 px-4">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.credit`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                className="text-right"
                                {...field}
                                onChange={(e) => {
                                  field.onChange(e);
                                  // Clear debit if credit has a value
                                  if (e.target.value) {
                                    form.setValue(`lines.${index}.debit`, "");
                                  }
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    {/* Description Input */}
                    <td className="py-2 px-4">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.description`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                placeholder="Description"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>

                    {/* Remove Button */}
                    <td className="py-2 px-4">
                      {fields.length > 2 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                          onClick={() => remove(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Remove</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}

                {/* Totals Row */}
                <tr className="bg-muted/50 font-medium">
                  <td className="py-2 px-4 text-right">Totals:</td>
                  <td className="py-2 px-4 text-right">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(totalDebit)}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(totalCredit)}
                  </td>
                  <td colSpan={2} className="py-2 px-4">
                    {showImbalanceTooltip ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center">
                              <Badge variant={isBalanced ? "outline" : "destructive"} className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {isBalanced ? "Balanced" : "Imbalanced"}
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {isBalanced ? (
                              <p className="text-sm text-green-600">Journal entry is balanced.</p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-destructive">Journal entry is out of balance:</p>
                                <p className="text-xs">
                                  {difference > 0 ? "Debit exceeds credit by " : "Credit exceeds debit by "}
                                  {new Intl.NumberFormat("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  }).format(Math.abs(difference))}
                                </p>
                                <p className="text-xs mt-1">
                                  {difference > 0 
                                    ? "Add more credit entries or reduce debit amounts." 
                                    : "Add more debit entries or reduce credit amounts."}
                                </p>
                              </div>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      !isBalanced && (
                        <span className="text-destructive text-sm">
                          Out of balance:{" "}
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: "USD",
                          }).format(Math.abs(totalDebit - totalCredit))}
                        </span>
                      )
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Balance Warning */}
        {!isBalanced && formValues.lines.some(line => line.debit || line.credit) && (
          <Alert variant={showImbalanceTooltip ? "destructive" : "default"} className="relative">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Journal Entry Imbalance</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              <p>Journal entry is out of balance. Total debits must equal total credits.</p>
              <div className="text-sm mt-1">
                <span className="font-medium">Difference:</span>{" "}
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(Math.abs(difference))}
                {difference > 0 ? " (more debits)" : " (more credits)"}
              </div>
              <div className="text-sm mt-1">
                <span className="font-medium">Suggestion:</span>{" "}
                {difference > 0 
                  ? `Add a credit of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(difference))}` 
                  : `Add a debit of ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(difference))}`}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-2">
          <Button type="submit" disabled={isSubmitting || !isBalanced}>
            {isSubmitting ? "Saving..." : "Create Journal"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// Helper function to flatten the account hierarchy for the select dropdown
function flattenAccounts(accounts: AccountNode[]): AccountNode[] {
  const result: AccountNode[] = [];
  
  function traverse(account: AccountNode) {
    result.push(account);
    if (account.children && account.children.length > 0) {
      account.children.forEach(traverse);
    }
  }
  
  accounts.forEach(traverse);
  return result;
}

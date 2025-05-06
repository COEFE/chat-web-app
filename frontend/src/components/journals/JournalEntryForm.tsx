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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  lines: z.array(journalLineSchema).min(1, {
    message: "At least one journal line is required",
  }),
});

// Define form values type
export type JournalFormValues = z.infer<typeof journalFormSchema>;

export interface JournalEntryFormProps {
  journalId?: number;
  defaultValues?: JournalFormValues;
  accounts: AccountNode[] | { accounts: AccountNode[], flatAccounts: any[] };
  onSubmit: (values: JournalFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

// Helper function to flatten account hierarchy
const flattenAccounts = (accounts: AccountNode[]): AccountNode[] => {
  const result: AccountNode[] = [];
  
  const traverse = (account: AccountNode) => {
    result.push(account);
    if (account.children && account.children.length > 0) {
      account.children.forEach(traverse);
    }
  };
  
  accounts.forEach(traverse);
  return result;
};

export function JournalEntryForm({ 
  accounts = [], 
  onSubmit, 
  onCancel, 
  defaultValues, 
  isSubmitting = false 
}: JournalEntryFormProps) {
  // Add explicit error message when accounts are missing
  const [accountsError, setAccountsError] = useState<string | null>(null);
  
  // Check if accounts data is valid
  useEffect(() => {
    const accountsArray = Array.isArray(accounts) ? accounts : accounts.accounts;
    const flatAccountsArray = Array.isArray(accounts) ? [] : (accounts.flatAccounts || []);
    
    if (!accountsArray || accountsArray.length === 0) {
      if (flatAccountsArray.length === 0) {
        setAccountsError("No accounts available. Please ensure accounts are set up before creating journal entries.");
      } else {
        // We have flat accounts but no hierarchical accounts
        setAccountsError(null);
      }
    } else {
      setAccountsError(null);
    }
  }, [accounts]);
  
  // Get flattened accounts for select dropdown
  const flatAccounts = Array.isArray(accounts) 
    ? flattenAccounts(accounts)
    : (accounts.flatAccounts || []); 
  
  // Debug the accounts data structure
  useEffect(() => {
    console.log("Accounts received in JournalEntryForm:", accounts);
    console.log("Using flat accounts length:", flatAccounts.length);
  }, [accounts]);
  
  // Calculate totals for the form
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [isBalanced, setIsBalanced] = useState(false);
  const [difference, setDifference] = useState(0);

  // Initialize form with default values
  const form = useForm<JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: defaultValues || {
      date: new Date(),
      memo: "",
      source: "",
      lines: [
        {
          account_id: "",
          debit: "",
          credit: "",
          description: "",
        },
        {
          account_id: "",
          debit: "",
          credit: "",
          description: "", 
        },
      ],
    },
  });

  // Set up field array for journal lines
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  // Watch form values for validation
  const formValues = form.watch();

  // Calculate totals and update balance status when form values change
  useEffect(() => {
    let debitSum = 0;
    let creditSum = 0;

    formValues.lines.forEach((line) => {
      const debitValue = line.debit ? parseFloat(line.debit) : 0;
      const creditValue = line.credit ? parseFloat(line.credit) : 0;

      if (!isNaN(debitValue)) {
        debitSum += debitValue;
      }
      
      if (!isNaN(creditValue)) {
        creditSum += creditValue;
      }
    });

    setTotalDebit(debitSum);
    setTotalCredit(creditSum);
    
    const diff = Math.abs(debitSum - creditSum);
    setDifference(diff);
    setIsBalanced(diff < 0.01); // Allow for small rounding errors
  }, [formValues]);

  // Handle form submission
  const handleSubmit = (values: JournalFormValues) => {
    // Validate that debits = credits
    if (!isBalanced) {
      form.setError("root", {
        type: "manual",
        message: "Journal entry must be balanced (debits must equal credits)",
      });
      return;
    }
    
    // Call onSubmit callback with validated values
    onSubmit(values);
  };

  // Handle adding a new line
  const addLine = () => {
    append({
      account_id: "",
      debit: "",
      credit: "",
      description: "",
    });
  };

  return (
    <div>
      {accountsError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{accountsError}</AlertDescription>
        </Alert>
      )}
      
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
                            "pl-3 text-left font-normal",
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
                  <FormDescription>
                    Date of the journal entry
                  </FormDescription>
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
                  <FormLabel>Source (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Source document or reference..." {...field} />
                  </FormControl>
                  <FormDescription>
                    Source document reference
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Memo Field */}
          <FormField
            control={form.control}
            name="memo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Memo</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Description of this journal entry..."
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  A clear description of the purpose of this entry
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Journal Lines Table */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <FormLabel>Journal Lines</FormLabel>
              <div className="flex items-center space-x-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Badge
                          variant={isBalanced ? "outline" : "destructive"}
                          className={`${
                            isBalanced ? "bg-green-50" : "bg-destructive/10"
                          } cursor-default`}
                        >
                          {isBalanced
                            ? "Entry is balanced"
                            : `Out of balance by $${difference.toFixed(2)}`}
                        </Badge>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        Journal entries must be balanced, meaning total debits
                        must equal total credits.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="border rounded-md">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-sm">
                      Account
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-sm">
                      Description
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-sm">
                      Debit
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-sm">
                      Credit
                    </th>
                    <th className="px-3 py-2 text-center font-medium text-sm w-10">
                      {/* Actions */}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field, index) => (
                    <tr key={field.id} className="border-b">
                      <td className="p-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.account_id`}
                          render={({ field }) => (
                            <FormItem>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                                disabled={flatAccounts.length === 0}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                  </SelectTrigger>
                                </FormControl>
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
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </td>
                      <td className="p-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  placeholder="Description..."
                                  {...field}
                                  value={field.value || ""}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </td>
                      <td className="p-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.debit`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <div className="relative">
                                  <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    className="pl-8 text-right"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      // Clear credit if debit has a value
                                      if (e.target.value) {
                                        form.setValue(
                                          `lines.${index}.credit`,
                                          ""
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </td>
                      <td className="p-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.credit`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <div className="relative">
                                  <DollarSign className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    className="pl-8 text-right"
                                    {...field}
                                    value={field.value || ""}
                                    onChange={(e) => {
                                      field.onChange(e);
                                      // Clear debit if credit has a value
                                      if (e.target.value) {
                                        form.setValue(
                                          `lines.${index}.debit`,
                                          ""
                                        );
                                      }
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </td>
                      <td className="p-2 text-center">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t">
                    <td colSpan={2} className="px-3 py-2 text-right font-medium">
                      Totals:
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ${totalDebit.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ${totalCredit.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-1" /> Add Line
            </Button>
          </div>

          {form.formState.errors.root && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {form.formState.errors.root.message}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end space-x-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || accountsError !== null}>
              {isSubmitting ? "Saving..." : "Save Journal Entry"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

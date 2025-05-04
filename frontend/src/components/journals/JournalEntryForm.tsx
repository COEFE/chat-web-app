"use client";

import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray } from "react-hook-form";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, AlertCircle } from "lucide-react";

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
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

interface JournalEntryFormProps {
  journalId?: number;
  defaultValues?: JournalFormValues;
  accounts: AccountNode[];
  onSubmit: (values: JournalFormValues) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function JournalEntryForm({
  journalId,
  defaultValues,
  accounts,
  onSubmit,
  onCancel,
  isSubmitting,
}: JournalEntryFormProps) {
  // Flatten accounts for select dropdown
  const flatAccounts = flattenAccounts(accounts);
  
  // Calculate totals for the form
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [isBalanced, setIsBalanced] = useState(false);

  // Initialize form with default values
  const form = useForm<JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: defaultValues || {
      date: new Date(),
      memo: "",
      source: "",
      lines: [
        { account_id: "", debit: "", credit: "", description: "" },
        { account_id: "", debit: "", credit: "", description: "" },
      ],
    },
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

    setTotalDebit(debitTotal);
    setTotalCredit(creditTotal);
    setIsBalanced(Math.abs(debitTotal - creditTotal) < 0.01);
  }, [formValues]);

  // Handle form submission
  const handleSubmit = (values: JournalFormValues) => {
    // Process the values before submitting
    const processedValues = {
      ...values,
      lines: values.lines.map((line) => ({
        ...line,
        debit: line.debit ? parseFloat(line.debit) : 0,
        credit: line.credit ? parseFloat(line.credit) : 0,
      })),
    };
    
    onSubmit(processedValues);
  };

  // Handle adding a new line
  const addLine = () => {
    append({ account_id: "", debit: "", credit: "", description: "" });
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

          {/* Memo Field */}
          <FormField
            control={form.control}
            name="memo"
            render={({ field }) => (
              <FormItem className="col-span-2">
                <FormLabel>Memo</FormLabel>
                <FormControl>
                  <Input placeholder="Description of the journal entry" {...field} />
                </FormControl>
                <FormDescription>
                  Brief description of the journal entry
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Source Field */}
        <FormField
          control={form.control}
          name="source"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source</FormLabel>
              <FormControl>
                <Input placeholder="Source document or reference (optional)" {...field} />
              </FormControl>
              <FormDescription>
                Optional reference to source document (e.g., invoice number)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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

          {/* Journal Lines Table */}
          <div className="border rounded-md">
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
                                placeholder="Line description (optional)"
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
                    {!isBalanced && (
                      <span className="text-destructive text-sm">
                        Out of balance:{" "}
                        {new Intl.NumberFormat("en-US", {
                          style: "currency",
                          currency: "USD",
                        }).format(Math.abs(totalDebit - totalCredit))}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Balance Warning */}
        {!isBalanced && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Journal entry is out of balance. Total debits must equal total credits.
            </AlertDescription>
          </Alert>
        )}

        {/* Form Actions */}
        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !isBalanced}>
            {isSubmitting
              ? "Saving..."
              : journalId
              ? "Update Journal"
              : "Create Journal"}
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

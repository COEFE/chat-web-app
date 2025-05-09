"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import * as z from "zod";
import { AccountNode } from "@/components/accounts/AccountTree";
import { JournalTypeSelector } from "@/components/journals/JournalTypeSelector";
import { CalendarIcon, PlusCircle, Trash2, AlertCircle, FileUp } from "lucide-react";
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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Define the schema for journal lines
const journalLineSchema = z.object({
  line_number: z.number(),
  account_id: z.number({
    required_error: "Account is required",
  }),
  description: z.string().optional(),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional(),
  category: z.string().optional(),
  location: z.string().optional(),
  vendor: z.string().optional(),
  funder: z.string().optional(),
});

// Define the schema for the entire journal form
const journalFormSchema = z.object({
  journal_type: z.string({
    required_error: "Journal type is required",
  }),
  transaction_date: z.date({
    required_error: "Date is required",
  }),
  memo: z.string().min(1, {
    message: "Memo is required",
  }),
  source: z.string().optional(),
  reference_number: z.string().optional(),
  lines: z.array(journalLineSchema).min(1, {
    message: "At least one journal line is required",
  }).refine(
    (lines) => {
      // Calculate total debits and credits
      const totalDebits = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
      const totalCredits = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
      
      // Check if they are equal (allowing for small rounding differences)
      return Math.abs(totalDebits - totalCredits) < 0.01;
    },
    {
      message: "Total debits must equal total credits",
      path: ["lines"], // This will show the error at the lines level
    }
  ),
});

// Define the form values type
type JournalFormValues = z.infer<typeof journalFormSchema>;

// Define props for the component
interface TransactionGridProps {
  accounts: AccountNode[] | { accounts: AccountNode[], flatAccounts: any[] };
  onSubmit: (values: JournalFormValues) => Promise<void>;
  defaultValues?: Partial<JournalFormValues>;
}

export function TransactionGrid({ accounts, onSubmit, defaultValues }: TransactionGridProps) {
  // Extract the actual account array depending on the data structure
  const accountsArray = Array.isArray(accounts) ? accounts : (accounts.accounts || []);
  // If we have flatAccounts directly, use them
  const initialFlatAccounts = Array.isArray(accounts) ? [] : (accounts.flatAccounts || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [balanceStatus, setBalanceStatus] = useState<'balanced' | 'unbalanced' | null>(null);
  const [difference, setDifference] = useState(0);
  
  // Initialize the form
  const form = useForm<JournalFormValues>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: {
      journal_type: defaultValues?.journal_type || "GJ",
      transaction_date: defaultValues?.transaction_date || new Date(),
      memo: defaultValues?.memo || "",
      source: defaultValues?.source || "",
      reference_number: defaultValues?.reference_number || "",
      lines: defaultValues?.lines || [
        { 
          line_number: 1, 
          account_id: 0, 
          description: "",
          debit: 0,
          credit: 0
        },
        { 
          line_number: 2, 
          account_id: 0, 
          description: "",
          debit: 0,
          credit: 0
        }
      ],
    },
    mode: "onChange",
  });
  
  // Set up the field array for lines
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  
  // Watch all lines to calculate balance
  const formLines = form.watch("lines");
  
  // Calculate balance whenever lines change
  useEffect(() => {
    if (formLines && formLines.length > 0) {
      // Calculate total debits and credits
      const totalDebits = formLines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0);
      const totalCredits = formLines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0);
      
      // Calculate difference and set balance status
      const diff = Math.abs(totalDebits - totalCredits);
      setDifference(diff);
      
      if (diff < 0.01) {
        setBalanceStatus('balanced');
      } else {
        setBalanceStatus('unbalanced');
      }
    }
  }, [formLines]);
  
  // Get a flat list of accounts for the dropdown
  const flatAccounts = initialFlatAccounts.length > 0 ? initialFlatAccounts : flattenAccounts(accountsArray);
  
  // Debug account data
  useEffect(() => {
    console.log('TransactionGrid received accounts:', accounts);
    console.log('Using flat accounts:', flatAccounts);
  }, [accounts]);
  
  // Function to handle form submission
  const handleSubmit = async (values: JournalFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
      form.reset(); // Clear form after successful submission
    } catch (error) {
      console.error('Error submitting journal:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Journal Entry</CardTitle>
        <CardDescription>
          Create a new journal entry with balanced debits and credits
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Journal Type */}
              <FormField
                control={form.control}
                name="journal_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Journal Type</FormLabel>
                    <JournalTypeSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Transaction Date */}
              <FormField
                control={form.control}
                name="transaction_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isSubmitting}
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
              
              {/* Reference Number */}
              <FormField
                control={form.control}
                name="reference_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Invoice or document reference"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Memo */}
            <FormField
              control={form.control}
              name="memo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Memo</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Description of the transaction"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Source */}
            <FormField
              control={form.control}
              name="source"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Source of the transaction"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Journal Lines */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <FormLabel>Journal Lines</FormLabel>
                {balanceStatus && (
                  <Badge
                    variant={balanceStatus === 'balanced' ? "outline" : "destructive"}
                    className="ml-2"
                  >
                    {balanceStatus === 'balanced' 
                      ? 'Balanced' 
                      : `Out of balance by ${difference.toFixed(2)}`}
                  </Badge>
                )}
              </div>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead className="w-[250px]">Account</TableHead>
                      <TableHead className="w-[250px]">Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Funder</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.account_id`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Select
                                  value={field.value.toString() || ""}
                                  onValueChange={(value) => field.onChange(parseInt(value, 10))}
                                  disabled={isSubmitting}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select an account" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {flatAccounts.map((account: AccountNode) => (
                                      <SelectItem
                                        key={account.id}
                                        value={account.id.toString()}
                                        disabled={account.is_active === false}
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
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.description`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  placeholder="Line description"
                                  {...field}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.category`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  placeholder="Category"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.location`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  placeholder="Location"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.vendor`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  placeholder="Vendor"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.funder`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  placeholder="Funder"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.debit`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  className="text-right"
                                  onChange={(e) => {
                                    const value = e.target.value ? parseFloat(e.target.value) : 0;
                                    field.onChange(value);
                                    // Clear credit if debit has value
                                    if (value > 0) {
                                      form.setValue(`lines.${index}.credit`, 0);
                                    }
                                  }}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.credit`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  className="text-right"
                                  onChange={(e) => {
                                    const value = e.target.value ? parseFloat(e.target.value) : 0;
                                    field.onChange(value);
                                    // Clear debit if credit has value
                                    if (value > 0) {
                                      form.setValue(`lines.${index}.debit`, 0);
                                    }
                                  }}
                                  value={field.value || ""}
                                  disabled={isSubmitting}
                                />
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={fields.length <= 1 || isSubmitting}
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <tfoot>
                    <TableRow className="border-t-2 border-primary">
                      <TableCell colSpan={2} className="font-medium text-right">Totals:</TableCell>
                      <TableCell className="font-medium text-right">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(formLines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0))}
                      </TableCell>
                      <TableCell className="font-medium text-right">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(formLines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0))}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={2} className="font-medium text-right">Difference:</TableCell>
                      <TableCell colSpan={2} className={`font-medium text-right ${Math.abs(formLines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0) - formLines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0)) > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                          signDisplay: 'always'
                        }).format(formLines.reduce((sum, line) => sum + (parseFloat(String(line.debit)) || 0), 0) - formLines.reduce((sum, line) => sum + (parseFloat(String(line.credit)) || 0), 0))}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </tfoot>
                </Table>
              </div>
              
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => append({
                  line_number: fields.length + 1,
                  account_id: 0,
                  description: "",
                  debit: 0,
                  credit: 0
                })}
                disabled={isSubmitting}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Add Line
              </Button>
              
              {balanceStatus === 'unbalanced' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Out of Balance</AlertTitle>
                  <AlertDescription>
                    Total debits and credits must be equal. Current difference: {difference.toFixed(2)}
                  </AlertDescription>
                </Alert>
              )}
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Open the file input dialog
                  document.getElementById('file-upload')?.click();
                }}
                disabled={isSubmitting}
              >
                <FileUp className="h-4 w-4 mr-2" />
                Add Attachment
              </Button>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={(e) => {
                  // Handle file upload
                  console.log('File uploaded:', e.target.files);
                  // TODO: Implement file upload logic
                }}
              />
              
              <Button type="submit" disabled={isSubmitting || balanceStatus === 'unbalanced'}>
                {isSubmitting ? "Saving..." : "Save Journal Entry"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// Helper function to flatten account hierarchy
function flattenAccounts(accounts: AccountNode[]): AccountNode[] {
  if (!Array.isArray(accounts)) {
    console.warn('flattenAccounts received non-array:', accounts);
    return [];
  }
  
  const result: AccountNode[] = [];
  
  function traverse(account: AccountNode) {
    if (!account) return;
    result.push(account);
    if (account.children && Array.isArray(account.children) && account.children.length > 0) {
      account.children.forEach(traverse);
    }
  }
  
  accounts.forEach(traverse);
  return result;
}

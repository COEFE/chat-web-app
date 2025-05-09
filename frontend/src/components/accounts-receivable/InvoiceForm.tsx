"use client";

import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Loader2, Plus, Trash2, Calculator } from "lucide-react";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

// Define validation schema
const invoiceLineSchema = z.object({
  id: z.number().optional(),
  revenue_account_id: z.string().min(1, "Revenue account is required"),
  description: z.string().min(1, "Description is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unit_price: z.string().min(1, "Unit price is required"),
});

const invoiceFormSchema = z.object({
  customer_id: z.string().min(1, "Customer is required"),
  invoice_number: z.string().optional(),
  invoice_date: z.date({
    required_error: "Invoice date is required",
  }),
  due_date: z.date({
    required_error: "Due date is required",
  }),
  terms: z.string().optional(),
  memo_to_customer: z.string().optional(),
  ar_account_id: z.string().min(1, "Accounts Receivable account is required"),
  status: z.string().min(1, "Status is required"),
  lines: z.array(invoiceLineSchema).min(1, "At least one line item is required"),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

interface Customer {
  id: number;
  name: string;
}

interface Account {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface InvoiceLine {
  id?: number;
  revenue_account_id: number;
  revenue_account_name?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
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
  terms?: string;
  memo_to_customer?: string;
  ar_account_id: number;
  ar_account_name: string;
}

interface InvoiceFormProps {
  invoice: Invoice | null;
  onClose: (refreshData?: boolean) => void;
}

export function InvoiceForm({ invoice, onClose }: InvoiceFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  // Define statuses
  const statuses = ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Void"];

  // Initialize form with default or invoice data
  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      customer_id: invoice ? invoice.customer_id.toString() : "",
      invoice_number: invoice?.invoice_number || "",
      invoice_date: invoice ? new Date(invoice.invoice_date) : new Date(),
      due_date: invoice ? new Date(invoice.due_date) : new Date(),
      terms: invoice?.terms || "",
      memo_to_customer: invoice?.memo_to_customer || "",
      ar_account_id: invoice ? invoice.ar_account_id.toString() : "",
      status: invoice?.status || "Draft",
      lines: [],
    },
  });

  // Use field array for line items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });

  // Fetch customers, accounts, and invoice details
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Fetch customers
        const customersResponse = await fetch("/api/customers", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!customersResponse.ok) {
          throw new Error(`Error fetching customers: ${customersResponse.status}`);
        }
        
        const customersData = await customersResponse.json();
        setCustomers(customersData.customers);
        
        // Fetch accounts
        const accountsResponse = await fetch("/api/accounts", {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!accountsResponse.ok) {
          throw new Error(`Error fetching accounts: ${accountsResponse.status}`);
        }
        
        const accountsData = await accountsResponse.json();
        
        // Sort all accounts by code
        const sortedAccounts = accountsData.accounts
          .sort((a: Account, b: Account) => a.code.localeCompare(b.code));
        
        // Make all GL accounts available for selection
        setAccounts(sortedAccounts);
        
        // If editing an invoice, fetch its lines
        if (invoice) {
          const invoiceResponse = await fetch(`/api/invoices/${invoice.id}`, {
            headers: {
              'Authorization': `Bearer ${idToken}`
            }
          });
          
          if (!invoiceResponse.ok) {
            throw new Error(`Error fetching invoice details: ${invoiceResponse.status}`);
          }
          
          const invoiceData = await invoiceResponse.json();
          const lines = invoiceData.lines;
          
          // Set lines in form
          const formattedLines = lines.map((line: InvoiceLine) => ({
            id: line.id,
            revenue_account_id: line.revenue_account_id.toString(),
            description: line.description,
            quantity: line.quantity.toString(),
            unit_price: line.unit_price.toString(),
          }));
          
          form.setValue("lines", formattedLines);
          setInvoiceLines(lines);
          calculateTotal(lines);
        } else {
          // Add an empty line for new invoices
          append({
            revenue_account_id: "",
            description: "",
            quantity: "1",
            unit_price: "0",
          });
        }
      } catch (err: any) {
        console.error("Error fetching data:", err);
        toast({
          title: "Error",
          description: err.message || "Failed to load form data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast, invoice, append, form]);

  // Calculate line amounts and total
  const calculateLineAmount = (quantity: string, unitPrice: string) => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    return qty * price;
  };

  const calculateTotal = (lines: any[]) => {
    const total = lines.reduce((sum, line) => {
      if (typeof line.amount === 'number') {
        return sum + line.amount;
      }
      
      const quantity = parseFloat(line.quantity) || 0;
      const unitPrice = parseFloat(line.unit_price) || 0;
      return sum + (quantity * unitPrice);
    }, 0);
    
    setTotalAmount(total);
    return total;
  };

  // Auto-calculate when form values change
  useEffect(() => {
    const subscription = form.watch((value, { name, type }) => {
      if (name?.includes('lines') && (name?.includes('quantity') || name?.includes('unit_price'))) {
        const lines = form.getValues('lines');
        calculateTotal(lines);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [form.watch]);

  // Add a new line item
  const addLineItem = () => {
    append({
      revenue_account_id: "",
      description: "",
      quantity: "1",
      unit_price: "0",
    });
  };

  // Handle form submission
  const onSubmit = async (data: InvoiceFormValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Prepare line items
      const lines = data.lines.map((line) => ({
        revenue_account_id: parseInt(line.revenue_account_id),
        description: line.description,
        quantity: parseFloat(line.quantity),
        unit_price: parseFloat(line.unit_price),
      }));
      
      // Format dates
      const formattedInvoiceDate = format(data.invoice_date, 'yyyy-MM-dd');
      const formattedDueDate = format(data.due_date, 'yyyy-MM-dd');
      
      let response;
      
      // Find selected customer to include name
      const selectedCustomer = customers.find(c => c.id.toString() === data.customer_id);
      if (!selectedCustomer) {
        throw new Error("Customer not found. Please select a valid customer.");
      }

      if (invoice) {
        // Update existing invoice
        response = await fetch(`/api/invoices/${invoice.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            invoice: {
              customer_id: parseInt(data.customer_id),
              customer_name: selectedCustomer.name, // Include customer name for updates too
              invoice_number: data.invoice_number,
              invoice_date: formattedInvoiceDate,
              due_date: formattedDueDate,
              total_amount: totalAmount,
              terms: data.terms,
              memo_to_customer: data.memo_to_customer,
              ar_account_id: parseInt(data.ar_account_id),
              status: data.status,
            },
            lines
          })
        });
      } else {
        // Create new invoice
        response = await fetch('/api/invoices', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            invoice: {
              customer_id: parseInt(data.customer_id),
              customer_name: selectedCustomer.name, // Include customer name
              invoice_number: data.invoice_number,
              invoice_date: formattedInvoiceDate,
              due_date: formattedDueDate,
              total_amount: totalAmount,
              terms: data.terms,
              memo_to_customer: data.memo_to_customer,
              ar_account_id: parseInt(data.ar_account_id),
              status: data.status,
            },
            lines
          })
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${invoice ? 'updating' : 'creating'} invoice: ${response.status}`);
      }
      
      toast({
        title: invoice ? "Invoice Updated" : "Invoice Created",
        description: `Invoice was successfully ${invoice ? 'updated' : 'created'}.`,
      });
      
      // Close the form and refresh data
      onClose(true);
    } catch (err: any) {
      console.error(`Error ${invoice ? 'updating' : 'creating'} invoice:`, err);
      toast({
        title: "Error",
        description: err.message || `Failed to ${invoice ? 'update' : 'create'} invoice`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{invoice ? "Edit Invoice" : "Create New Invoice"}</DialogTitle>
          <DialogDescription>
            {invoice
              ? "Update the invoice information below."
              : "Fill in the details to create a new invoice."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-6">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer */}
                <FormField
                  control={form.control}
                  name="customer_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a customer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id.toString()}>
                              {customer.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Invoice Number */}
                <FormField
                  control={form.control}
                  name="invoice_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Invoice Number (auto-generated if blank)</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Invoice Date */}
                <FormField
                  control={form.control}
                  name="invoice_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Invoice Date*</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "MM/dd/yyyy")
                              ) : (
                                <span>Pick a date</span>
                              )}
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

                {/* Due Date */}
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Due Date*</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "MM/dd/yyyy")
                              ) : (
                                <span>Pick a date</span>
                              )}
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

                {/* Status */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {statuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status}
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
                {/* AR Account */}
                <FormField
                  control={form.control}
                  name="ar_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AR Account*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select AR account" />
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

                {/* Terms */}
                <FormField
                  control={form.control}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Net 30" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Memo */}
              <FormField
                control={form.control}
                name="memo_to_customer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memo to Customer</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Line Items Section */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Line Items</h3>
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addLineItem}
                    >
                      <Plus className="mr-1 h-4 w-4" />
                      Add Item
                    </Button>
                  </div>
                </div>

                <div className="border rounded-md p-4">
                  <div className="grid grid-cols-12 gap-2 mb-2 font-medium text-sm">
                    <div className="col-span-4">Description</div>
                    <div className="col-span-3">Account</div>
                    <div className="col-span-1">Quantity</div>
                    <div className="col-span-2">Unit Price</div>
                    <div className="col-span-1">Amount</div>
                    <div className="col-span-1"></div>
                  </div>

                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 mb-2">
                      {/* Description */}
                      <div className="col-span-4">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.description`}
                          render={({ field }) => (
                            <FormItem className="mb-0">
                              <FormControl>
                                <Input {...field} placeholder="Description" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Revenue Account */}
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.revenue_account_id`}
                          render={({ field }) => (
                            <FormItem className="mb-0">
                              <Select
                                onValueChange={field.onChange}
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
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
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Quantity */}
                      <div className="col-span-1">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="mb-0">
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number" 
                                  min="0"
                                  step="0.01"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.unit_price`}
                          render={({ field }) => (
                            <FormItem className="mb-0">
                              <FormControl>
                                <Input 
                                  {...field} 
                                  type="number" 
                                  min="0" 
                                  step="0.01"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Amount (calculated) */}
                      <div className="col-span-1 flex items-center">
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD',
                        }).format(
                          calculateLineAmount(
                            form.getValues(`lines.${index}.quantity`),
                            form.getValues(`lines.${index}.unit_price`)
                          )
                        )}
                      </div>

                      {/* Delete Button */}
                      <div className="col-span-1 flex items-center justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="grid grid-cols-12 gap-2 mt-4 pt-4 border-t">
                    <div className="col-span-10 text-right font-medium">Total:</div>
                    <div className="col-span-2 font-medium">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      }).format(totalAmount)}
                    </div>
                  </div>
                </div>
              </div>

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
                      {invoice ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>{invoice ? "Update" : "Create"} Invoice</>
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

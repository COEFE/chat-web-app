"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { Bill } from "@/lib/accounting/billQueries";
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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Plus, Trash2, CalendarIcon, Calculator, UserPlus } from "lucide-react";
import { getAuth } from "firebase/auth";
import { VendorForm } from "@/components/accounts-payable/VendorForm";
import { BillAttachments } from "@/components/bills/BillAttachments";

// Define the validation schemas
const billLineSchema = z.object({
  id: z.number().optional(),
  expense_account_id: z.string().min(1, "Account is required"),
  description: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) !== 0,
    "Quantity cannot be zero"
  ),
  unit_price: z.string().min(1, "Unit price is required").refine(
    (val) => !isNaN(parseFloat(val)),
    "Unit price must be a valid number"
  ),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)),
    "Amount must be a valid number"
  ),
  // Added fields to match journal entries
  category: z.string().optional(),
  location: z.string().optional(),
  funder: z.string().optional(),
});

const billFormSchema = z.object({
  vendor_id: z.string().min(1, "Vendor is required"),
  bill_number: z.string().optional(),
  bill_date: z.string().min(1, "Bill date is required"),
  due_date: z.string().min(1, "Due date is required"),
  total_amount: z.string().min(1, "Total amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Total amount must be a positive number"
  ),
  status: z.string().min(1, "Status is required"),
  payment_terms: z.string().optional(),
  description: z.string().optional(),
  ap_account_id: z.string().min(1, "AP account is required"),
  lines: z.array(billLineSchema).min(1, "At least one line item is required"),
});

type BillFormValues = z.infer<typeof billFormSchema>;

interface Account {
  id: number;
  name: string;
  code: string;
  type: string;
}

interface Vendor {
  id: number;
  name: string;
}

interface BillLine {
  id?: number;
  expense_account_id: number;
  description?: string;
  quantity: number;
  unit_price: number;
  amount: number;
  expense_account_name?: string;
  // Added fields to match journal entries
  category?: string;
  location?: string;
  funder?: string;
}

interface BillFormProps {
  bill: Bill | null;
  onClose: (refreshData?: boolean) => void;
  isCreditNote?: boolean;
  title?: string;
}

export function BillForm({ bill, onClose, isCreditNote = false, title = "Add Bill" }: BillFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apAccounts, setApAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVendorForm, setShowVendorForm] = useState(false);

  // Convert string values to numeric for calculations
  const parseAmount = (value: string): number => {
    return parseFloat(value) || 0;
  };

  // Helper function to safely convert values to string, handling various data types
  const safeToString = (value: any): string => {
    if (value === null || value === undefined) return "";
    return String(value);
  };

  // Helper function to safely access line properties with fallbacks
  const getLineProperty = (line: any, property: string, defaultValue: string = ""): string => {
    if (!line) return defaultValue;
    const value = line[property];
    return safeToString(value) || defaultValue;
  };
  
  // Default AP account ID - to be populated when accounts are loaded
  const [defaultApAccountId, setDefaultApAccountId] = useState<string>("");

  // Initialize the form
  const form = useForm<BillFormValues>({
    resolver: zodResolver(billFormSchema),
    defaultValues: {
      vendor_id: bill?.vendor_id?.toString() || "",
      bill_number: bill?.bill_number || "",
      bill_date: bill ? format(new Date(bill.bill_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      due_date: bill ? format(new Date(bill.due_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
      payment_terms: bill?.payment_terms || "",
      description: bill?.description || "",
      ap_account_id: bill?.ap_account_id?.toString() || defaultApAccountId,
      status: bill?.status || "Draft",
      lines: bill?.lines && Array.isArray(bill.lines) && bill.lines.length > 0
        ? bill.lines.map(line => ({
            id: line.id,
            expense_account_id: getLineProperty(line, 'expense_account_id', ""),
            description: getLineProperty(line, 'description', ""),
            quantity: getLineProperty(line, 'quantity', "1"),
            unit_price: getLineProperty(line, 'unit_price', "0"),
            amount: getLineProperty(line, 'amount', "0"),
            category: getLineProperty(line, 'category', ""),
            location: getLineProperty(line, 'location', ""),
            funder: getLineProperty(line, 'funder', ""),
          }))
        : [
            {
              expense_account_id: "",
              description: "",
              quantity: "1",
              unit_price: "0",
              amount: "0",
              category: "",
              location: "",
              funder: "",
            }
          ]
    },
  });

  // Setup field array for bill lines
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines"
  });
  
  // When a bill is loaded for editing, update the form
  useEffect(() => {
    if (bill) {
      console.log('Bill data received for editing:', bill);
      
      // Handle bill lines if present
      if (bill.lines && Array.isArray(bill.lines) && bill.lines.length > 0) {
        console.log('Setting field array with lines:', bill.lines);
        
        // Format the line items for the form
        try {
          const formattedLines = bill.lines.map(line => ({
            id: line.id,
            expense_account_id: line.expense_account_id?.toString() || "",
            description: line.description || "",
            quantity: (line.quantity || 1).toString(),
            unit_price: (line.unit_price || 0).toString(),
            amount: (line.amount || 0).toString(),
            category: line.category || "",
            location: line.location || "",
            funder: line.funder || "",
          }));
          
          console.log('Formatted lines:', formattedLines);
          
          // Reset form values
          form.reset({
            vendor_id: bill.vendor_id?.toString() || "",
            bill_number: bill.bill_number || "",
            bill_date: format(new Date(bill.bill_date), 'yyyy-MM-dd'),
            due_date: format(new Date(bill.due_date), 'yyyy-MM-dd'),
            payment_terms: bill.payment_terms || "",
            description: bill.description || "",
            ap_account_id: bill.ap_account_id?.toString() || defaultApAccountId,
            status: bill.status || "Draft",
            lines: formattedLines
          }, { keepDefaultValues: false });
        } catch (error) {
          console.error('Error formatting bill lines:', error);
        }
      }
    }
  }, [bill, form, replace]);

  // Function to fetch vendors
  const fetchVendors = async () => {
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Fetch vendors
      const vendorsResponse = await fetch("/api/vendors", {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!vendorsResponse.ok) {
        throw new Error(`Error fetching vendors: ${vendorsResponse.status}`);
      }
      
      const vendorsData = await vendorsResponse.json();
      setVendors(vendorsData.vendors);
    } catch (err: any) {
      console.error("Error fetching vendors:", err);
      toast({
        title: "Error",
        description: "Failed to load vendors",
        variant: "destructive",
      });
    }
  };
  
  // Fetch vendors and accounts
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      try {
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        // Fetch vendors
        await fetchVendors();
        
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
        
        // Sort accounts by code
        const sortedAccounts = accountsData.accounts?.sort(
          (a: Account, b: Account) => a.code.localeCompare(b.code)
        ) || [];
        
        // Set all accounts for line items (to allow all GL accounts to be selected)
        setAccounts(sortedAccounts);
        
        // Make all GL accounts available for AP account selection
        setApAccounts(sortedAccounts);

        // Find and set the default AP account (2010 - Accounts Payable)
        const apAccount = sortedAccounts.find((account: Account) => 
          account.code === '2010' && account.name.includes('Accounts Payable')
        );
        
        if (apAccount) {
          setDefaultApAccountId(apAccount.id.toString());
          // Only set the form value if no bill is being edited (new bill)
          if (!bill) {
            form.setValue('ap_account_id', apAccount.id.toString());
          }
        }
        
        // Cash & Bank accounts (for payment) - keeping this for reference
        const cashBankAccounts = sortedAccounts.filter(
          (account: Account) => 
            account.type && account.type.toLowerCase() === 'asset' &&
            account.name && ((account.name.toLowerCase().includes('cash') || 
             account.name.toLowerCase().includes('bank')) ||
             account.code && account.code.startsWith('10'))
        );
      } catch (err: any) {
        console.error("Error fetching form data:", err);
        toast({
          title: "Error",
          description: "Failed to load form data",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast]);

  // Auto-calculate line amount when quantity or unit price changes
  const calculateLineAmount = (index: number) => {
    const quantity = parseAmount(form.getValues(`lines.${index}.quantity`));
    const unitPrice = parseAmount(form.getValues(`lines.${index}.unit_price`));
    const amount = (quantity * unitPrice).toFixed(2);
    form.setValue(`lines.${index}.amount`, amount);
    return amount;
  };

  // Calculate total bill amount
  const calculateTotalAmount = (): number => {
    const lines = form.getValues("lines");
    return lines.reduce((total, line) => {
      return total + parseAmount(line.amount);
    }, 0);
  };

  // Handle form submission
  const onSubmit = async (data: BillFormValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Calculate total amount, making it negative for credit notes if needed
      const rawTotalAmount = calculateTotalAmount();
      const totalAmount = isCreditNote && rawTotalAmount > 0 ? -rawTotalAmount : rawTotalAmount;
      
      // Prepare bill data
      const billData = {
        vendor_id: parseInt(data.vendor_id),
        bill_number: data.bill_number || null,
        bill_date: format(data.bill_date, 'yyyy-MM-dd'),
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        payment_terms: data.payment_terms || null,
        description: (isCreditNote ? 'CREDIT NOTE: ' : '') + (data.description || ''),
        ap_account_id: parseInt(data.ap_account_id),
        status: data.status,
        total_amount: totalAmount,
      };
      
      // Prepare line items
      const lineItems = data.lines.map(line => {
        // For credit notes, ensure amounts are negative if they're not already
        const quantity = parseAmount(line.quantity);
        const unitPrice = parseAmount(line.unit_price);
        const amount = parseAmount(line.amount);
        
        // If this is a credit note and the amount is positive, make it negative
        const adjustedQuantity = isCreditNote && quantity > 0 ? -quantity : quantity;
        const adjustedAmount = isCreditNote && amount > 0 ? -amount : amount;
        
        return {
          id: line.id,
          expense_account_id: parseInt(line.expense_account_id),
          description: line.description || null,
          quantity: adjustedQuantity,
          unit_price: unitPrice, // Keep unit price as is, only adjust quantity
          amount: adjustedAmount,
          category: line.category || null,
          location: line.location || null,
          funder: line.funder || null
        };
      });
      
      let response;
      if (bill) {
        // Update existing bill
        response = await fetch(`/api/bills/${bill.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            bill: billData,
            lines: lineItems
          })
        });
      } else {
        // Create new bill
        response = await fetch('/api/bills', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            bill: billData,
            lines: lineItems
          })
        });
      }
      
      if (!response.ok) {
        throw new Error(`Error ${bill ? 'updating' : 'creating'} bill: ${response.status}`);
      }
      
      const result = await response.json();
      
      toast({
        title: bill ? "Bill Updated" : "Bill Created",
        description: `Bill was successfully ${bill ? 'updated' : 'created'}.`,
      });
      
      // Close the form and refresh data
      onClose(true);
    } catch (err: any) {
      console.error(`Error ${bill ? 'updating' : 'creating'} bill:`, err);
      toast({
        title: "Error",
        description: err.message || `Failed to ${bill ? 'update' : 'create'} bill`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={true} onOpenChange={() => onClose()}>
        <DialogContent className="lg:max-w-screen-lg max-h-[85vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {bill ? 
                "Update information" : 
                (isCreditNote ? "Create a new vendor credit" : "Create a new bill for a vendor")
              }
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
                {/* Vendor Selection */}
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="vendor_id"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex justify-between items-center">
                          <FormLabel>Vendor*</FormLabel>
                          <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setShowVendorForm(true)}
                            className="h-8 px-2 text-xs"
                            disabled={(bill?.amount_paid || 0) > 0}
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" />
                            New Vendor
                          </Button>
                        </div>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={(bill?.amount_paid || 0) > 0}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a vendor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {vendors.map((vendor) => (
                              <SelectItem key={vendor.id} value={vendor.id.toString()}>
                                {vendor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Bill Number */}
                <FormField
                  control={form.control}
                  name="bill_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bill Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Vendor's bill number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Bill Date */}
                <FormField
                  control={form.control}
                  name="bill_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bill Date*</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(new Date(field.value), "MM/dd/yyyy")
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
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
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
                              className="w-full pl-3 text-left font-normal"
                            >
                              {field.value ? (
                                format(new Date(field.value), "MM/dd/yyyy")
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
                            selected={field.value ? new Date(field.value) : undefined}
                            onSelect={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                {/* AP Account */}
                {/* Payment Terms */}
                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          
                          // Auto-calculate due date based on payment terms
                          const billDate = form.getValues('bill_date');
                          if (billDate) {
                            let dueDate = new Date(billDate);
                            
                            // Simple calculation for common terms
                            if (value === 'Net 15') {
                              dueDate.setDate(dueDate.getDate() + 15);
                              form.setValue('due_date', format(dueDate, 'yyyy-MM-dd'));
                            } else if (value === 'Net 30') {
                              dueDate.setDate(dueDate.getDate() + 30);
                              form.setValue('due_date', format(dueDate, 'yyyy-MM-dd'));
                            } else if (value === 'Net 45') {
                              dueDate.setDate(dueDate.getDate() + 45);
                              form.setValue('due_date', format(dueDate, 'yyyy-MM-dd'));
                            } else if (value === 'Net 60') {
                              dueDate.setDate(dueDate.getDate() + 60);
                              form.setValue('due_date', format(dueDate, 'yyyy-MM-dd'));
                            } else if (value === 'COD' || value === 'Due on Receipt') {
                              // Due immediately
                              form.setValue('due_date', billDate);
                            } else if (value === '2/10 Net 30') {
                              // Net 30 with 2% discount if paid within 10 days
                              dueDate.setDate(dueDate.getDate() + 30);
                              form.setValue('due_date', format(dueDate, 'yyyy-MM-dd'));
                            }
                            // For other terms, the server-side AI will handle them
                          }
                        }} 
                        defaultValue={field.value || ''}
                        disabled={(bill?.amount_paid || 0) > 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment terms" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Net 15">Net 15</SelectItem>
                          <SelectItem value="Net 30">Net 30</SelectItem>
                          <SelectItem value="Net 45">Net 45</SelectItem>
                          <SelectItem value="Net 60">Net 60</SelectItem>
                          <SelectItem value="2/10 Net 30">2/10 Net 30</SelectItem>
                          <SelectItem value="COD">COD (Cash on Delivery)</SelectItem>
                          <SelectItem value="Due on Receipt">Due on Receipt</SelectItem>
                          <SelectItem value="EOM">EOM (End of Month)</SelectItem>
                          <SelectItem value="MFI">MFI (Month Following Invoice)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Selecting payment terms will automatically update the due date.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ap_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>AP Account*</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={(bill?.amount_paid || 0) > 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an AP account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {apAccounts.map((account) => (
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

                {/* Status */}
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                        disabled={(bill?.amount_paid || 0) > 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Draft">Draft</SelectItem>
                          <SelectItem value="Open">Open</SelectItem>
                          {bill && (bill.amount_paid || 0) > 0 && (bill.amount_paid || 0) < (bill.total_amount || 0) && (
                            <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                          )}
                          {bill && (bill.amount_paid || 0) === (bill.total_amount || 0) && (
                            <SelectItem value="Paid">Paid</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Memo */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Memo</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Notes about this bill" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-medium">Line Items</h3>
                  <Button
                    type="button"
                    onClick={() => append({
                      expense_account_id: "",
                      description: "",
                      quantity: "1",
                      unit_price: "0",
                      amount: "0"
                    })}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                  >
                    <Plus className="h-3 w-3" />
                    Add Line
                  </Button>
                </div>

                <div className="border rounded-md p-2 overflow-y-auto max-h-[30vh]">
                  <div className="grid grid-cols-12 gap-2 font-medium pb-1 mb-1 border-b text-xs">
                    <div className="col-span-3">Account</div>
                    <div className="col-span-3">Description</div>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-1">Price</div>
                    <div className="col-span-1">Amount</div>
                    <div className="col-span-2">Category/Location</div>
                    <div className="col-span-1">Actions</div>
                  </div>

                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 mb-2 items-start text-sm">
                      {/* Account */}
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.expense_account_id`}
                          render={({ field }) => (
                            <FormItem>
                              <Select 
                                onValueChange={field.onChange} 
                                defaultValue={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger className="h-8 text-xs">
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
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Description */}
                      <div className="col-span-3">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input {...field} className="h-8 text-xs" placeholder="Description" />
                              </FormControl>
                              <FormMessage />
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
                            <FormItem>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  className="h-9"
                                  placeholder="Qty"
                                  type="number"
                                  min="0"
                                  step="any"
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateLineAmount(index);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Unit Price */}
                      <div className="col-span-1">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.unit_price`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  className="h-9"
                                  placeholder="Price"
                                  type="number"
                                  min="0" 
                                  step="any"
                                  onChange={(e) => {
                                    field.onChange(e);
                                    calculateLineAmount(index);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Amount */}
                      <div className="col-span-1">
                        <FormField
                          control={form.control}
                          name={`lines.${index}.amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  className="h-9"
                                  placeholder="Amount"
                                  readOnly
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Category & Location Inputs Grouped */}
                      <div className="col-span-2 grid grid-cols-2 gap-2">
                        {/* Category */}
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.category`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} className="h-9" placeholder="Category" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Location */}
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.location`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input {...field} className="h-9" placeholder="Location" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="col-span-1 flex items-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => fields.length > 1 && remove(index)}
                          disabled={fields.length <= 1}
                          className="h-9 w-9 p-0"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex justify-end pt-4 border-t">
                    <div className="w-64 flex items-center justify-between">
                      <span className="font-medium">Total Amount:</span>
                      <span className="font-bold">
                        ${calculateTotalAmount().toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Attachments Section - only show for existing bills */}
              {bill?.id && (
                <div className="mt-6">
                  <BillAttachments 
                    billId={bill.id} 
                    readOnly={bill.status === 'Posted'} 
                  />
                </div>
              )}

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
                      {bill ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>{bill ? "Update" : "Create"} Bill</>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
    
    {showVendorForm && (
      <VendorForm
        vendor={null}
        onClose={(refreshData) => {
          setShowVendorForm(false);
          if (refreshData) {
            // Refresh vendor list
            fetchVendors();
            toast({
              title: "Vendor Created",
              description: "New vendor has been created successfully.",
            });
          }
        }}
      />
    )}
    </>
  );
}

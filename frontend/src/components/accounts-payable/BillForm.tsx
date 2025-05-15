"use client";

import { useState, useEffect, useRef } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
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

// Define the validation schemas
const billLineSchema = z.object({
  id: z.number().optional(),
  expense_account_id: z.string().min(1, "Account is required"),
  description: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    "Quantity must be a positive number"
  ),
  unit_price: z.string().min(1, "Unit price is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    "Unit price must be a non-negative number"
  ),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    "Amount must be a non-negative number"
  ),
  // Added fields to match journal entries
  category: z.string().optional(),
  location: z.string().optional(),
  funder: z.string().optional(),
});

const billFormSchema = z.object({
  vendor_id: z.string().min(1, "Vendor is required"),
  bill_number: z.string().optional(),
  bill_date: z.date({
    required_error: "Bill date is required",
  }),
  due_date: z.date({
    required_error: "Due date is required",
  }),
  terms: z.string().optional(),
  memo: z.string().optional(),
  ap_account_id: z.string().min(1, "AP account is required")
    .refine(val => val !== undefined && val !== "", {
      message: "An Accounts Payable account is required"
    }),
  status: z.string().nonempty(),
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

interface Bill {
  id: number;
  vendor_id: number;
  bill_number?: string;
  bill_date: string;
  due_date: string;
  total_amount: number;
  amount_paid: number;
  status: string;
  terms?: string;
  memo?: string;
  ap_account_id: number;
  lines?: BillLine[];
}

interface BillFormProps {
  bill: Bill | null;
  onClose: (refreshData?: boolean) => void;
}

export function BillForm({ bill, onClose }: BillFormProps) {
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
      bill_date: bill ? new Date(bill.bill_date) : new Date(),
      due_date: bill ? new Date(bill.due_date) : new Date(),
      terms: bill?.terms || "",
      memo: bill?.memo || "",
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
            bill_date: new Date(bill.bill_date),
            due_date: new Date(bill.due_date),
            terms: bill.terms || "",
            memo: bill.memo || "",
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
        
        // CRITICAL: Filter AP accounts to ONLY include LIABILITY accounts
        // This prevents selecting Current Assets accounts for Accounts Payable
        const liabilityAccounts = sortedAccounts.filter((account: Account) => 
          account.type?.toLowerCase() === 'liability'
        );
        
        // Only make liability accounts available for AP account selection
        console.log(`[BillForm] Filtered ${liabilityAccounts.length} LIABILITY accounts for AP dropdown from ${sortedAccounts.length} total accounts`);
        setApAccounts(liabilityAccounts);

        // CRITICAL: Find and set the default AP account - MUST be a LIABILITY account
        // This ensures we always select a proper Accounts Payable account for vendor bills
        console.log(`[BillForm] Selecting from ${liabilityAccounts.length} liability accounts`);
        
        // If we have no liability accounts, we need to create one
        if (liabilityAccounts.length === 0) {
          console.error('[BillForm] CRITICAL ERROR: No liability accounts found in the system!');
          toast({
            title: "Missing Required Account",
            description: "No liability accounts found. Please create an Accounts Payable account before creating bills.",
            variant: "destructive",
          });
          return;
        }
        
        // STRICT SELECTION ALGORITHM - Only considers LIABILITY accounts
        let apAccount = null;
        
        // Strategy 1: Find standard Accounts Payable account with code 2000
        apAccount = liabilityAccounts.find((account: Account) => 
          (account.code === '2000' || account.code === '2010') && 
          account.name.toLowerCase().includes('accounts payable')
        );
        
        // Strategy 2: Find any liability account with Accounts Payable in the name
        if (!apAccount) {
          apAccount = liabilityAccounts.find((account: Account) => 
            account.name.toLowerCase().includes('accounts payable') || 
            account.name.toLowerCase().includes('ap account')
          );
        }
        
        // Strategy 3: Find any liability account in the 2000-2999 range
        if (!apAccount) {
          apAccount = liabilityAccounts.find((account: Account) => 
            account.code.startsWith('2')
          );
        }
        
        // Strategy 4: Just take the first liability account as a last resort
        if (!apAccount && liabilityAccounts.length > 0) {
          apAccount = liabilityAccounts[0];
          console.warn(`[BillForm] No specific AP account found. Using first liability account: ${apAccount.name}`);
        }
        
        // CRITICAL: Verify the account is actually a liability type
        if (apAccount && apAccount.type?.toLowerCase() !== 'liability') {
          console.error(`[BillForm] VALIDATION ERROR: Selected account ${apAccount.name} is NOT a liability account!`);
          
          // Force select the first liability account instead
          if (liabilityAccounts.length > 0) {
            apAccount = liabilityAccounts[0];
            console.warn(`[BillForm] Selecting first liability account instead: ${apAccount.name}`);
          }
        }
        
        // If we found an AP account, set it as default and immediately apply it
        if (apAccount) {
          console.log(`[BillForm] Selected AP account: ${apAccount.name} (${apAccount.code}) - Type: ${apAccount.type}`);
          setDefaultApAccountId(apAccount.id.toString());
          
          // ALWAYS force set the AP account ID, even for existing bills
          // This ensures all bills use a proper AP account
          form.setValue('ap_account_id', apAccount.id.toString());
          
          // Log the selection for debugging
          console.log(`[BillForm] ✓ VERIFIED: Using AP account ${apAccount.id} (${apAccount.name}) for bill`);
        } else {
          // This should never happen since we check for liability accounts earlier
          console.error("[BillForm] CRITICAL: No Accounts Payable account could be selected!");
          toast({
            title: "Account Selection Error",
            description: "Could not select a valid Accounts Payable account. Please contact support.",
            variant: "destructive",
          });
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
      
      // Prepare bill data
      const billData = {
        vendor_id: parseInt(data.vendor_id),
        bill_number: data.bill_number || null,
        bill_date: format(data.bill_date, 'yyyy-MM-dd'),
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        terms: data.terms || null,
        memo: data.memo || null,
        ap_account_id: parseInt(data.ap_account_id),
        status: data.status,
        total_amount: calculateTotalAmount(),
      };
      
      // Prepare line items
      const lineItems = data.lines.map(line => ({
        id: line.id,
        expense_account_id: parseInt(line.expense_account_id),
        description: line.description || null,
        quantity: parseAmount(line.quantity),
        unit_price: parseAmount(line.unit_price),
        amount: parseAmount(line.amount),
        category: line.category || null,
        location: line.location || null,
        funder: line.funder || null
      }));
      
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
        <DialogContent className="lg:max-w-screen-lg">
          <DialogHeader>
            <DialogTitle>{bill ? "Edit Bill" : "Create New Bill"}</DialogTitle>
            <DialogDescription>
              {bill ? "Update bill information" : "Create a new bill for a vendor"}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex justify-center items-center py-6">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                                format(field.value, "MM/dd/yyyy")
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
                                format(field.value, "MM/dd/yyyy")
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
                
                {/* AP Account */}
                {/* Payment Terms */}
                <FormField
                  control={form.control}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Terms</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
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
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ap_account_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-semibold text-blue-700">Accounts Payable (Auto-Selected)</FormLabel>
                      <div className="relative">
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          disabled={true} /* ALWAYS DISABLED - AP account is auto-selected */
                        >
                          <FormControl>
                            <SelectTrigger className="border-blue-500 bg-gray-100">
                              <SelectValue placeholder="Auto-selected AP account" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {/* Only one option is ever shown - the pre-selected liability account */}
                            {apAccounts.length > 0 && (
                              <SelectItem 
                                key={field.value} 
                                value={field.value}
                                className="py-2 border-b border-gray-100"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {apAccounts.find(a => a.id.toString() === field.value)?.code || ''} - 
                                    {apAccounts.find(a => a.id.toString() === field.value)?.name || 'Accounts Payable'}
                                  </span>
                                  <span className="text-xs text-green-600">(Liability account)</span>
                                </div>
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {/* Overlay to prevent any interaction */}
                        <div className="absolute inset-0 bg-gray-50 opacity-50 pointer-events-none"></div>
                      </div>
                      <div className="text-xs text-blue-600 mt-1">
                        ✓ Accounts Payable is automatically selected for proper accounting
                      </div>
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
                name="memo"
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
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Line Items</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({
                      expense_account_id: "",
                      description: "",
                      quantity: "1",
                      unit_price: "0",
                      amount: "0",
                    })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Line
                  </Button>
                </div>

                <div className="border rounded-md p-4">
                  <div className="grid grid-cols-12 gap-4 font-medium pb-2 mb-2 border-b">
                    <div className="col-span-3">Account</div>
                    <div className="col-span-3">Description</div>
                    <div className="col-span-1">Quantity</div>
                    <div className="col-span-1">Unit Price</div>
                    <div className="col-span-1">Amount</div>
                    <div className="col-span-2">Category/Location</div>
                    <div className="col-span-1">Actions</div>
                  </div>

                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 mb-4 items-start">
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
                                  <SelectTrigger className="h-9">
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
                                <Input {...field} className="h-9" placeholder="Description" />
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

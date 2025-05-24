import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import { getAuth } from 'firebase/auth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Vendor } from '@/lib/accounting/vendorTypes';
import { Account } from '@/lib/accounting/accountTypes';
import { BillCredit, BillCreditLine } from '@/lib/accounting/billCreditTypes';
import { Loader2, Plus, Trash2 } from 'lucide-react';

// Validation schema for bill credit line items
const billCreditLineSchema = z.object({
  id: z.number().optional(),
  expense_account_id: z.string().min(1, "Expense account is required"),
  description: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required").refine(
    (val) => !isNaN(parseFloat(val)),
    "Quantity must be a number"
  ),
  unit_price: z.string().min(1, "Unit price is required").refine(
    (val) => !isNaN(parseFloat(val)),
    "Unit price must be a number"
  ),
  amount: z.string().min(1, "Amount is required").refine(
    (val) => !isNaN(parseFloat(val)),
    "Amount must be a number"
  ),
  category: z.string().optional(),
  location: z.string().optional(),
  funder: z.string().optional(),
});

// Validation schema for the entire bill credit form
const formSchema = z.object({
  vendor_id: z.string().min(1, "Vendor is required"),
  credit_number: z.string().optional(),
  credit_date: z.date({
    required_error: "Credit date is required",
  }),
  due_date: z.date({
    required_error: "Due date is required",
  }),
  terms: z.string().optional(),
  memo: z.string().optional(),
  ap_account_id: z.string().min(1, "AP account is required"),
  status: z.string().min(1, "Status is required"),
  lines: z.array(billCreditLineSchema).min(1, "At least one line item is required"),
});

// Define the form values type based on the schema
type BillCreditFormValues = z.infer<typeof formSchema>;

// Props for the BillCreditForm component
interface BillCreditFormProps {
  billCredit?: BillCredit;
  onClose: () => void;
  onSuccess: (billCredit: BillCredit) => void;
  title?: string;
}

// Helper function to parse amount strings to numbers
const parseAmount = (amount: string | number): number => {
  if (typeof amount === 'number') return amount;
  return parseFloat(amount) || 0;
};

export default function BillCreditForm({ 
  billCredit, 
  onClose, 
  onSuccess,
  title = billCredit ? "Edit Credit" : "Create New Vendor Credit"
}: BillCreditFormProps) {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Initialize form with default values or existing bill credit data
  const form = useForm<BillCreditFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: billCredit ? {
      vendor_id: billCredit.vendor_id.toString(),
      credit_number: billCredit.credit_number || '',
      credit_date: new Date(billCredit.credit_date),
      due_date: billCredit.due_date ? new Date(billCredit.due_date) : new Date(),
      terms: billCredit.terms || '',
      memo: billCredit.memo || '',
      ap_account_id: billCredit.ap_account_id.toString(),
      status: billCredit.status,
      lines: billCredit.lines?.map(line => ({
        id: line.id,
        expense_account_id: line.expense_account_id.toString(),
        description: line.description || '',
        quantity: line.quantity.toString(),
        unit_price: line.unit_price.toString(),
        amount: line.amount.toString(),
        category: line.category || '',
        location: line.location || '',
        funder: line.funder || '',
      })) || []
    } : {
      vendor_id: '',
      credit_number: '',
      credit_date: new Date(),
      due_date: new Date(),
      terms: '',
      memo: '',
      ap_account_id: '',
      status: 'Draft',
      lines: [
        {
          expense_account_id: '',
          description: '',
          quantity: '1',
          unit_price: '0.00',
          amount: '0.00',
          category: '',
          location: '',
          funder: '',
        }
      ]
    }
  });
  
  // Set up field array for managing line items
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  
  // Fetch vendors and accounts on component mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Get Firebase auth token
        const auth = getAuth();
        const idToken = await auth.currentUser?.getIdToken();
        
        if (!idToken) {
          throw new Error('Not authenticated');
        }
        
        const headers = {
          'Authorization': `Bearer ${idToken}`
        };
        
        // Fetch vendors
        const vendorsResponse = await fetch('/api/vendors', { headers });
        if (!vendorsResponse.ok) {
          throw new Error('Failed to fetch vendors');
        }
        const vendorsData = await vendorsResponse.json();
        
        // Check if the response has a vendors property (paginated response)
        if (vendorsData && vendorsData.vendors && Array.isArray(vendorsData.vendors)) {
          setVendors(vendorsData.vendors);
        } else if (Array.isArray(vendorsData)) {
          // Handle case where response is directly an array
          setVendors(vendorsData);
        } else {
          // If neither format matches, initialize as empty array
          console.error('Unexpected vendors data format:', vendorsData);
          setVendors([]);
        }
        
        // Fetch accounts
        const accountsResponse = await fetch('/api/accounts', { headers });
        if (!accountsResponse.ok) {
          throw new Error('Failed to fetch accounts');
        }
        const accountsData = await accountsResponse.json();
        
        // Check if the response has an accounts property
        if (accountsData && accountsData.accounts && Array.isArray(accountsData.accounts)) {
          console.log('Accounts data from API:', accountsData.accounts);
          setAccounts(accountsData.accounts);
        } else if (Array.isArray(accountsData)) {
          // Handle case where response is directly an array
          console.log('Accounts data from API (array):', accountsData);
          setAccounts(accountsData);
        } else {
          // If neither format matches, initialize as empty array
          console.error('Unexpected accounts data format:', accountsData);
          setAccounts([]);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Failed to load form data"
        });
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
  
  // Calculate total bill credit amount
  const calculateTotalAmount = (): number => {
    const lines = form.getValues("lines");
    return lines.reduce((total, line) => {
      return total + parseAmount(line.amount);
    }, 0);
  };
  
  // Handle form submission
  const onSubmit = async (data: BillCreditFormValues) => {
    setIsSubmitting(true);
    
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      
      // Calculate total amount
      const totalAmount = Math.abs(calculateTotalAmount());
      
      // Prepare bill credit data
      const billCreditData = {
        vendor_id: parseInt(data.vendor_id),
        credit_number: data.credit_number || null,
        credit_date: format(data.credit_date, 'yyyy-MM-dd'),
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        terms: data.terms || null,
        memo: data.memo || null,
        ap_account_id: parseInt(data.ap_account_id),
        status: data.status,
        total_amount: totalAmount,
      };
      
      // Prepare line items
      const lineItems = data.lines.map(line => {
        // Ensure amounts are positive for credit notes in the database
        const quantity = Math.abs(parseAmount(line.quantity));
        const unitPrice = parseAmount(line.unit_price);
        const amount = Math.abs(parseAmount(line.amount));
        
        return {
          id: line.id,
          expense_account_id: parseInt(line.expense_account_id),
          description: line.description || null,
          quantity: quantity,
          unit_price: unitPrice,
          amount: amount,
          category: line.category || null,
          location: line.location || null,
          funder: line.funder || null
        };
      });
      
      let response;
      if (billCredit) {
        // Update existing bill credit
        response = await fetch(`/api/bill-credits/${billCredit.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            bill: billCreditData,
            lines: lineItems
          })
        });
      } else {
        // Create new bill credit
        response = await fetch('/api/bill-credits', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            bill: billCreditData,
            lines: lineItems
          })
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save bill credit');
      }
      
      const savedBillCredit = await response.json();
      toast({
        title: billCredit ? "Credit updated" : "Credit created",
        description: billCredit ? "Vendor credit was updated successfully" : "Vendor credit was created successfully"
      });
      onSuccess(savedBillCredit);
      onClose();
    } catch (error: any) {
      console.error('Error saving bill credit:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save bill credit"
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Helper function to check if an account is of a certain type
  const isAccountType = (account: any, types: string[]) => {
    // Check account_type field first
    if (account.account_type && types.some(type => account.account_type.toLowerCase().includes(type.toLowerCase()))) {
      return true;
    }
    
    // Then check type field
    if (account.type && types.some(type => account.type.toLowerCase().includes(type.toLowerCase()))) {
      return true;
    }
    
    // Then check name field as fallback
    if (account.name && types.some(type => account.name.toLowerCase().includes(type.toLowerCase()))) {
      return true;
    }
    
    // Finally check code field if it exists
    if (account.code && types.some(type => account.code.toLowerCase().includes(type.toLowerCase()))) {
      return true;
    }
    
    return false;
  };
  
  // Log the accounts for debugging
  console.log('All accounts:', accounts);
  
  // Filter accounts to only show expense accounts
  const expenseAccounts = accounts.filter(account => 
    isAccountType(account, ['expense', 'cost of goods sold', 'cogs'])
  );
  
  console.log('Expense accounts:', expenseAccounts);
  
  // Filter accounts to only show AP accounts - be very flexible here
  const apAccounts = accounts.filter(account => 
    isAccountType(account, ['accounts payable', 'ap', 'payable', 'liability'])
  );
  
  console.log('AP accounts:', apAccounts);
  
  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="lg:max-w-screen-lg max-h-[85vh] overflow-y-auto p-4 md:p-6">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {billCredit ? "Update credit information" : "Create a new vendor credit"}
          </DialogDescription>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Header section with vendor, bill number, dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="vendor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select vendor" />
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
              
              <FormField
                control={form.control}
                name="credit_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Number</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Credit number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="credit_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credit Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                        setDate={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <DatePicker
                        date={field.value}
                        setDate={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Additional details section */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Terms</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Payment terms" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="ap_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AP Account</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select AP account" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {apAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
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
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Applied">Applied</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="memo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Memo</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Add notes or description" 
                      className="min-h-[80px]"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Line items section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Line Items</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({
                    expense_account_id: '',
                    description: '',
                    quantity: '1',
                    unit_price: '0.00',
                    amount: '0.00',
                    category: '',
                    location: '',
                    funder: '',
                  })}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              </div>
              
              {/* Line items table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-muted">
                      <th className="p-2 text-left">Account</th>
                      <th className="p-2 text-left">Description</th>
                      <th className="p-2 text-right">Quantity</th>
                      <th className="p-2 text-right">Unit Price</th>
                      <th className="p-2 text-right">Amount</th>
                      <th className="p-2 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((field, index) => (
                      <tr key={field.id} className="border-b">
                        <td className="p-2">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.expense_account_id`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <Select 
                                  onValueChange={field.onChange} 
                                  defaultValue={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger className="w-full">
                                      <SelectValue placeholder="Select account" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {expenseAccounts.map((account) => (
                                      <SelectItem key={account.id} value={account.id.toString()}>
                                        {account.name}
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
                              <FormItem className="m-0">
                                <FormControl>
                                  <Input {...field} placeholder="Description" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="p-2">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="number" 
                                    className="text-right"
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
                        </td>
                        <td className="p-2">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.unit_price`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="number" 
                                    step="0.01" 
                                    className="text-right"
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
                        </td>
                        <td className="p-2">
                          <FormField
                            control={form.control}
                            name={`lines.${index}.amount`}
                            render={({ field }) => (
                              <FormItem className="m-0">
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="number" 
                                    step="0.01" 
                                    className="text-right"
                                    readOnly
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </td>
                        <td className="p-2 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => fields.length > 1 && remove(index)}
                            disabled={fields.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted">
                      <td colSpan={4} className="p-2 text-right font-medium">Total:</td>
                      <td className="p-2 text-right font-medium">
                        ${calculateTotalAmount().toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            
            {/* Form actions */}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {billCredit ? 'Update Credit' : 'Save Credit'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

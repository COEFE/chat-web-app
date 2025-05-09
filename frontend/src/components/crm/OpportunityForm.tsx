"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Calendar } from "@/components/ui/calendar";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Form validation schema
const opportunityFormSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  customer_id: z.string().min(1, { message: "Customer is required" }),
  stage_id: z.string().min(1, { message: "Stage is required" }),
  value: z.coerce.number().min(0, { message: "Value must be a positive number" }),
  probability: z.coerce.number().min(0).max(100, { message: "Probability must be between 0 and 100" }),
  expected_close_date: z.date().min(new Date(), { message: "Expected close date must be in the future" }),
  primary_contact_id: z.string().optional(),
  assigned_to: z.string().optional(),
});

// Type for form values
type OpportunityFormValues = z.infer<typeof opportunityFormSchema>;

// Props for the component
interface OpportunityFormProps {
  opportunityId?: number;
  initialCustomerId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

// Interface for stage
interface Stage {
  id: string;
  name: string;
  description: string;
}

// Interface for customer
interface Customer {
  id: number;
  name: string;
}

// Interface for contact
interface Contact {
  id: number;
  customer_id: number;
  first_name: string;
  last_name: string;
}

// Mock stages data
const mockStages: Stage[] = [
  { id: "lead", name: "Lead", description: "Initial contact" },
  { id: "qualified", name: "Qualified", description: "Qualified prospect" },
  { id: "proposal", name: "Proposal", description: "Proposal sent" },
  { id: "negotiation", name: "Negotiation", description: "In negotiation" },
  { id: "closed_won", name: "Closed Won", description: "Deal won" },
  { id: "closed_lost", name: "Closed Lost", description: "Deal lost" },
];

// Mock customers
const mockCustomers: Customer[] = [
  { id: 1, name: "Acme Corp" },
  { id: 2, name: "TechStart Inc" },
  { id: 3, name: "Global Services Ltd" },
  { id: 4, name: "Innovative Solutions" },
];

// Mock contacts
const mockContacts: Contact[] = [
  { id: 1, customer_id: 1, first_name: "John", last_name: "Doe" },
  { id: 2, customer_id: 1, first_name: "Jane", last_name: "Smith" },
  { id: 3, customer_id: 2, first_name: "Alex", last_name: "Johnson" },
  { id: 4, customer_id: 3, first_name: "Sarah", last_name: "Williams" },
];

export function OpportunityForm({ 
  opportunityId, 
  initialCustomerId, 
  onSuccess, 
  onCancel 
}: OpportunityFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>(mockStages);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [contacts, setContacts] = useState<Contact[]>(mockContacts);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);

  // Calculate a default expected close date 30 days from now
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Initialize the form
  const form = useForm<OpportunityFormValues>({
    resolver: zodResolver(opportunityFormSchema),
    defaultValues: {
      title: "",
      description: "",
      customer_id: initialCustomerId ? initialCustomerId.toString() : "",
      stage_id: "lead", // Default to lead stage
      value: 0,
      probability: 20, // Default to 20%
      expected_close_date: thirtyDaysFromNow,
      primary_contact_id: "",
      assigned_to: "",
    },
  });

  // Watch the customer_id field to filter related data
  const watchedCustomerId = form.watch("customer_id");

  // Update filtered contacts when customer changes
  useEffect(() => {
    if (watchedCustomerId) {
      const customerId = parseInt(watchedCustomerId);
      setFilteredContacts(contacts.filter(c => c.customer_id === customerId));
    } else {
      setFilteredContacts([]);
    }
  }, [watchedCustomerId, contacts]);

  // Set stage-based default probability
  const watchedStageId = form.watch("stage_id");
  
  useEffect(() => {
    // Set a default probability based on the selected stage
    const probabilityMap: Record<string, number> = {
      "lead": 20,
      "qualified": 40,
      "proposal": 60,
      "negotiation": 80,
      "closed_won": 100,
      "closed_lost": 0
    };
    
    const stageProbability = probabilityMap[watchedStageId] || 20;
    form.setValue("probability", stageProbability);
  }, [watchedStageId, form]);

  // Fetch opportunity data if editing an existing opportunity
  useEffect(() => {
    const fetchOpportunityData = async () => {
      if (!opportunityId) return;
      
      setIsLoading(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/opportunities/${opportunityId}`, {
        //   headers: {
        //     Authorization: `Bearer ${token}`,
        //   },
        // });
        
        // if (!response.ok) {
        //   throw new Error(`Error fetching opportunity: ${response.status}`);
        // }
        
        // const data = await response.json();
        // form.reset({
        //   ...data.opportunity,
        //   expected_close_date: new Date(data.opportunity.expected_close_date),
        //   customer_id: data.opportunity.customer_id.toString(),
        //   stage_id: data.opportunity.stage,
        //   primary_contact_id: data.opportunity.primary_contact_id?.toString(),
        // });
        
        // Mock data for demonstration
        const mockOpportunity = {
          title: "Enterprise Software License",
          description: "Annual enterprise software license renewal with potential upgrades",
          customer_id: "1", // Acme Corp
          stage_id: "proposal",
          value: 25000,
          probability: 60,
          expected_close_date: new Date("2025-07-15"),
          primary_contact_id: "2", // Jane Smith
          assigned_to: "",
        };
        
        form.reset(mockOpportunity);
        
        // Also update filtered contacts based on the customer
        if (mockOpportunity.customer_id) {
          const customerId = parseInt(mockOpportunity.customer_id);
          setFilteredContacts(contacts.filter(c => c.customer_id === customerId));
        }
      } catch (error) {
        console.error("Error fetching opportunity:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Fetch data (in a real implementation)
    const fetchData = async () => {
      // In a real implementation, these would be API calls
      // setStages(await fetchStagesFromAPI());
      // setCustomers(await fetchCustomersFromAPI());
      // setContacts(await fetchContactsFromAPI());
      
      // Just using the mock data for now
      setStages(mockStages);
      setCustomers(mockCustomers);
      setContacts(mockContacts);
      
      // Set initial filtered data if customer is provided
      if (initialCustomerId) {
        setFilteredContacts(contacts.filter(c => c.customer_id === initialCustomerId));
      }
    };
    
    fetchData();
    
    if (opportunityId) {
      fetchOpportunityData();
    }
  }, [opportunityId, form, initialCustomerId, contacts]);

  // Handle form submission
  const onSubmit = async (data: OpportunityFormValues) => {
    setIsLoading(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const endpoint = opportunityId 
        ? `/api/opportunities/${opportunityId}` 
        : `/api/opportunities`;
      
      const method = opportunityId ? "PUT" : "POST";
      
      // In a real implementation, this would be an API call
      // const response = await fetch(endpoint, {
      //   method,
      //   headers: {
      //     "Content-Type": "application/json",
      //     Authorization: `Bearer ${token}`,
      //   },
      //   body: JSON.stringify(data),
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Error ${opportunityId ? "updating" : "creating"} opportunity: ${response.status}`);
      // }
      
      // Simulate API response delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log("Opportunity form submitted:", data);
      
      onSuccess();
    } catch (error) {
      console.error("Error submitting opportunity form:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title *</FormLabel>
              <FormControl>
                <Input placeholder="Opportunity title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="customer_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
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
          
          <FormField
            control={form.control}
            name="primary_contact_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Primary Contact</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={!watchedCustomerId || filteredContacts.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select primary contact" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredContacts.map((contact) => (
                      <SelectItem key={contact.id} value={contact.id.toString()}>
                        {contact.first_name} {contact.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {!watchedCustomerId 
                    ? "Select a customer first" 
                    : filteredContacts.length === 0
                    ? "No contacts available for this customer"
                    : "Main point of contact for this opportunity"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="stage_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {stages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Current stage in the sales pipeline
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="expected_close_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Expected Close Date *</FormLabel>
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
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="value"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Value ($) *</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    placeholder="Opportunity value" 
                    {...field} 
                    onChange={(e) => {
                      const value = e.target.value === "" ? "0" : e.target.value;
                      field.onChange(value);
                    }}
                  />
                </FormControl>
                <FormDescription>
                  Estimated total value of the opportunity
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="probability"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Probability: {field.value}%
                </FormLabel>
                <FormControl>
                  <Slider
                    defaultValue={[field.value]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={(values: number[]) => {
                      field.onChange(values[0]);
                    }}
                    className="py-4"
                  />
                </FormControl>
                <FormDescription>
                  Estimated probability of closing this deal
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Opportunity details, requirements, notes..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {opportunityId ? "Update" : "Create"} Opportunity
          </Button>
        </div>
      </form>
    </Form>
  );
}

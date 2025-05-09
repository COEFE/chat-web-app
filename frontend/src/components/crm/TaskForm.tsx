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
import { Calendar } from "@/components/ui/calendar";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Form validation schema
const taskFormSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().optional(),
  due_date: z.date().optional(),
  priority: z.string(), // Required field, no default
  activity_type_id: z.string(),
  customer_id: z.string().optional(),
  contact_id: z.string().optional(),
  opportunity_id: z.string().optional(),
  assigned_to: z.string().optional(),
});

// Type for form values
type TaskFormValues = z.infer<typeof taskFormSchema>;

// Props for the component
interface TaskFormProps {
  taskId?: number;
  initialCustomerId?: number;
  initialOpportunityId?: number;
  initialContactId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

// Interface for activity type
interface ActivityType {
  id: number;
  name: string;
  description?: string;
  icon?: string;
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

// Interface for opportunity
interface Opportunity {
  id: number;
  customer_id: number;
  title: string;
}

// Mock activity types
const mockActivityTypes: ActivityType[] = [
  { id: 1, name: "Call", description: "Phone call with customer" },
  { id: 2, name: "Email", description: "Email correspondence" },
  { id: 3, name: "Meeting", description: "In-person or virtual meeting" },
  { id: 4, name: "Follow-up", description: "Follow-up on previous interaction" },
  { id: 5, name: "Task", description: "Generic task" },
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

// Mock opportunities
const mockOpportunities: Opportunity[] = [
  { id: 1, customer_id: 1, title: "Enterprise Software License" },
  { id: 2, customer_id: 2, title: "Implementation Services" },
  { id: 3, customer_id: 1, title: "Hardware Upgrade" },
  { id: 4, customer_id: 3, title: "Consulting Project" },
];

export function TaskForm({ 
  taskId, 
  initialCustomerId, 
  initialOpportunityId, 
  initialContactId, 
  onSuccess, 
  onCancel 
}: TaskFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(mockActivityTypes);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [contacts, setContacts] = useState<Contact[]>(mockContacts);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>(mockOpportunities);
  const [filteredOpportunities, setFilteredOpportunities] = useState<Opportunity[]>([]);

  // Initialize the form
  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      title: "",
      description: "",
      due_date: undefined,
      priority: "medium",
      activity_type_id: "5", // Default to generic task
      customer_id: initialCustomerId ? initialCustomerId.toString() : "",
      contact_id: initialContactId ? initialContactId.toString() : "",
      opportunity_id: initialOpportunityId ? initialOpportunityId.toString() : "",
      assigned_to: "",
    },
  });

  // Watch the customer_id field to filter related data
  const watchedCustomerId = form.watch("customer_id");

  // Update filtered contacts and opportunities when customer changes
  useEffect(() => {
    if (watchedCustomerId) {
      const customerId = parseInt(watchedCustomerId);
      setFilteredContacts(contacts.filter(c => c.customer_id === customerId));
      setFilteredOpportunities(opportunities.filter(o => o.customer_id === customerId));
    } else {
      setFilteredContacts([]);
      setFilteredOpportunities([]);
    }
  }, [watchedCustomerId, contacts, opportunities]);

  // Fetch task data if editing an existing task
  useEffect(() => {
    const fetchTaskData = async () => {
      if (!taskId) return;
      
      setIsLoading(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/tasks/${taskId}`, {
        //   headers: {
        //     Authorization: `Bearer ${token}`,
        //   },
        // });
        
        // if (!response.ok) {
        //   throw new Error(`Error fetching task: ${response.status}`);
        // }
        
        // const data = await response.json();
        // form.reset({
        //   ...data.task,
        //   due_date: data.task.due_date ? new Date(data.task.due_date) : undefined,
        //   customer_id: data.task.customer_id?.toString(),
        //   contact_id: data.task.contact_id?.toString(),
        //   opportunity_id: data.task.opportunity_id?.toString(),
        //   activity_type_id: data.task.activity_type_id.toString(),
        // });
        
        // Mock data for demonstration
        const mockTask = {
          title: "Follow up on proposal",
          description: "Check if the client has reviewed our proposal and address any questions",
          due_date: new Date("2025-05-15"),
          priority: "high",
          activity_type_id: "4", // Follow-up
          customer_id: "1", // Acme Corp
          contact_id: "2", // Jane Smith
          opportunity_id: "1", // Enterprise Software License
          assigned_to: "",
        };
        
        form.reset(mockTask);
      } catch (error) {
        console.error("Error fetching task:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Fetch data (in a real implementation)
    const fetchData = async () => {
      // In a real implementation, these would be API calls
      // setActivityTypes(await fetchActivityTypesFromAPI());
      // setCustomers(await fetchCustomersFromAPI());
      // setContacts(await fetchContactsFromAPI());
      // setOpportunities(await fetchOpportunitiesFromAPI());
      
      // Just using the mock data for now
      setActivityTypes(mockActivityTypes);
      setCustomers(mockCustomers);
      setContacts(mockContacts);
      setOpportunities(mockOpportunities);
      
      // Set initial filtered data if customer is provided
      if (initialCustomerId) {
        setFilteredContacts(contacts.filter(c => c.customer_id === initialCustomerId));
        setFilteredOpportunities(opportunities.filter(o => o.customer_id === initialCustomerId));
      }
    };
    
    fetchData();
    
    if (taskId) {
      fetchTaskData();
    }
  }, [taskId, form, initialCustomerId, contacts, opportunities]);

  // Handle form submission
  const onSubmit = async (data: TaskFormValues) => {
    setIsLoading(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const endpoint = taskId 
        ? `/api/tasks/${taskId}` 
        : `/api/tasks`;
      
      const method = taskId ? "PUT" : "POST";
      
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
      //   throw new Error(`Error ${taskId ? "updating" : "creating"} task: ${response.status}`);
      // }
      
      // Simulate API response delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log("Task form submitted:", data);
      
      onSuccess();
    } catch (error) {
      console.error("Error submitting task form:", error);
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
                <Input placeholder="Task title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="activity_type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Activity Type *</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select activity type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {activityTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
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
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="due_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Due Date</FormLabel>
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
          
          <FormField
            control={form.control}
            name="customer_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer</FormLabel>
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
                <FormDescription>
                  Link this task to a customer
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="contact_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={!watchedCustomerId || filteredContacts.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
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
                    : "Link this task to a specific contact"}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="opportunity_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Opportunity</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                  disabled={!watchedCustomerId || filteredOpportunities.length === 0}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select opportunity" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {filteredOpportunities.map((opportunity) => (
                      <SelectItem key={opportunity.id} value={opportunity.id.toString()}>
                        {opportunity.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {!watchedCustomerId 
                    ? "Select a customer first" 
                    : filteredOpportunities.length === 0
                    ? "No opportunities available for this customer"
                    : "Link this task to a specific opportunity"}
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
                  placeholder="Task description and details"
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
            {taskId ? "Update" : "Create"} Task
          </Button>
        </div>
      </form>
    </Form>
  );
}

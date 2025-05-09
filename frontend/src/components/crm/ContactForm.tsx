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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAuth } from "firebase/auth";
import { Loader2 } from "lucide-react";

// Form validation schema
const contactFormSchema = z.object({
  first_name: z.string().min(1, { message: "First name is required" }),
  last_name: z.string().min(1, { message: "Last name is required" }),
  email: z.string().email({ message: "Invalid email address" }).optional().or(z.literal("")),
  phone: z.string().optional(),
  role_id: z.string().optional(),
  job_title: z.string().optional(),
  is_primary: z.boolean(), // Required field with no default
  notes: z.string().optional(),
});

// Type for form values
type ContactFormValues = z.infer<typeof contactFormSchema>;

// Props for the component
interface ContactFormProps {
  customerId: number;
  contactId?: number;
  onSuccess: () => void;
  onCancel: () => void;
}

// Interface for role data
interface Role {
  id: number;
  name: string;
  description?: string;
}

// Mock roles data - in a real implementation this would come from the API
const mockRoles: Role[] = [
  { id: 1, name: "Decision Maker", description: "Can make purchase decisions" },
  { id: 2, name: "Influencer", description: "Influences decisions" },
  { id: 3, name: "End User", description: "Uses the product/service" },
  { id: 4, name: "Technical Contact", description: "Handles technical aspects" },
  { id: 5, name: "Billing Contact", description: "Handles billing and payments" },
];

export function ContactForm({ customerId, contactId, onSuccess, onCancel }: ContactFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [roles, setRoles] = useState<Role[]>(mockRoles);
  const [initialData, setInitialData] = useState<ContactFormValues | null>(null);

  // Initialize the form
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      role_id: "",
      job_title: "",
      is_primary: false,
      notes: "",
    },
  });

  // Fetch contact data if editing an existing contact
  useEffect(() => {
    const fetchContactData = async () => {
      if (!contactId) return;
      
      setIsLoading(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        
        // In a real implementation, this would be an API call
        // const response = await fetch(`/api/contacts/${contactId}`, {
        //   headers: {
        //     Authorization: `Bearer ${token}`,
        //   },
        // });
        
        // if (!response.ok) {
        //   throw new Error(`Error fetching contact: ${response.status}`);
        // }
        
        // const data = await response.json();
        // setInitialData(data.contact);
        // form.reset(data.contact);
        
        // Mock data for demonstration
        const mockContact = {
          first_name: "John",
          last_name: "Doe",
          email: "john.doe@example.com",
          phone: "555-123-4567",
          role_id: "1",
          job_title: "CTO",
          is_primary: true,
          notes: "Key technical decision maker",
        };
        
        setInitialData(mockContact);
        form.reset(mockContact);
      } catch (error) {
        console.error("Error fetching contact:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Fetch roles (in a real implementation)
    const fetchRoles = async () => {
      // In a real implementation, this would fetch from the API
      // setRoles(await fetchRolesFromAPI());
      
      // Just using the mock data for now
      setRoles(mockRoles);
    };
    
    fetchRoles();
    if (contactId) {
      fetchContactData();
    }
  }, [contactId, form]);

  // Handle form submission
  const onSubmit = async (data: ContactFormValues) => {
    setIsLoading(true);
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const endpoint = contactId 
        ? `/api/contacts/${contactId}` 
        : `/api/contacts`;
      
      const method = contactId ? "PUT" : "POST";
      
      // In a real implementation, this would be an API call
      // const response = await fetch(endpoint, {
      //   method,
      //   headers: {
      //     "Content-Type": "application/json",
      //     Authorization: `Bearer ${token}`,
      //   },
      //   body: JSON.stringify({
      //     ...data,
      //     customer_id: customerId,
      //   }),
      // });
      
      // if (!response.ok) {
      //   throw new Error(`Error ${contactId ? "updating" : "creating"} contact: ${response.status}`);
      // }
      
      // Simulate API response delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log("Contact form submitted:", {
        ...data,
        customer_id: customerId,
      });
      
      onSuccess();
    } catch (error) {
      console.error("Error submitting contact form:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="first_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name *</FormLabel>
                <FormControl>
                  <Input placeholder="First name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="last_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last Name *</FormLabel>
                <FormControl>
                  <Input placeholder="Last name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="Email address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input placeholder="Phone number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="job_title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Job Title</FormLabel>
                <FormControl>
                  <Input placeholder="Job title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="role_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select 
                  onValueChange={field.onChange} 
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id.toString()}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  The contact's role within the customer organization
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="is_primary"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>Primary Contact</FormLabel>
                <FormDescription>
                  Mark this as the primary contact for the customer
                </FormDescription>
              </div>
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional notes about this contact"
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
            {contactId ? "Update" : "Create"} Contact
          </Button>
        </div>
      </form>
    </Form>
  );
}

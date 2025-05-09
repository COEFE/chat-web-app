"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getAuth } from "firebase/auth";
import { 
  User, Mail, Phone, Building, Calendar, DollarSign, 
  ExternalLink, UserPlus, FileEdit, BarChart3, Clock
} from "lucide-react";

interface CustomerProfileProps {
  customerId: number;
}

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  notes?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  status: string;
}

interface Activity {
  id: number;
  type: string;
  title: string;
  description?: string;
  date: string;
  user: string;
}

export function CustomerProfile({ customerId }: CustomerProfileProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  
  // Mock data for activities - in a real implementation this would come from an API
  const mockActivities: Activity[] = [
    {
      id: 1,
      type: "email",
      title: "Sent follow-up email",
      description: "Discussed upcoming project requirements",
      date: "2025-05-05T14:30:00Z",
      user: "Chris Ealy"
    },
    {
      id: 2,
      type: "call",
      title: "Phone call with client",
      description: "Quarterly review call",
      date: "2025-04-28T10:15:00Z",
      user: "Chris Ealy"
    },
    {
      id: 3,
      type: "meeting",
      title: "Client meeting",
      description: "Demo of new features",
      date: "2025-04-20T15:00:00Z",
      user: "Chris Ealy"
    }
  ];
  
  // Mock data for opportunities - in a real implementation this would come from an API
  const mockOpportunities = [
    {
      id: 1,
      title: "Annual Service Contract",
      stage: "Proposal",
      value: 12000,
      probability: 70,
      expected_close: "2025-06-15"
    },
    {
      id: 2,
      title: "Software Implementation",
      stage: "Negotiation",
      value: 25000,
      probability: 50,
      expected_close: "2025-07-10"
    }
  ];
  
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        
        // Fetch customer details
        const customerResponse = await fetch(`/api/customers/${customerId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (!customerResponse.ok) {
          throw new Error(`Error fetching customer: ${customerResponse.status}`);
        }
        
        const customerData = await customerResponse.json();
        setCustomer(customerData.customer);
        
        // Fetch customer invoices
        const invoicesResponse = await fetch(`/api/invoices?customer_id=${customerId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        if (!invoicesResponse.ok) {
          throw new Error(`Error fetching invoices: ${invoicesResponse.status}`);
        }
        
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData.invoices || []);
        
      } catch (error) {
        console.error("Error fetching customer profile data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    if (customerId) {
      fetchData();
    }
  }, [customerId]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse text-muted-foreground">Loading customer profile...</div>
      </div>
    );
  }
  
  if (!customer) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl font-medium mb-2">Customer Not Found</h2>
        <p className="text-muted-foreground">The requested customer could not be found.</p>
      </div>
    );
  }
  
  // Calculate customer statistics
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + invoice.total_amount, 0);
  const openInvoices = invoices.filter(inv => inv.status !== 'paid').length;
  const daysSinceCreation = Math.floor((new Date().getTime() - new Date(customer.created_at).getTime()) / (1000 * 3600 * 24));
  
  return (
    <div className="space-y-6">
      {/* Customer header card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary/10 text-primary text-xl">
                  {customer.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-2xl">{customer.name}</CardTitle>
                <div className="flex items-center mt-1 text-sm text-muted-foreground">
                  <Building className="mr-1 h-4 w-4" />
                  <span>Customer for {daysSinceCreation} days</span>
                </div>
              </div>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                <FileEdit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                Add Contact
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              {customer.email && (
                <div className="flex items-center text-sm">
                  <Mail className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center text-sm">
                  <Phone className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start text-sm">
                  <Building className="mr-2 h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <div>{customer.address}</div>
                    {customer.city && customer.state && (
                      <div>{customer.city}, {customer.state} {customer.postal_code}</div>
                    )}
                    {customer.country && <div>{customer.country}</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {customer.website && (
                <div className="flex items-center text-sm">
                  <ExternalLink className="mr-2 h-4 w-4 text-muted-foreground" />
                  <a href={customer.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {customer.website.replace(/^https?:\/\//, '')}
                  </a>
                </div>
              )}
              <div className="flex items-center text-sm">
                <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Created: {new Date(customer.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center text-sm">
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>Last Updated: {new Date(customer.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <div className="text-2xl font-bold">${totalInvoiced.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Invoices</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <div className="text-2xl font-bold">{openInvoices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <div className="text-2xl font-bold">
              ${mockOpportunities.reduce((sum, opp) => sum + opp.value, 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Engagement</CardTitle>
          </CardHeader>
          <CardContent className="py-1">
            <div className="text-2xl font-bold">{mockActivities.length} activities</div>
          </CardContent>
        </Card>
      </div>
      
      {/* Customer details tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="activities">Activities</TabsTrigger>
          <TabsTrigger value="contacts" className="hidden lg:block">Contacts</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="col-span-2">
              <CardHeader className="pb-3">
                <CardTitle>Notes</CardTitle>
                <CardDescription>
                  Internal notes about this customer
                </CardDescription>
              </CardHeader>
              <CardContent>
                {customer.notes ? (
                  <p className="text-sm whitespace-pre-line">{customer.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No notes have been added for this customer.</p>
                )}
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm">Add Note</Button>
              </CardFooter>
            </Card>
            
            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="pb-1">
                  {mockActivities.length > 0 ? (
                    <div className="space-y-4">
                      {mockActivities.slice(0, 3).map(activity => (
                        <div key={activity.id} className="flex items-start space-x-3">
                          <div className="bg-primary/10 rounded-full p-1.5">
                            {activity.type === 'email' && <Mail className="h-3.5 w-3.5 text-primary" />}
                            {activity.type === 'call' && <Phone className="h-3.5 w-3.5 text-primary" />}
                            {activity.type === 'meeting' && <User className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <p className="text-sm font-medium leading-none">{activity.title}</p>
                            <p className="text-xs text-muted-foreground">{new Date(activity.date).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent activities found.</p>
                  )}
                </CardContent>
                <CardFooter className="pt-1">
                  <Button variant="link" size="sm" className="px-0">View all activities</Button>
                </CardFooter>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Open Opportunities</CardTitle>
                </CardHeader>
                <CardContent className="pb-1">
                  {mockOpportunities.length > 0 ? (
                    <div className="space-y-4">
                      {mockOpportunities.map(opportunity => (
                        <div key={opportunity.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{opportunity.title}</span>
                            <Badge variant="outline">{opportunity.stage}</Badge>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <div className="flex items-center">
                              <DollarSign className="h-3.5 w-3.5 mr-1" />
                              <span>${opportunity.value.toLocaleString()}</span>
                            </div>
                            <div>
                              <span>Close: {new Date(opportunity.expected_close).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No open opportunities.</p>
                  )}
                </CardContent>
                <CardFooter className="pt-1">
                  <Button variant="link" size="sm" className="px-0">View all opportunities</Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="invoices" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>
                All invoices for this customer
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoices.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-sm text-muted-foreground">
                        <th className="text-left font-medium p-2 pl-0">Invoice #</th>
                        <th className="text-left font-medium p-2">Date</th>
                        <th className="text-left font-medium p-2">Due Date</th>
                        <th className="text-right font-medium p-2">Amount</th>
                        <th className="text-left font-medium p-2">Status</th>
                        <th className="text-right font-medium p-2 pr-0">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(invoice => (
                        <tr key={invoice.id} className="border-b text-sm">
                          <td className="p-2 pl-0">{invoice.invoice_number}</td>
                          <td className="p-2">{new Date(invoice.invoice_date).toLocaleDateString()}</td>
                          <td className="p-2">{new Date(invoice.due_date).toLocaleDateString()}</td>
                          <td className="p-2 text-right">${invoice.total_amount.toLocaleString()}</td>
                          <td className="p-2">
                            <Badge 
                              variant={
                                invoice.status === 'paid' ? 'default' : 
                                invoice.status === 'overdue' ? 'destructive' : 'outline'
                              }
                            >
                              {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                            </Badge>
                          </td>
                          <td className="p-2 pr-0 text-right">
                            <Button variant="ghost" size="sm">View</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground">No invoices found for this customer.</p>
              )}
            </CardContent>
            <CardFooter>
              <Button>
                <DollarSign className="mr-2 h-4 w-4" />
                Create Invoice
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="opportunities" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Opportunities</CardTitle>
                  <CardDescription>
                    Sales opportunities with this customer
                  </CardDescription>
                </div>
                <Button>
                  <BarChart3 className="mr-2 h-4 w-4" />
                  New Opportunity
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {mockOpportunities.length > 0 ? (
                <div className="space-y-5">
                  {mockOpportunities.map(opportunity => (
                    <Card key={opportunity.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{opportunity.title}</CardTitle>
                          <Badge>{opportunity.stage}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Value</p>
                            <p className="font-medium">${opportunity.value.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Probability</p>
                            <p className="font-medium">{opportunity.probability}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Expected Close</p>
                            <p className="font-medium">{new Date(opportunity.expected_close).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No opportunities found for this customer.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="activities" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Activities</CardTitle>
                  <CardDescription>
                    All interactions with this customer
                  </CardDescription>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline">Log Activity</Button>
                  <Button>Schedule Task</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {mockActivities.length > 0 ? (
                <div className="relative space-y-0">
                  {/* Timeline bar */}
                  <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-muted"></div>
                  
                  {mockActivities.map((activity, i) => (
                    <div key={activity.id} className="relative pl-9 pb-6">
                      <div className="absolute left-0 top-1 flex items-center justify-center w-7 h-7 rounded-full bg-background border-2 border-muted">
                        {activity.type === 'email' && <Mail className="h-3.5 w-3.5 text-primary" />}
                        {activity.type === 'call' && <Phone className="h-3.5 w-3.5 text-primary" />}
                        {activity.type === 'meeting' && <User className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <div className="font-medium text-sm">{activity.title}</div>
                      <div className="text-muted-foreground text-xs mt-1">
                        {new Date(activity.date).toLocaleString()} by {activity.user}
                      </div>
                      {activity.description && (
                        <div className="mt-2 text-sm">
                          {activity.description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No activities recorded for this customer.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="contacts" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contacts</CardTitle>
                  <CardDescription>
                    People associated with this customer
                  </CardDescription>
                </div>
                <Button>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Contact management will be implemented in the next phase.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

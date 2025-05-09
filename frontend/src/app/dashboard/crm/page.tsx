"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import { 
  Users, 
  Building2, 
  PieChart, 
  CalendarClock, 
  ListTodo,
  BarChart3,
  Inbox,
  Activity
} from "lucide-react";
import Link from "next/link";
import { AccountingNav } from "@/components/dashboard/AccountingNav";

// A simple dashboard card component for reuse
function DashboardCard({ 
  title, 
  description, 
  icon: Icon, 
  value, 
  footer, 
  linkHref,
  linkText = "View Details"
}: { 
  title: string; 
  description: string; 
  icon: any; 
  value: string | number; 
  footer?: string;
  linkHref?: string;
  linkText?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            {description}
          </CardDescription>
        </div>
        <div className="bg-primary/10 rounded-full p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {footer && (
          <p className="text-xs text-muted-foreground mt-1">
            {footer}
          </p>
        )}
      </CardContent>
      {linkHref && (
        <CardFooter className="pt-1">
          <Link 
            href={linkHref}
            className="text-xs text-primary hover:underline w-full text-right"
          >
            {linkText} →
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}

export default function CRMDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [isLoading, setIsLoading] = useState(false);
  
  // In a real implementation, this would fetch actual data from the API
  const mockStats = {
    totalCustomers: 24,
    activeOpportunities: 8,
    upcomingTasks: 12,
    recentActivities: 45,
    customerEngagement: "72%",
    openTickets: 3
  };
  
  // Navigation items for the CRM section
  const crmNavItems = [
    { name: "Dashboard", href: "/dashboard/crm", icon: PieChart, current: true },
    { name: "Customers", href: "/dashboard/accounts-receivable/customers", icon: Users, current: false },
    { name: "Opportunities", href: "/dashboard/crm/opportunities", icon: BarChart3, current: false },
    { name: "Activities", href: "/dashboard/crm/activities", icon: CalendarClock, current: false },
    { name: "Tasks", href: "/dashboard/crm/tasks", icon: ListTodo, current: false },
    { name: "Support", href: "/dashboard/crm/support", icon: Inbox, current: false },
    { name: "Reports", href: "/dashboard/crm/reports", icon: Activity, current: false },
  ];
  
  return (
    <div className="container mx-auto py-6">
      {/* Reuse the existing accounting nav which includes Accounts Receivable */}
      <AccountingNav />
      
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">CRM Dashboard</h1>
        <Button 
          onClick={() => router.push("/dashboard/accounts-receivable/customers")}
        >
          <Users className="mr-2 h-4 w-4" />
          View Customers
        </Button>
      </div>
      
      {/* CRM-specific navigation */}
      <div className="flex gap-2 mb-6 overflow-x-auto py-2 px-0.5">
        {crmNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap
              ${item.current ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
          >
            <item.icon className="h-4 w-4" />
            {item.name}
          </Link>
        ))}
      </div>
      
      {/* Dashboard tabs */}
      <Tabs defaultValue="overview" onValueChange={setActiveTab} className="mb-8">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="engagement">Engagement</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <DashboardCard
              title="Customers"
              description="Total customers in the CRM"
              icon={Users}
              value={mockStats.totalCustomers}
              linkHref="/dashboard/accounts-receivable/customers"
            />
            <DashboardCard
              title="Opportunities"
              description="Active sales opportunities"
              icon={BarChart3}
              value={mockStats.activeOpportunities}
              footer="Total potential value: $125,000"
              linkHref="/dashboard/crm/opportunities"
            />
            <DashboardCard
              title="Upcoming Tasks"
              description="Tasks due in the next 7 days"
              icon={ListTodo}
              value={mockStats.upcomingTasks}
              linkHref="/dashboard/crm/tasks"
            />
            <DashboardCard
              title="Recent Activities"
              description="Activities in the last 30 days"
              icon={CalendarClock}
              value={mockStats.recentActivities}
              linkHref="/dashboard/crm/activities"
            />
            <DashboardCard
              title="Customer Engagement"
              description="Average engagement rate"
              icon={Activity}
              value={mockStats.customerEngagement}
              footer="12% increase from last month"
            />
            <DashboardCard
              title="Open Support Tickets"
              description="Customer support tickets"
              icon={Inbox}
              value={mockStats.openTickets}
              linkHref="/dashboard/crm/support"
            />
          </div>
        </TabsContent>
        
        <TabsContent value="sales" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Sales Pipeline Overview</CardTitle>
              <CardDescription>
                Track your sales pipeline and opportunities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 flex items-center justify-center text-muted-foreground">
                <p>Sales pipeline visualization will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="engagement" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Customer Engagement</CardTitle>
              <CardDescription>
                Track interactions and engagement metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 flex items-center justify-center text-muted-foreground">
                <p>Customer engagement metrics will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="support" className="mt-0">
          <Card>
            <CardHeader>
              <CardTitle>Customer Support</CardTitle>
              <CardDescription>
                Track support tickets and response times
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="py-8 flex items-center justify-center text-muted-foreground">
                <p>Support metrics will be displayed here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <Separator className="my-8" />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activities</CardTitle>
            <CardDescription>
              Latest activities and customer interactions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <p>Recent activity timeline will be displayed here</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => router.push("/dashboard/crm/activities")}>
              View All Activities
            </Button>
          </CardFooter>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Tasks Due Soon</CardTitle>
            <CardDescription>
              Tasks that require your attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <p>Task list will be displayed here</p>
            </div>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" onClick={() => router.push("/dashboard/crm/tasks")}>
              View All Tasks
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Database, TestTube, Server } from "lucide-react";

export default function AdminDashboardPage() {
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Database Administration
            </CardTitle>
            <CardDescription>
              Manage database migrations and schema updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Apply database schema updates, run migrations, and manage database configuration.
            </p>
            <Button asChild className="w-full">
              <Link href="/dashboard/admin/database">
                Go to Database Admin
              </Link>
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TestTube className="mr-2 h-5 w-5" />
              Agent Tests
            </CardTitle>
            <CardDescription>
              Run tests for various agent components
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Test Credit Card Agent, AP Agent, and other components to ensure proper functionality.
            </p>
            <Button asChild className="w-full">
              <Link href="/dashboard/admin/agent-tests">
                Go to Agent Tests
              </Link>
            </Button>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Server className="mr-2 h-5 w-5" />
              System Configuration
            </CardTitle>
            <CardDescription>
              Configure system settings and parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Manage system settings, API keys, and other configuration parameters.
            </p>
            <Button asChild className="w-full" disabled>
              <Link href="#">
                Coming Soon
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

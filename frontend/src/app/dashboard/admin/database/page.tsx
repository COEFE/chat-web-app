"use client";

import { useState } from "react";
import { RunMigrationButton } from "@/components/admin/RunMigrationButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function DatabaseAdminPage() {
  return (
    <div className="container mx-auto py-4">
      <h1 className="text-2xl font-bold mb-4">Database Administration</h1>
      
      <Tabs defaultValue="migrations" className="w-full">
        <TabsList>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="migrations">
          <Card>
            <CardHeader>
              <CardTitle>Database Migrations</CardTitle>
              <CardDescription>
                Apply database schema updates and migrations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-medium">Accounting Schema Update</h3>
                <p className="text-muted-foreground mb-2">
                  Applies the accounting schema updates including account types, check constraints, and indexes.
                </p>
                <RunMigrationButton 
                  migrationFile="accounting-schema-update.sql" 
                  buttonText="Update Accounting Schema"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { RunMigrationButton } from "@/components/admin/RunMigrationButton";
import { RunAllMigrationsButton } from "@/components/admin/RunAllMigrationsButton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";

export default function DatabaseAdminPage() {
  const [availableMigrations, setAvailableMigrations] = useState<string[]>([]);
  const [selectedMigration, setSelectedMigration] = useState<string>("");

  useEffect(() => {
    // In a real implementation, you might fetch this from an API endpoint
    // For now, we'll hardcode the available migrations
    const migrations = [
      "accounting-schema-update.sql",
      "011_create_bank_statements_table.sql",
      "022_add_fields_to_bill_lines.sql",
      "023_remove_vendor_from_bill_lines.sql",
      "024_add_account_type_to_accounts.sql",
      "025_add_bill_payment_journal_type.sql",
      "026_fix_bill_payment_amounts.sql",
      "026_create_audit_logs_table.sql",
      "027_fix_journal_balance_trigger.sql"
    ];
    setAvailableMigrations(migrations);
  }, []);

  // Description mapping for common migrations
  const getMigrationDescription = (filename: string) => {
    const descriptions: Record<string, string> = {
      "accounting-schema-update.sql": "Applies the accounting schema updates including account types, check constraints, and indexes.",
      "011_create_bank_statements_table.sql": "Creates the bank_statements table for storing bank statement data. Required for the bank reconciliation feature.",
      "022_add_fields_to_bill_lines.sql": "Adds category, location, vendor, and funder fields to bill line items to match journal entries.",
      "023_remove_vendor_from_bill_lines.sql": "Removes the vendor field from bill line items since it's redundant with the bill's vendor_id.",
      "024_add_account_type_to_accounts.sql": "Adds account_type column to accounts table and populates it based on account code prefixes. Required for improved filtering and categorization of accounts.",
      "025_add_bill_payment_journal_type.sql": "Adds the 'BP' (Bill Payment) journal type to the journal_types table. Required for recording bill payments.",
      "026_fix_bill_payment_amounts.sql": "Fixes bill payment amounts and statuses for bills where the payment was recorded correctly but the bill status wasn't updated properly.",
      "026_create_audit_logs_table.sql": "Creates the audit_logs table for storing detailed user activity records. Required for the audit trail system.",
      "027_fix_journal_balance_trigger.sql": "Converts journal balance trigger to a deferrable constraint trigger, preventing false imbalance errors when saving multi-line journal entries."
    };
    return descriptions[filename] || "Run this migration to update your database schema.";
  };

  const handleMigrationSelect = (value: string) => {
    setSelectedMigration(value);
  };

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
              {/* Predefined migrations */}
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

              {/* Run all pending migrations */}
              <div className="space-y-2 border-t pt-4">
                <h3 className="text-lg font-medium">Run All Pending Migrations</h3>
                <p className="text-muted-foreground mb-2">
                  Automatically runs all pending database migrations in the correct order.
                </p>
                <RunAllMigrationsButton />
              </div>
              
              {/* Custom migration selector */}
              <div className="space-y-4 border-t pt-4">
                <h3 className="text-lg font-medium">Run Specific Migration</h3>
                <p className="text-muted-foreground mb-2">
                  Select and run a specific database migration file.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Select onValueChange={handleMigrationSelect} value={selectedMigration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a migration file" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMigrations.map((migration) => (
                          <SelectItem key={migration} value={migration}>
                            {migration}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <RunMigrationButton 
                      migrationFile={selectedMigration} 
                      buttonText="Run Migration"
                      disabled={!selectedMigration}
                    />
                  </div>
                </div>
                
                {selectedMigration && (
                  <div className="bg-muted p-3 rounded-md mt-2">
                    <h4 className="font-medium">Description:</h4>
                    <p className="text-sm text-muted-foreground">
                      {getMigrationDescription(selectedMigration)}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

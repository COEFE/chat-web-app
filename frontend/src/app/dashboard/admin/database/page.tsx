"use client";

import { useState, useEffect } from "react";
import { RunMigrationButton } from "@/components/admin/RunMigrationButton";
import { RunAllMigrationsButton } from "@/components/admin/RunAllMigrationsButton";
import { RunJournalUserIdMigration } from "@/components/admin/RunJournalUserIdMigration";
import { AddUserIdColumnsButton } from "@/components/admin/AddUserIdColumnsButton";
import { FixInvoicePaymentsButton } from "@/components/admin/FixInvoicePaymentsButton";
import { FixCustomerQueriesButton } from "@/components/admin/FixCustomerQueriesButton";
import { FixJournalsUserIdButton } from "@/components/admin/FixJournalsUserIdButton";
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
      "012_create_statement_trackers_table.sql",
      "013_add_is_bank_account_to_accounts.sql",
      "022_add_fields_to_bill_lines.sql",
      "023_remove_vendor_from_bill_lines.sql",
      "024_add_account_type_to_accounts.sql",
      "025_add_bill_payment_journal_type.sql",
      "026_fix_bill_payment_amounts.sql",
      "026_create_audit_logs_table.sql",
      "027_fix_journal_balance_trigger.sql",
      "034_add_journal_reversal_columns.sql",
      "035_recreate_audit_logs_table.sql",
      "036_add_user_id_to_journals.sql"
    ];
    setAvailableMigrations(migrations);
  }, []);

  // Description mapping for common migrations
  const getMigrationDescription = (filename: string) => {
    const descriptions: Record<string, string> = {
      "accounting-schema-update.sql": "Applies the accounting schema updates including account types, check constraints, and indexes.",
      "011_create_bank_statements_table.sql": "Creates the bank_statements table for storing bank statement data. Required for the bank reconciliation feature.",
      "012_create_statement_trackers_table.sql": "Creates the statement_trackers table for tracking processed bank and credit card statements. Required for the AP Agent Memory System to recognize previously processed statements and avoid duplicate entries. Also adds user_id to accounts table if missing.",
      "013_add_is_bank_account_to_accounts.sql": "Adds is_bank_account column to the accounts table. Required for the AP Agent Memory System to properly identify bank accounts for statement processing.",
      "022_add_fields_to_bill_lines.sql": "Adds category, location, vendor, and funder fields to bill line items to match journal entries.",
      "023_remove_vendor_from_bill_lines.sql": "Removes the vendor field from bill line items since it's redundant with the bill's vendor_id.",
      "024_add_account_type_to_accounts.sql": "Adds account_type column to accounts table and populates it based on account code prefixes. Required for improved filtering and categorization of accounts.",
      "025_add_bill_payment_journal_type.sql": "Adds the 'BP' (Bill Payment) journal type to the journal_types table. Required for recording bill payments.",
      "026_fix_bill_payment_amounts.sql": "Fixes bill payment amounts and statuses for bills where the payment was recorded correctly but the bill status wasn't updated properly.",
      "026_create_audit_logs_table.sql": "Creates the audit_logs table for storing detailed user activity records. Required for the audit trail system.",
      "027_fix_journal_balance_trigger.sql": "Converts journal balance trigger to a deferrable constraint trigger, preventing false imbalance errors when saving multi-line journal entries.",
      "034_add_journal_reversal_columns.sql": "Adds reversal_of_journal_id and reversed_by_journal_id columns to the journals table. Required for the journal reversal feature.",
      "035_recreate_audit_logs_table.sql": "Recreates the audit_logs table to resolve issues with the previous migration. Required for the audit trail system to function properly.",
      "036_add_user_id_to_journals.sql": "Adds user_id column to journals table and creates an index for better performance. CRITICAL SECURITY UPDATE: Required for proper data isolation between user accounts."
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
              {/* Comprehensive Security Update */}
              <div className="space-y-2 bg-red-50 dark:bg-red-950 p-4 rounded-md border border-red-200 dark:border-red-800">
                <h3 className="text-lg font-medium text-red-700 dark:text-red-400">CRITICAL SECURITY UPDATE</h3>
                <p className="text-muted-foreground mb-2">
                  Multiple tables are missing user_id columns needed for proper data isolation between user accounts. This is a critical security vulnerability that could allow users to see data from other accounts.
                </p>
                <div className="flex flex-col space-y-4">
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-red-100 dark:border-red-900">
                    <h4 className="font-medium mb-1">Comprehensive Security Fix</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      This will add user_id columns to 22 tables that need it for proper data isolation, including bank accounts, transactions, bills, invoices, and more.
                    </p>
                    <AddUserIdColumnsButton 
                      variant="destructive"
                    />
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-red-100 dark:border-red-900">
                    <h4 className="font-medium mb-1">Fix Invoice Payments Table</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      The invoice_payments table needs additional fixes to resolve the "record 'new' has no field 'updated_at'" error.
                    </p>
                    <FixInvoicePaymentsButton 
                      variant="destructive"
                    />
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-red-100 dark:border-red-900">
                    <h4 className="font-medium mb-1">Fix Customer Data Isolation</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Customers and customer invoices need proper user_id filtering to prevent data leakage between accounts.
                    </p>
                    <FixCustomerQueriesButton 
                      variant="destructive"
                    />
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-red-100 dark:border-red-900">
                    <h4 className="font-medium mb-1">Fix Journal Entries Data Isolation</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Journal entries need proper user_id assignment to prevent data leakage between accounts.
                    </p>
                    <FixJournalsUserIdButton 
                      variant="destructive"
                    />
                  </div>
                  
                  <div className="bg-white dark:bg-gray-800 p-3 rounded-md border border-red-100 dark:border-red-900">
                    <h4 className="font-medium mb-1">Journal Table Security Fix</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      If you prefer to fix only the journals table first, you can use these steps instead:
                    </p>
                    <div className="flex flex-col space-y-2">
                      <RunMigrationButton 
                        migrationFile="036_add_user_id_to_journals.sql" 
                        buttonText="Step 1: Apply Database Schema Update"
                      />
                      <p className="text-sm text-muted-foreground mt-2">After applying the schema update, run step 2 to associate existing journals with your user account:</p>
                      <RunJournalUserIdMigration />
                    </div>
                  </div>
                </div>
              </div>

              {/* Accounting Schema Update */}
              <div className="space-y-2 mt-4">
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

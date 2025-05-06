"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Check, X, Database, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SchemaCheckPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningSetup, setIsRunningSetup] = useState(false);
  const [schemaData, setSchemaData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("tables");
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!user) router.push('/login');
    else checkSchema();
  }, [user, router]);

  const checkSchema = async () => {
    setIsLoading(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');

      const res = await fetch('/api/verify-schema', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to verify schema');
      }

      const data = await res.json();
      setSchemaData(data);
    } catch (error) {
      console.error('Error verifying schema:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to verify database schema",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runSetup = async () => {
    setIsRunningSetup(true);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Authentication required');

      // Run setup for accounts
      const accountsRes = await fetch('/api/accounts/db-setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!accountsRes.ok) {
        const error = await accountsRes.json();
        throw new Error(`Accounts setup failed: ${error.error || 'Unknown error'}`);
      }

      // Run setup for journals
      const journalsRes = await fetch('/api/journals/db-setup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!journalsRes.ok) {
        const error = await journalsRes.json();
        throw new Error(`Journals setup failed: ${error.error || 'Unknown error'}`);
      }

      toast({
        title: "Setup Complete",
        description: "Database schema has been successfully created",
      });

      // Refresh schema data
      await checkSchema();
    } catch (error) {
      console.error('Error running setup:', error);
      toast({
        title: "Setup Error",
        description: error instanceof Error ? error.message : "Failed to set up database schema",
        variant: "destructive"
      });
    } finally {
      setIsRunningSetup(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Database Schema Check</h1>
        <div className="flex space-x-2">
          <Button onClick={checkSchema} variant="outline" className="flex items-center">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            onClick={runSetup} 
            disabled={isRunningSetup}
            className="flex items-center"
          >
            {isRunningSetup ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running Setup...
              </>
            ) : (
              <>
                <Database className="h-4 w-4 mr-2" />
                Run Setup
              </>
            )}
          </Button>
        </div>
      </div>

      {schemaData && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Tables</CardTitle>
                <CardDescription>Required database tables</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {schemaData.missingTables.length === 0 ? (
                    <div className="flex items-center text-green-600">
                      <Check className="h-6 w-6 mr-2" />
                      All Present
                    </div>
                  ) : (
                    <div className="flex items-center text-red-600">
                      <X className="h-6 w-6 mr-2" />
                      {schemaData.missingTables.length} Missing
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  {schemaData.existingTables.length} tables found
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Foreign Keys</CardTitle>
                <CardDescription>Table relationships</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <div className="flex items-center">
                    {schemaData.foreignKeys.length > 0 ? (
                      <Check className="h-6 w-6 mr-2 text-green-600" />
                    ) : (
                      <X className="h-6 w-6 mr-2 text-red-600" />
                    )}
                    {schemaData.foreignKeys.length}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Foreign key constraints found
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Triggers</CardTitle>
                <CardDescription>Database triggers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <div className="flex items-center">
                    {schemaData.triggers.length > 0 ? (
                      <Check className="h-6 w-6 mr-2 text-green-600" />
                    ) : (
                      <X className="h-6 w-6 mr-2 text-red-600" />
                    )}
                    {schemaData.triggers.length}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  Database triggers found
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="tables" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="tables">Tables</TabsTrigger>
              <TabsTrigger value="columns">Columns</TabsTrigger>
              <TabsTrigger value="relationships">Relationships</TabsTrigger>
              <TabsTrigger value="triggers">Triggers</TabsTrigger>
            </TabsList>

            <TabsContent value="tables">
              <Card>
                <CardHeader>
                  <CardTitle>Database Tables</CardTitle>
                  <CardDescription>
                    Status of required tables for the accounting system
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Row Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {['accounts', 'journals', 'journal_lines', 'journal_audit', 'budgets', 'journal_attachments'].map((table) => (
                        <TableRow key={table}>
                          <TableCell className="font-medium">{table}</TableCell>
                          <TableCell>
                            {schemaData.existingTables.includes(table) ? (
                              <span className="flex items-center text-green-600">
                                <Check className="h-4 w-4 mr-1" /> Present
                              </span>
                            ) : (
                              <span className="flex items-center text-red-600">
                                <X className="h-4 w-4 mr-1" /> Missing
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {schemaData.rowCounts[table] !== undefined 
                              ? schemaData.rowCounts[table] 
                              : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="columns">
              <Card>
                <CardHeader>
                  <CardTitle>Table Columns</CardTitle>
                  <CardDescription>
                    Column definitions for each table
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {Object.entries(schemaData.tableSchemas).map(([tableName, columns]) => (
                      <div key={tableName}>
                        <h3 className="text-lg font-medium mb-2">{tableName}</h3>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Column Name</TableHead>
                              <TableHead>Data Type</TableHead>
                              <TableHead>Nullable</TableHead>
                              <TableHead>Default</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(columns as any[]).map((column) => (
                              <TableRow key={`${tableName}-${column.column_name}`}>
                                <TableCell className="font-medium">{column.column_name}</TableCell>
                                <TableCell>{column.data_type}</TableCell>
                                <TableCell>{column.is_nullable === 'YES' ? 'Yes' : 'No'}</TableCell>
                                <TableCell>{column.column_default || 'None'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="relationships">
              <Card>
                <CardHeader>
                  <CardTitle>Table Relationships</CardTitle>
                  <CardDescription>
                    Foreign key constraints between tables
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Table</TableHead>
                        <TableHead>Column</TableHead>
                        <TableHead>References</TableHead>
                        <TableHead>Reference Column</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schemaData.foreignKeys.length > 0 ? (
                        schemaData.foreignKeys.map((fk: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{fk.table_name}</TableCell>
                            <TableCell>{fk.column_name}</TableCell>
                            <TableCell>{fk.foreign_table_name}</TableCell>
                            <TableCell>{fk.foreign_column_name}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center">
                            No foreign key relationships found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="triggers">
              <Card>
                <CardHeader>
                  <CardTitle>Database Triggers</CardTitle>
                  <CardDescription>
                    Triggers for enforcing business rules
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Trigger Name</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Table</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schemaData.triggers.length > 0 ? (
                        schemaData.triggers.map((trigger: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{trigger.trigger_name}</TableCell>
                            <TableCell>{trigger.event_manipulation}</TableCell>
                            <TableCell>{trigger.event_object_table}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center">
                            No database triggers found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

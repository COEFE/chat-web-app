import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { RunMigrationsButton } from './RunMigrationsButton';

export interface SchemaStatus {
  has_line_number: boolean | null;
  has_journal_number: boolean | null;
  has_journal_type: boolean | null;
  has_transaction_date: boolean | null;
  has_reference_number: boolean | null;
  has_journal_types_table: boolean | null;
}

export default function DatabaseMigration() {
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schemaStatus, setSchemaStatus] = useState<SchemaStatus | null>(null);

  const checkSchema = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/journals/check-schema');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check schema');
      }
      
      setSchemaStatus(data.schema);
    } catch (err: any) {
      setError(err.message || 'An error occurred while checking schema');
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    setMigrating(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await fetch('/api/journals/db-lines-update', {
        method: 'POST',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run migration');
      }
      
      setSuccess('Database migration completed successfully');
      checkSchema(); // Refresh schema status
    } catch (err: any) {
      setError(err.message || 'An error occurred during migration');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Database Schema Migration</CardTitle>
        <CardDescription>
          Fix issues with journal entry database schema
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        
        {success && (
          <Alert className="mb-4 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">Success</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
        
        {schemaStatus && (
          <div className="space-y-2 mb-4">
            <h3 className="text-sm font-medium">Schema Status:</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_line_number ? "default" : "destructive"}>
                  {schemaStatus.has_line_number ? "Present" : "Missing"}
                </Badge>
                <span>Line Number Column</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_journal_number ? "default" : "destructive"}>
                  {schemaStatus.has_journal_number ? "Present" : "Missing"}
                </Badge>
                <span>Journal Number Column</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_journal_type ? "default" : "destructive"}>
                  {schemaStatus.has_journal_type ? "Present" : "Missing"}
                </Badge>
                <span>Journal Type Column</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_transaction_date ? "default" : "destructive"}>
                  {schemaStatus.has_transaction_date ? "Present" : "Missing"}
                </Badge>
                <span>Transaction Date Column</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_reference_number ? "default" : "destructive"}>
                  {schemaStatus.has_reference_number ? "Present" : "Missing"}
                </Badge>
                <span>Reference Number Column</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schemaStatus.has_journal_types_table ? "default" : "destructive"}>
                  {schemaStatus.has_journal_types_table ? "Present" : "Missing"}
                </Badge>
                <span>Journal Types Table</span>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <p className="text-sm">
            This tool helps fix database schema issues, such as the missing <code>line_number</code> column
            in journal lines which may cause errors when creating journal entries.
          </p>
          
          {schemaStatus && schemaStatus.has_line_number === false && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-600">Missing Column Detected</AlertTitle>
              <AlertDescription>
                The <code>line_number</code> column is missing from the journal_lines table.
                This can cause errors when creating journal entries. Click "Run Migration" to fix this issue.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 w-full">
        <div className="flex justify-between w-full">
          <Button onClick={checkSchema} disabled={loading || migrating} variant="outline">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              'Check Schema'
            )}
          </Button>
          {schemaStatus && !schemaStatus.has_line_number && (
            <Button onClick={runMigration} disabled={loading || migrating} variant="default">
              {migrating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Migrating...
                </>
              ) : (
                'Run Migration'
              )}
            </Button>
          )}
        </div>
        
        {/* Database migrations for triggers and constraints */}
        <div className="w-full pt-2 border-t">
          <div className="flex flex-col space-y-2">
            <h4 className="text-sm font-medium">Database Migrations</h4>
            <p className="text-xs text-muted-foreground">Run migrations to fix database trigger conflicts</p>
            <RunMigrationsButton showFixBalanceOption={true} onComplete={checkSchema} />
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

import React, { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAuth } from "firebase/auth";
import { toast } from "@/components/ui/use-toast";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  ArrowDown,
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";
import { parse as csvParse } from "csv-parse/sync";

// Define form schema with validation
const importFormSchema = z.object({
  file: z.instanceof(File, { message: "Please select a CSV file" }),
  dateColumn: z.string().min(1, { message: "Date column is required" }),
  descriptionColumn: z.string().min(1, { message: "Description column is required" }),
  amountColumn: z.string().min(1, { message: "Amount column is required" }),
  typeColumn: z.string().optional(),
  referenceColumn: z.string().optional(),
});

type ImportFormValues = z.infer<typeof importFormSchema>;

interface TransactionImportFormProps {
  bankAccountId: number;
  onClose: () => void;
  onImportComplete: () => void;
}

export default function TransactionImportForm({
  bankAccountId,
  onClose,
  onImportComplete
}: TransactionImportFormProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [importResult, setImportResult] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Initialize form with default values
  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      dateColumn: "",
      descriptionColumn: "",
      amountColumn: "",
      typeColumn: "",
      referenceColumn: "",
    },
  });

  // Handle file selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid file format",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }
    
    setCsvFile(file);
    form.setValue("file", file);
    
    try {
      // Read the file and parse the CSV
      const text = await file.text();
      const records = csvParse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
      
      if (records.length === 0) {
        toast({
          title: "Empty CSV file",
          description: "The CSV file doesn't contain any records",
          variant: "destructive",
        });
        return;
      }
      
      // Get headers from the first record
      const headers = Object.keys(records[0]);
      setCsvHeaders(headers);
      
      // Set preview data (first 5 rows)
      setCsvPreview(records.slice(0, 5));
      
      // Try to auto-detect columns
      autoDetectColumns(headers, records[0]);
    } catch (err) {
      console.error("Error parsing CSV:", err);
      toast({
        title: "Error parsing CSV",
        description: err instanceof Error ? err.message : "Failed to parse CSV file",
        variant: "destructive",
      });
    }
  };

  // Auto-detect columns based on common patterns
  const autoDetectColumns = (headers: string[], firstRow: any) => {
    // Common patterns for date columns
    const datePatterns = ['date', 'posted', 'transaction date', 'trans date'];
    // Common patterns for description columns
    const descPatterns = ['description', 'desc', 'narrative', 'memo', 'details', 'transaction'];
    // Common patterns for amount columns
    const amountPatterns = ['amount', 'sum', 'total', 'value', 'debit', 'credit'];
    // Common patterns for type columns
    const typePatterns = ['type', 'transaction type', 'debit/credit', 'dc'];
    // Common patterns for reference columns
    const refPatterns = ['reference', 'ref', 'check', 'cheque', 'number', 'id'];
    
    // Find best matches for each column type
    const findMatch = (patterns: string[]) => {
      // First try exact match (case-insensitive)
      const exactMatch = headers.find(h => 
        patterns.some(p => h.toLowerCase() === p.toLowerCase())
      );
      if (exactMatch) return exactMatch;
      
      // Then try contains match
      const containsMatch = headers.find(h => 
        patterns.some(p => h.toLowerCase().includes(p.toLowerCase()))
      );
      return containsMatch;
    };
    
    // Set detected values to form
    const dateColumn = findMatch(datePatterns);
    if (dateColumn) form.setValue("dateColumn", dateColumn);
    
    const descColumn = findMatch(descPatterns);
    if (descColumn) form.setValue("descriptionColumn", descColumn);
    
    const amountColumn = findMatch(amountPatterns);
    if (amountColumn) form.setValue("amountColumn", amountColumn);
    
    const typeColumn = findMatch(typePatterns);
    if (typeColumn) form.setValue("typeColumn", typeColumn);
    
    const refColumn = findMatch(refPatterns);
    if (refColumn) form.setValue("referenceColumn", refColumn);
  };

  const onSubmit = async (data: ImportFormValues) => {
    if (!csvFile) {
      toast({
        title: "No file selected",
        description: "Please select a CSV file to import",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    setImportResult(null);
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      // Create mapping object
      const mapping = {
        date: data.dateColumn,
        description: data.descriptionColumn,
        amount: data.amountColumn,
        type: data.typeColumn || null,
        reference: data.referenceColumn || null,
      };
      
      // Create form data
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('mapping', JSON.stringify(mapping));
      
      // Send import request
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/import`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error importing transactions: ${response.status}`);
      }
      
      const result = await response.json();
      setImportResult(result);
      
      toast({
        title: "Import Successful",
        description: `Successfully imported ${result.successCount} of ${result.totalRecords} transactions.`,
      });
      
      // If there are errors, don't close the form
      if (result.errorCount === 0) {
        setTimeout(() => {
          onImportComplete();
        }, 2000);
      }
    } catch (err: any) {
      console.error("Error importing transactions:", err);
      toast({
        title: "Import Error",
        description: err.message || "Failed to import transactions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Import Bank Transactions</CardTitle>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            {/* File Upload Section */}
            <div className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="csv-file">CSV File</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors ${
                    csvFile ? 'border-green-500 bg-green-50' : 'border-muted'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                  />
                  
                  {csvFile ? (
                    <div className="flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="font-medium">{csvFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(csvFile.size / 1024).toFixed(2)} KB • {csvHeaders.length} columns
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCsvFile(null);
                          setCsvHeaders([]);
                          setCsvPreview([]);
                          form.resetField("file");
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                      >
                        Select Different File
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <UploadCloud className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="font-medium">Click to upload CSV file</p>
                        <p className="text-sm text-muted-foreground">
                          or drag and drop your file here
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* CSV Preview */}
              {csvPreview.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">CSV Preview (First 5 rows)</h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const sheet = document.querySelector('[role="dialog"]');
                        if (sheet) {
                          const isOpen = sheet.getAttribute('data-state') === 'open';
                          if (!isOpen) {
                            (sheet as HTMLElement).click();
                          }
                        }
                      }}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      View Full Preview
                    </Button>
                  </div>
                  
                  <div className="border rounded-md overflow-auto max-h-40">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {csvHeaders.map((header) => (
                            <TableHead key={header} className="whitespace-nowrap">
                              {header}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {csvPreview.map((row, i) => (
                          <TableRow key={i}>
                            {csvHeaders.map((header) => (
                              <TableCell key={`${i}-${header}`} className="truncate max-w-[200px]">
                                {row[header]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            
            {/* Column Mapping Section */}
            {csvHeaders.length > 0 && (
              <div className="space-y-4 bg-muted/30 p-4 rounded-lg">
                <h3 className="font-medium">Map CSV Columns</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Map your CSV columns to the required bank transaction fields
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="dateColumn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Column <span className="text-destructive">*</span></FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {csvHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Column containing transaction dates
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="descriptionColumn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description Column <span className="text-destructive">*</span></FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {csvHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Column containing transaction descriptions
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="amountColumn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Column <span className="text-destructive">*</span></FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select column" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {csvHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Column containing transaction amounts
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="typeColumn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transaction Type Column (Optional)</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select column (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none_sign">None (use amount sign)</SelectItem>
                            {csvHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Column that indicates if a transaction is credit or debit (if separate from amount)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="referenceColumn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Reference Column (Optional)</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select column (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {csvHeaders.map((header) => (
                              <SelectItem key={header} value={header}>
                                {header}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Column containing reference numbers (check numbers, transaction IDs, etc.)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}
            
            {/* Import Result Section */}
            {importResult && (
              <div className={`rounded-lg p-4 space-y-3 ${
                importResult.errorCount > 0 
                  ? 'bg-amber-50 border border-amber-200' 
                  : 'bg-green-50 border border-green-200'
              }`}>
                <div className="flex items-start gap-3">
                  {importResult.errorCount > 0 ? (
                    <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  )}
                  <div>
                    <h3 className="font-medium">
                      {importResult.errorCount > 0 
                        ? 'Import Completed with Warnings' 
                        : 'Import Completed Successfully'
                      }
                    </h3>
                    <p className="text-sm mt-1">
                      Successfully imported {importResult.successCount} of {importResult.totalRecords} transactions
                      {importResult.errorCount > 0 && ` (${importResult.errorCount} failed)`}.
                    </p>
                    
                    {importResult.errorCount > 0 && importResult.errors && (
                      <div className="mt-3">
                        <details className="text-sm">
                          <summary className="font-medium cursor-pointer">
                            View Error Details ({importResult.errors.length})
                          </summary>
                          <div className="mt-2 max-h-40 overflow-y-auto">
                            <ul className="list-disc list-inside space-y-1">
                              {importResult.errors.map((error: any, idx: number) => (
                                <li key={idx}>
                                  Row {error.row}: {error.error}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            
            <Button 
              type="submit"
              disabled={isLoading || csvHeaders.length === 0}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import Transactions
            </Button>
          </CardFooter>
        </form>
      </Form>
      
      {/* Full Preview Sheet */}
      <Sheet>
        <SheetContent className="w-4/5 max-w-4xl sm:max-w-none">
          <SheetHeader>
            <SheetTitle>CSV File Preview</SheetTitle>
            <SheetDescription>
              {csvFile?.name} • {csvPreview.length} rows
            </SheetDescription>
          </SheetHeader>
          
          <div className="mt-6 h-[calc(100vh-12rem)] overflow-auto">
            {csvHeaders.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    {csvHeaders.map((header) => (
                      <TableHead key={header} className="whitespace-nowrap">
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvPreview.map((row, i) => (
                    <TableRow key={i}>
                      {csvHeaders.map((header) => (
                        <TableCell key={`${i}-${header}`}>
                          {row[header]}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

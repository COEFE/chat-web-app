"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Upload, FileSpreadsheet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { Progress } from "@/components/ui/progress";
import * as XLSX from 'xlsx';

interface JournalUploadProps {
  onSuccess?: () => void;
}

export default function JournalUpload({ onSuccess }: JournalUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [parseStatus, setParseStatus] = useState<'idle' | 'parsing' | 'mapping' | 'success' | 'error'>('idle');
  const [columnMappings, setColumnMappings] = useState<{
    date?: string;
    memo?: string;
    account?: string;
    debit?: string;
    credit?: string;
    description?: string;
  }>({});
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    // Validate file type
    const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(fileType || '')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV or Excel file",
        variant: "destructive",
      });
      return;
    }
    
    setFile(selectedFile);
    parseFile(selectedFile);
  };

  // Parse file to get headers and preview data
  const parseFile = async (file: File) => {
    setParseStatus('parsing');
    setUploadProgress(0);
    
    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length < 2) {
            throw new Error('File must contain at least a header row and one data row');
          }
          
          // Extract headers and preview data
          const headers = jsonData[0] as string[];
          const previewRows = jsonData.slice(1, 6) as any[];
          
          setHeaders(headers);
          setPreviewData(previewRows);
          
          // Auto-detect column mappings
          const mappings: any = {};
          headers.forEach((header, index) => {
            const lowerHeader = header.toLowerCase();
            
            if (lowerHeader.includes('date')) {
              mappings.date = header;
            } else if (lowerHeader.includes('memo') || lowerHeader.includes('description') || lowerHeader.includes('narration')) {
              mappings.memo = header;
            } else if (lowerHeader.includes('account') || lowerHeader.includes('gl') || lowerHeader.includes('code')) {
              mappings.account = header;
            } else if (lowerHeader.includes('debit') || lowerHeader.includes('dr')) {
              mappings.debit = header;
            } else if (lowerHeader.includes('credit') || lowerHeader.includes('cr')) {
              mappings.credit = header;
            } else if (lowerHeader.includes('note') || lowerHeader.includes('details')) {
              mappings.description = header;
            }
          });
          
          setColumnMappings(mappings);
          setParseStatus('mapping');
          setUploadProgress(50);
        } catch (error) {
          console.error('Error parsing file:', error);
          setParseStatus('error');
          toast({
            title: "Error parsing file",
            description: error instanceof Error ? error.message : "Unknown error occurred",
            variant: "destructive",
          });
        }
      };
      
      reader.onerror = () => {
        setParseStatus('error');
        toast({
          title: "Error reading file",
          description: "Failed to read the uploaded file",
          variant: "destructive",
        });
      };
      
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Error parsing file:', error);
      setParseStatus('error');
      toast({
        title: "Error parsing file",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Update column mapping
  const updateMapping = (field: string, value: string) => {
    setColumnMappings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Process and upload the file
  const processAndUpload = async () => {
    if (!file || parseStatus !== 'mapping') return;
    
    // Validate required mappings
    if (!columnMappings.date || !columnMappings.memo || !columnMappings.account || 
        (!columnMappings.debit && !columnMappings.credit)) {
      toast({
        title: "Missing required mappings",
        description: "Date, Memo, Account, and either Debit or Credit columns are required",
        variant: "destructive",
      });
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(60);
    
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('Authentication required');
      }
      
      // Read the file again to process all rows
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // Convert to JSON with headers
          const jsonData = XLSX.utils.sheet_to_json(worksheet);
          
          setUploadProgress(70);
          
          // Process the data and create journal entries
          const res = await fetch('/api/journals/parse', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              data: jsonData,
              mappings: columnMappings
            })
          });
          
          setUploadProgress(90);
          
          const result = await res.json();
          if (!res.ok) {
            throw new Error(result.error || 'Failed to process file');
          }
          
          setUploadProgress(100);
          setParseStatus('success');
          
          toast({
            title: "File processed successfully",
            description: `Created ${result.journalCount} journal entries from ${result.lineCount} lines`,
          });
          
          if (onSuccess) {
            onSuccess();
          }
        } catch (error) {
          console.error('Error processing file:', error);
          setParseStatus('error');
          toast({
            title: "Error processing file",
            description: error instanceof Error ? error.message : "Unknown error occurred",
            variant: "destructive",
          });
        } finally {
          setIsUploading(false);
        }
      };
      
      reader.onerror = () => {
        setIsUploading(false);
        setParseStatus('error');
        toast({
          title: "Error reading file",
          description: "Failed to read the uploaded file",
          variant: "destructive",
        });
      };
      
      reader.readAsBinaryString(file);
    } catch (error) {
      console.error('Error uploading file:', error);
      setIsUploading(false);
      setParseStatus('error');
      toast({
        title: "Error uploading file",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    }
  };

  // Reset the form
  const resetForm = () => {
    setFile(null);
    setParseStatus('idle');
    setColumnMappings({});
    setPreviewData([]);
    setHeaders([]);
    setUploadProgress(0);
  };

  return (
    <div className="space-y-6">
      {parseStatus === 'idle' && (
        <div className="border-2 border-dashed border-gray-300 rounded-md p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <FileSpreadsheet className="h-12 w-12 text-gray-400" />
            <div className="text-center">
              <h3 className="text-lg font-medium">Upload Transactions</h3>
              <p className="text-sm text-gray-500 mt-1">
                Upload a CSV or Excel file with your transaction data
              </p>
            </div>
            <Label htmlFor="file-upload" className="w-full">
              <div className="flex justify-center">
                <Button variant="outline" className="relative cursor-pointer">
                  <Upload className="h-4 w-4 mr-2" />
                  Select File
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </Button>
              </div>
            </Label>
            <p className="text-xs text-gray-500">
              Supports CSV, XLSX, and XLS files
            </p>
          </div>
        </div>
      )}
      
      {parseStatus === 'parsing' && (
        <div className="border rounded-md p-6">
          <div className="flex flex-col items-center justify-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-center">
              <h3 className="text-lg font-medium">Parsing File</h3>
              <p className="text-sm text-gray-500 mt-1">
                Analyzing your file structure...
              </p>
            </div>
            <Progress value={uploadProgress} className="w-full" />
          </div>
        </div>
      )}
      
      {parseStatus === 'mapping' && (
        <div className="border rounded-md p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium">Column Mapping</h3>
              <p className="text-sm text-gray-500 mt-1">
                Map your file columns to the required fields
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date-column" className="text-sm font-medium">
                  Date <span className="text-red-500">*</span>
                </Label>
                <select
                  id="date-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.date || ''}
                  onChange={(e) => updateMapping('date', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="memo-column" className="text-sm font-medium">
                  Memo <span className="text-red-500">*</span>
                </Label>
                <select
                  id="memo-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.memo || ''}
                  onChange={(e) => updateMapping('memo', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="account-column" className="text-sm font-medium">
                  Account <span className="text-red-500">*</span>
                </Label>
                <select
                  id="account-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.account || ''}
                  onChange={(e) => updateMapping('account', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="debit-column" className="text-sm font-medium">
                  Debit {!columnMappings.credit && <span className="text-red-500">*</span>}
                </Label>
                <select
                  id="debit-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.debit || ''}
                  onChange={(e) => updateMapping('debit', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="credit-column" className="text-sm font-medium">
                  Credit {!columnMappings.debit && <span className="text-red-500">*</span>}
                </Label>
                <select
                  id="credit-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.credit || ''}
                  onChange={(e) => updateMapping('credit', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <Label htmlFor="description-column" className="text-sm font-medium">
                  Description (Optional)
                </Label>
                <select
                  id="description-column"
                  className="w-full rounded-md border border-gray-300 p-2"
                  value={columnMappings.description || ''}
                  onChange={(e) => updateMapping('description', e.target.value)}
                >
                  <option value="">Select column</option>
                  {headers.map((header, index) => (
                    <option key={index} value={header}>
                      {header}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Preview data */}
            <div>
              <h4 className="text-md font-medium mb-2">Data Preview</h4>
              <div className="border rounded-md overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-200">
                    <tr>
                      {headers.map((header, index) => (
                        <th key={index} className="px-4 py-2 text-left text-xs font-medium text-black uppercase tracking-wider">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-black">
                    {previewData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="odd:bg-white even:bg-gray-100">
                        {headers.map((header, colIndex) => (
                          <td key={colIndex} className="px-4 py-2 text-sm">
                            {row[header] !== undefined ? String(row[header]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Showing first {previewData.length} rows of data
              </p>
            </div>
            
            <div className="flex justify-between">
              <Button variant="outline" onClick={resetForm} disabled={isUploading}>
                Cancel
              </Button>
              <Button onClick={processAndUpload} disabled={isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  'Process & Upload'
                )}
              </Button>
            </div>
            
            {isUploading && (
              <Progress value={uploadProgress} className="w-full" />
            )}
          </div>
        </div>
      )}
      
      {parseStatus === 'success' && (
        <div className="border rounded-md p-6 bg-green-50">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="rounded-full bg-green-100 p-3">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-green-800">Upload Successful</h3>
              <p className="text-sm text-green-600 mt-1">
                Your transactions have been processed and imported
              </p>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={resetForm}>
                Upload Another File
              </Button>
              <Button onClick={() => router.push('/dashboard/transactions')}>
                View Transactions
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {parseStatus === 'error' && (
        <div className="border rounded-md p-6 bg-red-50">
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="rounded-full bg-red-100 p-3">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-red-800">Upload Failed</h3>
              <p className="text-sm text-red-600 mt-1">
                There was an error processing your file
              </p>
            </div>
            <Button variant="outline" onClick={resetForm}>
              Try Again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from 'next/navigation';

interface GLCode {
  code: string;
  description: string;
  notes?: string;
}

export default function GLCodeUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCodes, setProcessedCodes] = useState<GLCode[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const fileType = selectedFile.name.split('.').pop()?.toLowerCase();
      if (['csv', 'xlsx', 'xls'].includes(fileType || '')) {
        setFile(selectedFile);
        setProcessedCodes([]);
      } else {
        toast({
          title: "Invalid file type",
          description: "Please upload a CSV or Excel file",
          variant: "destructive",
        });
        e.target.value = '';
      }
    }
  };

  // Process the file to extract GL codes
  const handleProcess = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('You must be logged in');
      }
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/api/gl-codes/csv', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to process file');
      }
      
      const data = await res.json();
      setProcessedCodes(data.glCodes);
      setFieldMapping(data.fieldMapping);
      
      toast({
        title: "File processed successfully",
        description: `Found ${data.validEntries} valid GL codes out of ${data.totalProcessed} entries`,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        router.push('/login');
        return;
      }
      console.error('Error processing file:', error);
      toast({
        title: "Error processing file",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Save the processed GL codes to the database
  const handleSave = async () => {
    if (!processedCodes?.length) return;
    
    setIsLoading(true);
    
    try {
      const token = await user?.getIdToken();
      if (!token) {
        throw new Error('You must be logged in');
      }
      const res = await fetch('/api/gl-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ glCodes: processedCodes }),
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save GL codes');
      }
      
      const data = await res.json();
      
      toast({
        title: "GL codes saved successfully",
        description: `${data.successful} codes added or updated`,
      });
      
      // Reset state
      setFile(null);
      setProcessedCodes([]);
      setFieldMapping({});
      
      // Reset file input
      const fileInput = document.getElementById('gl-code-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (error) {
      console.error('Error saving GL codes:', error);
      toast({
        title: "Error saving GL codes",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>GL Code Upload</CardTitle>
        <CardDescription>
          Upload your chart of accounts to enable the AI to answer questions about GL codes and accounting classifications.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="gl-code-file">Upload Chart of Accounts</Label>
            <Input 
              id="gl-code-file" 
              type="file" 
              accept=".csv,.xlsx,.xls" 
              onChange={handleFileChange}
              disabled={isProcessing || isLoading}
            />
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file containing your GL codes. The file should have columns for code, description, and optionally notes.
            </p>
          </div>

          {file && (
            <div className="text-sm">
              <p>Selected file: <span className="font-medium">{file.name}</span></p>
            </div>
          )}

          {processedCodes?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Processed GL Codes</h3>
                <p className="text-sm text-muted-foreground">{processedCodes?.length} codes found</p>
              </div>
              
              <div className="text-sm mb-2">
                <p>Detected fields:</p>
                <ul className="list-disc list-inside">
                  {Object.entries(fieldMapping).map(([key, value]) => (
                    <li key={key}>{key}: <span className="font-medium">{value}</span></li>
                  ))}
                </ul>
              </div>
              
              <div className="border rounded-md overflow-auto max-h-60">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedCodes?.slice(0, 10).map((code, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">{code.code}</td>
                        <td className="px-4 py-2 text-sm">{code.description}</td>
                        <td className="px-4 py-2 text-sm">{code.notes || '-'}</td>
                      </tr>
                    ))}
                    {processedCodes?.length > 10 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-center text-sm text-gray-500">
                          {processedCodes?.length - 10} more entries not shown
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={() => {
          setFile(null);
          setProcessedCodes([]);
          const fileInput = document.getElementById('gl-code-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        }} disabled={!file || isProcessing || isLoading}>
          Clear
        </Button>
        <div className="space-x-2">
          {file && processedCodes?.length === 0 && (
            <Button onClick={handleProcess} disabled={isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing
                </>
              ) : (
                'Process File'
              )}
            </Button>
          )}
          {processedCodes?.length > 0 && (
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                'Save GL Codes'
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

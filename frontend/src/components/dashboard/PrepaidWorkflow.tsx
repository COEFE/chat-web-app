"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload, FileText, CheckCircle, XCircle, Loader2, Calendar } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from "@/components/ui/use-toast";
import { FileUpload } from '@/components/dashboard/FileUpload';
import { AddDocumentModal } from '@/components/dashboard/AddDocumentModal';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"; // Import Shadcn Table components
import * as XLSX from 'xlsx-js-style';
import { useRouter } from "next/navigation";

// Removed direct Firestore client imports; using /api/prepaid-list endpoint

interface PrepaidWorkflowProps {
  initialDocumentId?: string;
  onClose?: () => void;
  onSaveComplete?: () => void;
}

interface Document {
  id: string;
  url: string;
}

interface ScheduleItem {
  postingDate: string;
  invoiceNumber?: string;
  vendor: string;
  amountPosted: number;
  startDate: string;
  endDate: string;
  monthlyAmount: number;
}

// Breakdown type for monthly depreciation
interface BreakdownItem extends ScheduleItem {
  monthlyBreakdown: number[];
}

const PrepaidWorkflow: React.FC<PrepaidWorkflowProps> = ({
  initialDocumentId,
  onClose,
  onSaveComplete,
}) => {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const [documents, setDocuments] = useState<{ id: string; fileName: string; status: string }[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [scheduleData, setScheduleData] = useState<ScheduleItem[] | null>(null);
  const [scheduleDocId, setScheduleDocId] = useState<string>('');
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  // State for monthly breakdown
  const [breakdownData, setBreakdownData] = useState<BreakdownItem[] | null>(null);
  const [monthLabels, setMonthLabels] = useState<string[] | null>(null);
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false);
  const [isLoadingSave, setIsLoadingSave] = useState(false);
  const [selectedAppendDocId, setSelectedAppendDocId] = useState<string>('');
  const [isAppendModalOpen, setIsAppendModalOpen] = useState(false);
  const [isLoadingAppend, setIsLoadingAppend] = useState(false);
  const [appendError, setAppendError] = useState<string | null>(null);
  const [fiscalStart, setFiscalStart] = useState<number>(0); // 0=Jan
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth());
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());

  // Load previously used schedule ID from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR guard
    const savedId = localStorage.getItem('defaultPrepaidScheduleId');
    if (savedId) {
      console.log('[PrepaidWorkflow] Restored default schedule id', savedId);
      setSelectedAppendDocId(savedId);
    }
  }, []);

  // Fetch existing uploaded documents for this user via secure API
  const fetchDocs = async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/prepaid-list', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch documents');
      setDocuments(data.documents);
    } catch (err) {
      console.error('Error fetching documents:', err);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [user]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setSelectedDocId("");
      setError(null); // Clear previous errors
    }
  };

  const handleSelectExisting = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDocId(e.target.value);
    setError(null);
    if (e.target.value) setFile(null);
  };

  const handleUploadAndProcess = async () => {
    // If an existing document is selected, skip upload
    if (selectedDocId) {
      toast({
        title: "Existing Document Selected",
        description: "Loading previously uploaded document.",
      });
      setCurrentStep(2);
      return;
    }
    if (!file) {
      setError("Please select a file or choose an existing document.");
      return;
    }

    if (!user) {
      setError("Authentication error. Please log in again.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/prepaid-process', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const result = await response.json();
      console.log('[PrepaidWorkflow] API response:', result);

      if (!response.ok) {
        // Show detailed error if provided
        const msg = result.error || result.details || 'Failed to process file.';
        console.error('[PrepaidWorkflow] API error:', msg);
        throw new Error(msg);
      }

      console.log('Processing API response:', result);
      toast({
        title: "Success",
        description: result.message || "File uploaded successfully.",
      });
      setSelectedDocId(result.documentId);
      setCurrentStep(2); // Move to next step on success (placeholder)
    } catch (err) {
      console.error("Error processing file:", err);
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    if (!selectedDocId) {
      setError("No document selected for schedule generation.");
      return;
    }
    if (!user) {
      setError("Authentication error. Please log in.");
      return;
    }
    setIsLoadingSchedule(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      console.log('[PrepaidWorkflow] Token snippet:', token ? `${token.substring(0,8)}...${token.slice(-8)}` : token);
      console.log('[PrepaidWorkflow] Generating schedule for documentId:', selectedDocId); // Log the ID
      const res = await fetch('/api/prepaid-schedule', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: selectedDocId, currentMonth, currentYear }),
      });
      const data = await res.json();
      console.log('[PrepaidWorkflow] Schedule API response:', data);
      if (!res.ok) throw new Error(data.error || 'Failed to generate schedule.');
      setScheduleData(data.schedule);
      setScheduleDocId(data.documentId);

      // Store schedule and docId
      setScheduleData(data.schedule);
      setScheduleDocId(data.documentId);

      /* --------------------------------------------
         Auto-generate monthly breakdown (former Step 3)
      ---------------------------------------------*/
      try {
        // Optionally indicate secondary loading state
        setIsLoadingBreakdown(true);
        const breakdownRes = await fetch('/api/prepaid-schedule/add-monthly', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ documentId: data.documentId, currentMonth, currentYear }),
        });
        const breakdownJson = await breakdownRes.json();
        console.log('[PrepaidWorkflow] Breakdown API response:', breakdownJson);
        if (!breakdownRes.ok) throw new Error(breakdownJson.error || 'Failed to create monthly breakdown');

        const rawSchedule = breakdownJson.schedule;
        // Rotate breakdown according to fiscalStart
        const rotated = rawSchedule.map((item: any) => {
          const mb = item.monthlyBreakdown || Array(12).fill(0);
          const rotatedMB = [...mb.slice(fiscalStart), ...mb.slice(0, fiscalStart)];
          return { ...item, monthlyBreakdown: rotatedMB };
        });
        setBreakdownData(rotated);
        // Generate month labels starting from fiscalStart
        const labels = Array.from({ length: 12 }, (_, i) => new Date(0, (i + fiscalStart) % 12, 1).toLocaleString('default', { month: 'short' }));
        setMonthLabels(labels);

        // Jump directly to breakdown view (Step 3)
        setCurrentStep(3);
      } catch (breakErr: any) {
        console.error('Error generating breakdown automatically:', breakErr);
        setError(breakErr.message || 'Failed to generate monthly breakdown.');
      } finally {
        setIsLoadingBreakdown(false);
      }
    } catch (err) {
      console.error('Error generating schedule:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const handleBreakdown = async () => {
    if (!scheduleData || !user) return;
    setIsLoadingBreakdown(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/prepaid-schedule/add-monthly', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ documentId: scheduleDocId, currentMonth, currentYear }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to augment schedule')
      const rawSchedule = data.schedule;
      // Rotate breakdown according to fiscalStart
      const rotated = rawSchedule.map((item: any) => {
        const mb = item.monthlyBreakdown || Array(12).fill(0);
        const rotatedMB = [...mb.slice(fiscalStart), ...mb.slice(0, fiscalStart)];
        return { ...item, monthlyBreakdown: rotatedMB };
      });
      setBreakdownData(rotated);
      // Generate month labels starting from fiscalStart
      const labels = Array.from({ length: 12 }, (_, i) => new Date(0, (i + fiscalStart) % 12, 1).toLocaleString('default', { month: 'short' }));
      setMonthLabels(labels);
      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message || 'Error augmenting schedule');
    } finally {
      setIsLoadingBreakdown(false);
    }
  };

  const handlePreviousStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleDownloadExcel = () => {
    if (!breakdownData || !monthLabels) return;
    const headers = ['Vendor','Posting Date','Invoice #','Original Cost','Start Date','End Date', 'Monthly Amount', ...monthLabels, 'Remaining Balance','Total'];
    const rows = breakdownData.map(item => {
      const total = item.monthlyBreakdown.reduce((sum,val) => sum+val, 0);
      const remaining = item.amountPosted - total;
      return [item.vendor, item.postingDate, item.invoiceNumber || '', item.amountPosted, item.startDate, item.endDate, item.monthlyAmount ?? (total/(item.monthlyBreakdown.filter(v=>v>0).length||1)), ...item.monthlyBreakdown, remaining, total];
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Monthly Breakdown');
    const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const blob = new Blob([wbout], { type: excelMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'prepaid-breakdown.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveExcel = async () => {
    if (!breakdownData || !monthLabels || !user) return;
    setIsLoadingSave(true);
    setError(null);
    try {
      // generate blob as above
      const headers = ['Vendor','Posting Date','Invoice #','Original Cost','Start Date','End Date', 'Monthly Amount', ...monthLabels, 'Remaining Balance','Total'];
      const rows = breakdownData.map(item => {
        const total = item.monthlyBreakdown.reduce((sum,val) => sum+val, 0);
        const remaining = item.amountPosted - total;
        return [item.vendor, item.postingDate, item.invoiceNumber || '', item.amountPosted, item.startDate, item.endDate, item.monthlyAmount ?? (total/(item.monthlyBreakdown.filter(v=>v>0).length||1)), ...item.monthlyBreakdown, remaining, total];
      });

      // Calculate totals
      const numMonths = monthLabels.length;
      const monthlyTotals = Array(numMonths).fill(0);
      let totalOriginalCost = 0;
      let totalRemaining = 0;
      let grandTotal = 0;

      breakdownData.forEach(item => {
        totalOriginalCost += item.amountPosted;
        const rowTotal = item.monthlyBreakdown.reduce((sum, val) => sum + val, 0);
        grandTotal += rowTotal;
        totalRemaining += (item.amountPosted - rowTotal);
        item.monthlyBreakdown.forEach((monthVal, index) => {
          monthlyTotals[index] += monthVal;
        });
      });

      // Format the total row (ensure correct number of empty strings for non-summed cols)
      const totalRow = [
        'Total', 
        '', // Posting Date
        '', // Invoice #
        totalOriginalCost, 
        '', // Start Date
        '', // End Date
        '', // Monthly Amount
        ...monthlyTotals, 
        totalRemaining, 
        grandTotal
      ];

      // Add the total row to the rows array
      rows.push(totalRow);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Monthly Breakdown');
      const wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
      const excelMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const blob = new Blob([wbout], { type: excelMime });
      const file = new File([blob], `prepaid-breakdown_${Date.now()}.xlsx`, { type: excelMime });
      const formData = new FormData(); formData.append('file', file);
      const token = await user.getIdToken();
      const res = await fetch('/api/prepaid-process', { method:'POST', headers:{ Authorization:`Bearer ${token}` }, body: formData });
      const data = await res.json(); if (!res.ok) throw new Error(data.error||'Save failed');
      // Persist this new schedule as the default for future appends
      if (data.documentId) {
        localStorage.setItem('defaultPrepaidScheduleId', data.documentId);
      }
      toast({ title:'Saved', description:`Excel saved as document ID ${data.documentId}` });

      // Small delay to allow Firestore to potentially sync
      await new Promise(resolve => setTimeout(resolve, 500)); // Add 500ms delay

      // Navigate to dashboard to view saved document
      router.push('/dashboard');
      onSaveComplete?.(); // Call the callback (if needed elsewhere)
    } catch (err: any) {
      console.error(err);
      setError(err.message||'Error saving Excel');
    } finally { setIsLoadingSave(false); }
  };

  const handleAppendSchedule = async () => {
    console.log('[PrepaidWorkflow] handleAppendSchedule called with:', { selectedAppendDocId, breakdownDataLength: breakdownData?.length });
    if (!selectedAppendDocId || !breakdownData || !user) {
      console.warn('[PrepaidWorkflow] Missing params for append');
      return;
    }
    setIsLoadingAppend(true);
    setAppendError(null);
    try {
      const token = await user.getIdToken();
      console.log('[PrepaidWorkflow] Sending append request to API for document:', selectedAppendDocId);
      const res = await fetch('/api/prepaid-schedule/append', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: selectedAppendDocId, breakdownData }),
      });
      console.log('[PrepaidWorkflow] API responded with status:', res.status);
      const data = await res.json();
      console.log('[PrepaidWorkflow] API response JSON:', data);
      if (!res.ok) throw new Error(data.error || 'Failed to append schedule.');
      // API may return newDocId when it creates a new combined schedule
      const finalDocId = data.newDocId || data.documentId;
      if (finalDocId) {
        localStorage.setItem('defaultPrepaidScheduleId', finalDocId);
      }
      toast({ title: 'Appended', description: `Schedule appended to doc ID ${finalDocId}` });
      router.push('/dashboard');
      onSaveComplete?.();
    } catch (err: any) {
      console.error('[PrepaidWorkflow] Error appending schedule:', err);
      setAppendError(err.message || 'Error appending schedule');
    } finally {
      setIsLoadingAppend(false);
    }
  };

  const monthOptions = Array.from({length:12},(_,i)=>({value:i,label:new Date(0,i,1).toLocaleString('default',{month:'long'})}));
  const yearOptions = Array.from({length:6},(_,i)=>today.getFullYear()-2+i); // range currentYear-2 to +3

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Step {currentStep}: {currentStep === 1 ? "Upload Transactions" : currentStep === 2 ? "Review & Generate" : currentStep === 3 ? "Monthly Breakdown" : "Append to Schedule"}
        </CardTitle>
        <CardDescription>
          {currentStep === 1
            ? "Upload your CSV or Excel file containing transaction data."
            : currentStep === 2
              ? "Review the identified prepaid expenses and generate the amortization schedule."
              : currentStep === 3
                ? "View the monthly depreciation breakdown."
                : "Select an existing schedule document to append this breakdown."
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {currentStep === 1 && (
          <div className="grid gap-4">
            {/* Existing Documents Selection */}
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label>Select Existing Document</Label>
              <Button variant="outline" onClick={() => setIsAddModalOpen(true)}>
                {selectedDocId
                  ? documents.find(d => d.id === selectedDocId)?.fileName
                  : "Choose Document"}
              </Button>
              <AddDocumentModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onDocumentSelect={id => {
                  setSelectedDocId(id);
                  setFile(null);
                  setError(null);
                  setIsAddModalOpen(false);
                }}
                excludedDocumentIds={[]}
              />
            </div>
            <p className="text-center text-sm text-gray-500">Or upload a new file</p>
            {/* File Upload */}
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label>Upload New Document</Label>
              <FileUpload
                onUploadComplete={() => {
                  toast({ title: 'Upload Complete', description: 'File uploaded successfully.' });
                  setCurrentStep(2);
                }}
                currentFolderId={null}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-4">
              <Label htmlFor="fiscalStart" className="mr-2">Fiscal Year Start Month</Label>
              <select id="fiscalStart" className="border rounded p-2" value={fiscalStart} onChange={(e)=>setFiscalStart(parseInt(e.target.value))}>
                {monthOptions.map(opt=>(<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
            </div>
            <div className="mt-4">
              <Label htmlFor="currentMonth" className="mr-2">Current Month</Label>
              <select id="currentMonth" className="border rounded p-2" value={currentMonth} onChange={(e)=>setCurrentMonth(parseInt(e.target.value))}>
                {monthOptions.map(opt=>(<option key={opt.value} value={opt.value}>{opt.label}</option>))}
              </select>
              <Label htmlFor="currentYear" className="ml-4 mr-2">Current Year</Label>
              <select id="currentYear" className="border rounded p-2" value={currentYear} onChange={(e)=>setCurrentYear(parseInt(e.target.value))}>
                {yearOptions.map(y=>(<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
          </div>
        )}
        {currentStep === 2 && (
          <div className="space-y-4">
            {!scheduleData && (
              <Button onClick={handleGenerateSchedule} disabled={isLoadingSchedule || !selectedDocId} className="mb-4">
                {isLoadingSchedule ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoadingSchedule ? "Generating..." : "Generate Schedule"}
              </Button>
            )}
            {isLoadingSchedule && !scheduleData && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                <span>Analyzing document and generating schedule...</span>
              </div>
            )}
            {scheduleData && scheduleData.length > 0 && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold mb-2">Generated Prepaid Schedule</h3>
                <Table>
                  <TableCaption>Detailed Prepaid Expense Amortization Schedule</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posting Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount Posted</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead className="text-right">Monthly Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scheduleData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.postingDate}</TableCell>
                        <TableCell>{item.invoiceNumber || ''}</TableCell>
                        <TableCell>{item.vendor}</TableCell>
                        <TableCell className="text-right">${item.amountPosted.toFixed(2)}</TableCell>
                        <TableCell>{item.startDate}</TableCell>
                        <TableCell>{item.endDate}</TableCell>
                        <TableCell className="text-right">${item.monthlyAmount.toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {/* Button to trigger AI-augmented breakdown */}
            {!breakdownData && (
              <Button onClick={handleBreakdown} disabled={isLoadingBreakdown} className="mt-4">
                {isLoadingBreakdown && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isLoadingBreakdown ? 'Augmenting...' : 'Show Monthly Breakdown'}
              </Button>
            )}
            {error && <p className="text-sm text-red-600 mt-2">Error: {error}</p>}
          </div>
        )}
        {currentStep === 3 && breakdownData && monthLabels && (
          <div className="mt-6 overflow-auto">
            <div className="flex space-x-2 mb-4">
              <Button onClick={handleDownloadExcel}>Download Excel</Button>
              <Button variant="outline" onClick={handleSaveExcel} disabled={isLoadingSave}>
                {isLoadingSave && <Loader2 className="animate-spin mr-2 h-4 w-4" />}Save to Documents
              </Button>
            </div>
            <h3 className="text-lg font-semibold mb-2">Monthly Depreciation Breakdown</h3>
            <Table>
              <TableCaption>Depreciation by Month</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Posting Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Original Cost</TableHead>
                  <TableHead className="text-right">Remaining Balance</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-right">Monthly Dep Amount</TableHead>
                  {monthLabels.map((label, i) => (
                    <TableHead key={i}>{label}</TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {breakdownData.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.vendor}</TableCell>
                    <TableCell>{item.postingDate}</TableCell>
                    <TableCell>{item.invoiceNumber || ''}</TableCell>
                    <TableCell className="text-right">${item.amountPosted.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${(item.amountPosted - item.monthlyBreakdown.reduce((sum, val) => sum + val, 0)).toFixed(2)}</TableCell>
                    <TableCell>{item.startDate}</TableCell>
                    <TableCell>{item.endDate}</TableCell>
                    <TableCell className="text-right">${item.monthlyAmount?.toFixed(2) ?? ((item.monthlyBreakdown.reduce((s,v)=>s+v,0)/(item.monthlyBreakdown.filter(v=>v>0).length||1)).toFixed(2))}</TableCell>
                    {item.monthlyBreakdown.map((val, j) => (
                      <TableCell key={j} className="text-right">${val.toFixed(2)}</TableCell>
                    ))}
                    <TableCell className="text-right">
                      ${item.monthlyBreakdown.reduce((sum, val) => sum + val, 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Dynamic totals row */}
                {(() => {
                  const totalOriginalCost = breakdownData.reduce((s, it) => s + it.amountPosted, 0);
                  const totalPerMonth = monthLabels.map((_, idx) => breakdownData.reduce((sum, it) => sum + (it.monthlyBreakdown[idx] || 0), 0));
                  const grandTotal = totalPerMonth.reduce((s, v) => s + v, 0);
                  const totalRemaining = totalOriginalCost - grandTotal;
                  return (
                    <TableRow>
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell colSpan={2} />
                      <TableCell className="text-right font-semibold">${totalOriginalCost.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${totalRemaining.toFixed(2)}</TableCell>
                      <TableCell colSpan={3} />
                      {totalPerMonth.map((val, i) => (
                        <TableCell key={i} className="text-right font-semibold">${val.toFixed(2)}</TableCell>
                      ))}
                      <TableCell className="text-right font-semibold">${grandTotal.toFixed(2)}</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
            {/* Finish & Save button at bottom of step 3 */}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleSaveExcel} disabled={isLoadingSave}>
                {isLoadingSave && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finish & Save
              </Button>
              <Button variant="outline" onClick={() => setCurrentStep(4)}>
                Append to Existing Schedule
              </Button>
            </div>
          </div>
        )}
        {currentStep === 4 && (
          <div className="grid gap-4">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label>Select Schedule Document to Append</Label>
              <Button variant="outline" onClick={() => setIsAppendModalOpen(true)}>
                {selectedAppendDocId
                  ? documents.find(d => d.id === selectedAppendDocId)?.fileName
                  : "Choose Document"}
              </Button>
              <AddDocumentModal
                isOpen={isAppendModalOpen}
                onClose={() => setIsAppendModalOpen(false)}
                onDocumentSelect={id => {
                  setSelectedAppendDocId(id);
                  setAppendError(null);
                  setIsAppendModalOpen(false);
                }}
                excludedDocumentIds={[]}
              />
            </div>
            <Button
              onClick={handleAppendSchedule}
              disabled={!selectedAppendDocId || isLoadingAppend}
              className="mt-4"
            >
              {isLoadingAppend && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLoadingAppend ? "Appending..." : "Append to Schedule"}
            </Button>
            {appendError && <p className="text-sm text-red-600 mt-2">{appendError}</p>}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {currentStep > 1 && (
          <Button variant="outline" onClick={handlePreviousStep} disabled={isLoading || isLoadingSchedule}>
            Previous
          </Button>
        )}
        {currentStep === 1 && (
          <Button onClick={handleUploadAndProcess} disabled={!(file || selectedDocId) || isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Processing..." : selectedDocId ? "Use Existing Document" : "Upload and Analyze"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default PrepaidWorkflow;

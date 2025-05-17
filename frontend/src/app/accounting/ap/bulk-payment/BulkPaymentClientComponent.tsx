'use client';

import React, { useState, useEffect } from 'react';
import { BillWithDetails } from '@/lib/accounting/apQueries'; // Assumes BillWithDetails includes necessary fields like remaining_amount
import { Account } from '@/lib/accounting/accountQueries';

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// For a more advanced date picker, consider using a dedicated Shadcn DatePicker component if available
// import { DatePicker } from "@/components/ui/date-picker";

interface BulkPaymentClientComponentProps {
  bills: BillWithDetails[];
  paymentAccounts: Account[];
}

interface PaymentFormData {
  paymentDate: string;
  selectedAccountId: string; // Store as string for select compatibility, convert to number on submit
  paymentMethod: string;
  referenceNumber: string;
}

interface PaymentResult {
  successes: any[]; // Define more specific types later
  failures: any[];  // Define more specific types later
  error?: string;
  details?: any;
}

export default function BulkPaymentClientComponent({
  bills,
  paymentAccounts,
}: BulkPaymentClientComponentProps) {
  const [selectedBillIds, setSelectedBillIds] = useState<Set<number>>(new Set());
  const [formData, setFormData] = useState<PaymentFormData>({
    paymentDate: new Date().toISOString().split('T')[0], // Default to today
    selectedAccountId: '',
    paymentMethod: '',
    referenceNumber: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PaymentResult | null>(null);

  const handleBillSelectionChange = (billId: number) => {
    setSelectedBillIds(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(billId)) {
        newSelected.delete(billId);
      } else {
        newSelected.add(billId);
      }
      return newSelected;
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  // Specific handler for select if needed, or can use name from generic handleInputChange
  const handleAccountChange = (value: string) => {
    setFormData(prev => ({ ...prev, selectedAccountId: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBillIds.size === 0) {
      alert('Please select at least one bill to pay.');
      return;
    }
    if (!formData.selectedAccountId) {
      alert('Please select a payment account.');
      return;
    }

    setIsLoading(true);
    setResults(null);

    const payload = {
      billIds: Array.from(selectedBillIds),
      paymentDate: formData.paymentDate,
      paymentAccountId: parseInt(formData.selectedAccountId, 10),
      paymentMethod: formData.paymentMethod || undefined,
      referenceNumber: formData.referenceNumber || undefined,
    };

    try {
      const response = await fetch('/api/ap/bulk-pay-bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setResults({ successes: [], failures: [], error: data.error || 'An unknown error occurred.', details: data.details });
      } else {
        setResults(data);
        // Optionally clear selection and form on full success
        if (data.failures.length === 0) {
          setSelectedBillIds(new Set());
          // Consider if form should be reset or kept for next batch
        }
      }
    } catch (error) {
      console.error('Bulk payment submission error:', error);
      setResults({ successes: [], failures: [], error: error instanceof Error ? error.message : 'Network or unexpected error.' });
    }
    setIsLoading(false);
  };
  
  // Calculate total remaining amount for selected bills
  const totalSelectedAmount = bills
    .filter(bill => selectedBillIds.has(bill.id!))
    .reduce((sum, bill) => sum + (Number(bill.total_amount || 0) - Number(bill.amount_paid || 0)), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Bill Selection Table (Placeholder) */}
      <div className="border p-4 rounded-md">
        <h2 className="text-xl font-semibold mb-2">Select Bills to Pay</h2>
        <p className="mb-2 text-sm text-gray-600">Found {bills.length} bills. {selectedBillIds.size} selected.</p>
        <div className="rounded-md border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Select</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Bill #</TableHead>
                <TableHead>Bill Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bills.map(bill => (
                <TableRow key={bill.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedBillIds.has(bill.id!)}
                      onCheckedChange={() => handleBillSelectionChange(bill.id!)}
                      aria-label={`Select bill ${bill.bill_number}`}
                    />
                  </TableCell>
                  <TableCell>{bill.vendor_name || 'N/A'}</TableCell>
                  <TableCell>{bill.bill_number || 'N/A'}</TableCell>
                  <TableCell>{bill.bill_date ? new Date(bill.bill_date).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell>{bill.due_date ? new Date(bill.due_date).toLocaleDateString() : 'N/A'}</TableCell>
                  <TableCell className="text-right">${(Number(bill.total_amount || 0) - Number(bill.amount_paid || 0)).toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {bills.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No bills available for payment.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {selectedBillIds.size > 0 && (
          <p className="mt-4 font-semibold text-lg">Total selected to pay: ${totalSelectedAmount.toFixed(2)}</p>
        )}
      </div>

      {/* Payment Details Form (Placeholder) */}
      <div className="border p-4 rounded-md">
        <h2 className="text-xl font-semibold mb-4">Payment Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="paymentDate">Payment Date</Label>
            <Input type="date" id="paymentDate" name="paymentDate" value={formData.paymentDate} onChange={handleInputChange} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="selectedAccountId">Payment Account</Label>
            <Select value={formData.selectedAccountId} onValueChange={handleAccountChange} name="selectedAccountId" required>
              <SelectTrigger id="selectedAccountId">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {paymentAccounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.id!.toString()}>
                    {acc.name} ({acc.account_type}) - Bal: {acc.balance !== undefined && acc.balance !== null ? Number(acc.balance).toFixed(2) : 'N/A'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method (Optional)</Label>
            <Input type="text" id="paymentMethod" name="paymentMethod" value={formData.paymentMethod} onChange={handleInputChange} placeholder="e.g., Check, ACH" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference # (Optional)</Label>
            <Input type="text" id="referenceNumber" name="referenceNumber" value={formData.referenceNumber} onChange={handleInputChange} placeholder="e.g., Check #123" />
          </div>
        </div>
      </div>

      <Button type="submit" disabled={isLoading || selectedBillIds.size === 0} size="lg">
        {isLoading ? 'Processing...' : `Pay ${selectedBillIds.size} Selected Bill${selectedBillIds.size === 1 ? '' : 's'}`}
      </Button>

      {/* Results Display (Placeholder) */}
      {results && (
        <div className="mt-6 border p-4 rounded-md">
          <h2 className="text-xl font-semibold mb-2">Payment Results</h2>
          {results.error && <p className="text-red-500">Error: {results.error} {results.details ? JSON.stringify(results.details) : ''}</p>}
          {results.successes.length > 0 && (
            <div>
              <h3 className="text-green-600 font-semibold">Successful Payments ({results.successes.length}):</h3>
              <ul>{results.successes.map((s: any) => <li key={s.billId}>Bill ID {s.billId}: {s.message} (Payment ID: {s.paymentId}, Journal ID: {s.journalId})</li>)}</ul>
            </div>
          )}
          {results.failures.length > 0 && (
            <div className="mt-2">
              <h3 className="text-red-600 font-semibold">Failed Payments ({results.failures.length}):</h3>
              <ul>{results.failures.map((f: any) => <li key={f.billId}>Bill ID {f.billId}: {f.message}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}

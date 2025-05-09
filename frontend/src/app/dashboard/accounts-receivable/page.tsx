"use client";

import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AccountsReceivablePage() {
  const router = useRouter();

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Accounts Receivable</h1>
      </div>
      
      <Tabs defaultValue="customers" className="mb-6">
        <TabsList>
          <TabsTrigger value="customers" onClick={() => router.push('/dashboard/accounts-receivable/customers')}>Customers</TabsTrigger>
          <TabsTrigger value="invoices" onClick={() => router.push('/dashboard/accounts-receivable/invoices')}>Invoices</TabsTrigger>
          <TabsTrigger value="aging-report" onClick={() => router.push('/dashboard/accounts-receivable/aging-report')}>Aging Report</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1" onClick={() => router.push('/dashboard/accounts-receivable/customers')}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Customer Management</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Create and manage customer records, addresses, and payment terms.
            </p>
          </div>
        </div>
        
        <div className="col-span-1" onClick={() => router.push('/dashboard/accounts-receivable/invoices')}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">Invoice Management</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Create invoices, track payments, and view invoice history.
            </p>
          </div>
        </div>
        
        <div className="col-span-1" onClick={() => router.push('/dashboard/accounts-receivable/aging-report')}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 hover:shadow-lg transition cursor-pointer">
            <h2 className="text-xl font-semibold mb-2">AR Aging Report</h2>
            <p className="text-gray-600 dark:text-gray-300">
              View aging of accounts receivable by customer and invoice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

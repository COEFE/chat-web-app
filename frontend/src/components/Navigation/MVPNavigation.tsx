import { useFeatureFlags } from '@/lib/featureFlags';
import Link from 'next/link';

export default function MVPNavigation() {
  const features = useFeatureFlags();
  
  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-blue-600">
                {process.env.NEXT_PUBLIC_PRODUCT_TIER === 'mvp' ? 'ExpenseAI' : 'AccountingAI Pro'}
              </h1>
            </div>
            
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {/* Core MVP Features */}
              {features.expenseTracking && (
                <Link href="/expenses" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Expenses
                </Link>
              )}
              
              {features.receiptScanning && (
                <Link href="/dashboard/accounting-assistant" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Scan Receipt
                </Link>
              )}
              
              {features.basicReporting && (
                <Link href="/reports" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Reports
                </Link>
              )}
              
              {/* Advanced Features (Only for Enterprise) */}
              {features.invoicing && (
                <Link href="/invoicing" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Invoicing
                </Link>
              )}
              
              {features.accounting && (
                <Link href="/accounting" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Accounting
                </Link>
              )}
              
              {features.fullAccounting && (
                <Link href="/dashboard" className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm">
                  Dashboard
                </Link>
              )}
            </div>
          </div>
          
          <div className="flex items-center">
            <Link href="/profile" className="text-gray-500 hover:text-gray-700 px-3 py-2 rounded-md text-sm font-medium">
              Profile
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

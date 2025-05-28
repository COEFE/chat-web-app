import { useFeatureFlags } from '@/lib/featureFlags';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ReceiptUploadButton from '@/components/receipts/ReceiptUploadButton';

export default function MVPNavigation() {
  const features = useFeatureFlags();
  
  return (
    <>
      {/* Home link - always visible */}
      <Button asChild variant="ghost">
        <Link href="/">Home</Link>
      </Button>
      
      {/* MVP Mode: Only show Accounting Assistant */}
      {process.env.NEXT_PUBLIC_PRODUCT_TIER === 'mvp' && (
        <>
          <Button asChild variant="ghost">
            <Link href="/dashboard/accounting-assistant">Accounting Assistant</Link>
          </Button>
          {features.aiAssistant && (
            <Button asChild variant="ghost">
              <Link href="/assistant">AI Assistant</Link>
            </Button>
          )}
        </>
      )}
      
      {/* Enterprise/Development Mode: Show all features */}
      {process.env.NEXT_PUBLIC_PRODUCT_TIER !== 'mvp' && (
        <>
          {features.dashboard && (
            <Button asChild variant="ghost">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          )}
          
          {/* Receipt Upload Button - next to dashboard */}
          {features.expenseTracking && <ReceiptUploadButton />}
          
          {/* Receipts link - for tracking uploaded receipts */}
          {features.expenseTracking && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/receipts">Receipts</Link>
            </Button>
          )}
          
          {features.expenseTracking && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/transactions">Transactions</Link>
            </Button>
          )}
          
          {features.basicReporting && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/reports">Financial Reports</Link>
            </Button>
          )}
          
          <Button asChild variant="ghost">
            <Link href="/dashboard/accounting-assistant">Accounting Assistant</Link>
          </Button>
          
          {features.aiAssistant && (
            <Button asChild variant="ghost">
              <Link href="/assistant">AI Assistant</Link>
            </Button>
          )}
          
          {features.fullAccounting && (
            <>
              <Button asChild variant="ghost">
                <Link href="/dashboard/gl-codes">GL Codes</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/gl-transactions">GL Transactions</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/accounts">Accounts</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/financial-dashboard">Financial Dashboard</Link>
              </Button>
            </>
          )}
          
          {features.invoicing && (
            <>
              <Button asChild variant="ghost">
                <Link href="/dashboard/accounts-payable/vendors">Accounts Payable</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/accounts-receivable/invoices">Invoices</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/accounts-receivable/customers">Customers</Link>
              </Button>
            </>
          )}
          
          {features.fullAccounting && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/banking">Banking</Link>
            </Button>
          )}
          
          {features.multiEntity && (
            <Button asChild variant="ghost">
              <Link href="/dashboard/crm">CRM</Link>
            </Button>
          )}
          
          {/* Admin features for development */}
          {process.env.NODE_ENV === 'development' && (
            <>
              <Button asChild variant="ghost">
                <Link href="/dashboard/admin/database">Admin DB</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/admin/agent-tests">Agent Tests</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/admin/audit-logs">Audit Logs</Link>
              </Button>
            </>
          )}
        </>
      )}
    </>
  );
}

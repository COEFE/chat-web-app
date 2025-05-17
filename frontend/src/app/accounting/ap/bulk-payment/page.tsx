import { getBillsWithVendors, BillWithDetails } from '@/lib/accounting/apQueries';
import { getAccounts, Account } from '@/lib/accounting/accountQueries'; // Assuming this exists
import BulkPaymentClientComponent from './BulkPaymentClientComponent';

export const dynamic = 'force-dynamic'; // Ensure data is fetched on each request

async function fetchOpenBills(): Promise<BillWithDetails[]> {
  // TODO: We might need to enhance getBillsWithVendors or add a new function
  // to specifically fetch 'Open' and 'Partially Paid' bills effectively.
  // For now, let's assume it can be called sequentially for different statuses
  // or a new combined status filter is added to it.
  try {
    const openBills = await getBillsWithVendors(100, 'Open', undefined, false); // Fetch up to 100 open bills, no lines
    const partiallyPaidBills = await getBillsWithVendors(100, 'Partially Paid', undefined, false); // Fetch up to 100 partially paid
    return [...openBills, ...partiallyPaidBills];
  } catch (error) {
    console.error('Error fetching open bills for bulk payment:', error);
    return [];
  }
}

async function fetchPaymentAccounts(): Promise<Account[]> {
  // TODO: getAccounts might need filtering for account types suitable for payments (e.g., Bank, Credit Card)
  try {
    const accounts = await getAccounts({ types: ['Bank', 'Credit Card', 'Cash'] }); // Example filter, using 'types' instead of 'accTypes'
    return accounts.filter(acc => !acc.is_deleted && acc.is_active);
  } catch (error) {
    console.error('Error fetching payment accounts:', error);
    return [];
  }
}

export default async function BulkPaymentPage() {
  const bills = await fetchOpenBills();
  const paymentAccounts = await fetchPaymentAccounts();

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Bulk Bill Payments</h1>
      { bills.length > 0 && paymentAccounts.length > 0 ? (
        <BulkPaymentClientComponent bills={bills} paymentAccounts={paymentAccounts} />
      ) : (
        <div className="text-center py-10">
          <p className="text-xl text-gray-700 mb-2">No Data for Bulk Payments</p>
          <p className="text-gray-500">
            Could not load necessary data. This might be because there are no 'Open' or 'Partially Paid' bills,
            or no suitable payment accounts (e.g., Bank, Credit Card) are currently available or active.
          </p>
          {/* Optionally, add links to create bills or manage accounts */}
        </div>
      )}
    </div>
  );
}

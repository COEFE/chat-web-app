import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Search, ArrowUpDown, Check, AlertCircle } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

interface BankTransaction {
  id: number;
  bank_account_id: number;
  transaction_date: string;
  post_date?: string;
  description: string;
  amount: number;
  transaction_type: 'credit' | 'debit';
  status: 'unmatched' | 'matched' | 'reconciled';
  matched_transaction_id?: number;
  match_type?: string;
  reference_number?: string;
  check_number?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface BankTransactionListProps {
  bankAccountId: number;
  limit?: number;
  showFilters?: boolean;
  onSelect?: (transaction: BankTransaction) => void;
}

export default function BankTransactionList({
  bankAccountId,
  limit = 50,
  showFilters = false,
  onSelect
}: BankTransactionListProps) {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
    search: ''
  });

  // Fetch transactions
  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const auth = getAuth();
        const user = auth.currentUser;
        
        if (!user) {
          throw new Error("User not authenticated");
        }
        
        const idToken = await user.getIdToken();
        
        // Build query parameters
        const params = new URLSearchParams({
          page: page.toString(),
          limit: limit.toString()
        });
        
        if (filters.status) params.append('status', filters.status);
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        if (filters.search) params.append('search', filters.search);
        
        const response = await fetch(`/api/bank-accounts/${bankAccountId}/transactions?${params.toString()}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        });
        
        if (!response.ok) {
          throw new Error(`Error fetching transactions: ${response.status}`);
        }
        
        const data = await response.json();
        setTransactions(data.transactions || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.total || 0);
      } catch (err: any) {
        console.error("Failed to fetch transactions:", err);
        setError(err.message || "Failed to load transactions");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchTransactions();
  }, [bankAccountId, page, limit, filters]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1); // Reset to first page when filters change
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // The search is already triggered by the useEffect when filters change
  };

  // Generate status badge based on transaction status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'reconciled':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
            <Check className="mr-1 h-3 w-3" />
            Reconciled
          </span>
        );
      case 'matched':
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
            Matched
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
            Unmatched
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {showFilters && (
        <div className="bg-muted/40 rounded-lg p-4 space-y-4">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search transactions..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-2 md:flex gap-4">
              <div className="w-full md:w-40">
                <Select
                  value={filters.status}
                  onValueChange={(value) => handleFilterChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="unmatched">Unmatched</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                    <SelectItem value="reconciled">Reconciled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="w-full md:w-40">
                <Input
                  type="date"
                  placeholder="Start Date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                />
              </div>
              
              <div className="w-full md:w-40">
                <Input
                  type="date"
                  placeholder="End Date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                />
              </div>
              
              <Button type="submit" className="w-full md:w-auto">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>
          </form>
        </div>
      )}
      
      {isLoading ? (
        <div className="flex justify-center items-center py-10">
          <Loader2 className="h-8 w-8 animate-spin mr-2" />
          <p>Loading transactions...</p>
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive rounded-lg p-4 flex items-start">
          <AlertCircle className="text-destructive mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="text-destructive font-medium">Error loading transactions</h3>
            <p className="text-destructive text-sm">{error}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-muted-foreground mb-2">No transactions found</p>
          <p className="text-sm text-muted-foreground">
            {showFilters 
              ? "Try adjusting your filters to see more results"
              : "Import transactions or add them manually to get started"}
          </p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((transaction) => (
                <TableRow 
                  key={transaction.id}
                  className={onSelect ? "cursor-pointer hover:bg-muted" : ""}
                  onClick={onSelect ? () => onSelect(transaction) : undefined}
                >
                  <TableCell>
                    {format(new Date(transaction.transaction_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {transaction.description}
                  </TableCell>
                  <TableCell>
                    {transaction.reference_number || transaction.check_number || '-'}
                  </TableCell>
                  <TableCell className={`text-right ${transaction.transaction_type === 'debit' ? 'text-destructive' : ''}`}>
                    {transaction.transaction_type === 'credit' ? '+' : '-'}{formatCurrency(transaction.amount)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(transaction.status)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {((page - 1) * limit) + 1}-{Math.min(page * limit, totalCount)} of {totalCount} transactions
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={page === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

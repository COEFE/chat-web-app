import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { 
  Pencil, 
  MoreVertical, 
  Trash2,
  Eye,
  Ban,
  CheckCircle
} from "lucide-react";
import { format } from "date-fns";

interface BankAccount {
  id: number;
  name: string;
  account_number: string;
  institution_name: string;
  gl_account_id: number;
  gl_account_name: string;
  gl_account_code: string;
  is_active: boolean;
  last_reconciled_date: string | null;
  current_balance?: number;
  created_at: string;
}

interface BankAccountListProps {
  accounts: BankAccount[];
  onRefresh: () => void;
  onSelectAccount: (id: number) => void;
}

export default function BankAccountList({ accounts, onRefresh, onSelectAccount }: BankAccountListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank Accounts</CardTitle>
      </CardHeader>
      <CardContent>
        {accounts.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground mb-2">No bank accounts found</p>
            <p className="text-sm text-muted-foreground">
              Add a bank account to start reconciling your transactions
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bank Account</TableHead>
                <TableHead>Account Number</TableHead>
                <TableHead>GL Account</TableHead>
                <TableHead>Last Reconciled</TableHead>
                <TableHead className="text-right">Current Balance</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow 
                  key={account.id}
                  className="cursor-pointer"
                  onClick={() => onSelectAccount(account.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{account.name}</span>
                      <span className="text-sm text-muted-foreground">{account.institution_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Display last 4 digits of account number */}
                    {'•'.repeat(account.account_number.length - 4)}
                    {account.account_number.slice(-4)}
                  </TableCell>
                  <TableCell>
                    {account.gl_account_code} - {account.gl_account_name}
                  </TableCell>
                  <TableCell>
                    {account.last_reconciled_date ? (
                      format(new Date(account.last_reconciled_date), 'MMM d, yyyy')
                    ) : (
                      <span className="text-muted-foreground text-sm">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {account.current_balance !== undefined ? (
                      <span className={account.current_balance < 0 ? 'text-destructive' : ''}>
                        ${Math.abs(account.current_balance).toFixed(2)}
                        {account.current_balance < 0 ? ' CR' : ''}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {account.is_active ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        <CheckCircle className="mr-1 h-3 w-3" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        <Ban className="mr-1 h-3 w-3" />
                        Inactive
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          onSelectAccount(account.id);
                        }}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            // Navigate to edit page or show edit modal
                          }}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit Account
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Show delete confirmation
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Account
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Component to test GL account creation with starting balance
 */
export default function CreateGLAccountWithBalanceButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountDetails, setAccountDetails] = useState({
    code: '',
    name: '',
    accountType: 'expense',
    startingBalance: '0',
    notes: '',
    balanceDate: new Date().toISOString().split('T')[0], // Today's date in YYYY-MM-DD format
    parentId: 'none'
  });
  
  // State for accounts list
  const [accounts, setAccounts] = useState<Array<{
    id: number;
    code: string;
    name: string;
    account_type: string;
    parent_id: number | null;
  }>>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);

  /**
   * Handle input changes
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAccountDetails(prev => ({ ...prev, [name]: value }));
  };

  /**
   * Handle select changes
   */
  const handleSelectChange = (name: string, value: string) => {
    // If changing account type, reset parent ID since parents are filtered by type
    if (name === 'accountType') {
      setAccountDetails(prev => ({ ...prev, [name]: value, parentId: '' }));
    } else {
      setAccountDetails(prev => ({ ...prev, [name]: value }));
    }
  };
  
  /**
   * Fetch accounts for parent dropdown
   */
  const fetchAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      // Get the current user and ID token from Firebase
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setError('No authenticated user found. Please log in again.');
        setIsLoadingAccounts(false);
        return;
      }
      
      // Get the ID token
      const idToken = await user.getIdToken(true);

      // Fetch accounts from API
      const response = await fetch('/api/accounts', {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      const data = await response.json();
      
      if (data.accounts) {
        setAccounts(data.accounts);
      } else if (data.error) {
        console.error('Error fetching accounts:', data.error);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  };
  
  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  /**
   * Create GL account with starting balance
   */
  const createAccount = async () => {
    setIsLoading(true);
    setResult(null);
    setError(null);
    setJournalId(null);
    setAccountId(null);

    try {
      // Get the current user and ID token from Firebase
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setError('No authenticated user found. Please log in again.');
        setIsLoading(false);
        return;
      }
      
      // Get the ID token
      const idToken = await user.getIdToken(true);

      // Prepare the request data - convert parentId to number if it exists
      const requestData = {
        ...accountDetails,
        parentId: accountDetails.parentId && accountDetails.parentId !== 'none' ? parseInt(accountDetails.parentId, 10) : null
      };
      
      // Make the API request with the authorization header
      const response = await fetch('/api/accounts/create-with-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(requestData)
      });
      
      const data = await response.json();

      if (data.success) {
        setResult(data.message);
        if (data.account) {
          setAccountId(data.account.id);
        }
        if (data.journalId) {
          setJournalId(data.journalId);
        }
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create GL account');
      console.error('Error creating GL account:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * View the journal entry created for the starting balance
   */
  const viewJournal = async () => {
    if (!journalId) return;
    
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;
      
      const idToken = await user.getIdToken(true);
      
      // First check if the journal exists
      const response = await fetch(`/api/journals/${journalId}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (response.ok) {
        // Open journal in a new tab
        window.open(`/dashboard/journals/${journalId}`, '_blank');
      } else {
        setError(`Journal entry ${journalId} not found or you don't have access to view it.`);
      }
    } catch (err) {
      console.error('Error opening journal:', err);
      setError('Error opening journal entry. Please try again later.');
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Create GL Account with Starting Balance</CardTitle>
        <CardDescription>
          Test creating a GL account with an initial balance
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Account Code</Label>
              <Input
                id="code"
                name="code"
                placeholder="e.g., 5100"
                value={accountDetails.code}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="e.g., Office Supplies"
                value={accountDetails.name}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="accountType">Account Type</Label>
              <Select
                value={accountDetails.accountType}
                onValueChange={(value) => handleSelectChange('accountType', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">Asset</SelectItem>
                  <SelectItem value="liability">Liability</SelectItem>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startingBalance">Starting Balance</Label>
              <Input
                id="startingBalance"
                name="startingBalance"
                type="number"
                placeholder="e.g., 1000"
                value={accountDetails.startingBalance}
                onChange={handleChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="balanceDate">Balance Date</Label>
              <Input
                id="balanceDate"
                name="balanceDate"
                type="date"
                value={accountDetails.balanceDate}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="parentId">Parent Account</Label>
              <Select
                value={accountDetails.parentId}
                onValueChange={(value) => handleSelectChange('parentId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No parent (top-level account)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (top-level account)</SelectItem>
                  {accounts
                    .filter(account => account.account_type?.toLowerCase() === accountDetails.accountType.toLowerCase())
                    .sort((a, b) => a.code.localeCompare(b.code))
                    .map(account => (
                      <SelectItem key={account.id} value={account.id.toString()}>
                        {account.code} - {account.name}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
              {isLoadingAccounts && <p className="text-xs text-muted-foreground mt-1">Loading accounts...</p>}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Optional notes"
              value={accountDetails.notes}
              onChange={handleChange}
            />
          </div>
          
          <Button 
            onClick={createAccount} 
            disabled={isLoading || !accountDetails.code || !accountDetails.name}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create GL Account with Balance'
            )}
          </Button>

          {result && (
            <Alert className="bg-green-50 border-green-200">
              <AlertTitle>Success</AlertTitle>
              <AlertDescription className="mt-2">
                {result}
                {journalId && (
                  <div className="mt-2">
                    <p className="text-sm mb-2">
                      Journal entry #{journalId} was created for the starting balance.
                    </p>
                    <Button variant="outline" size="sm" onClick={viewJournal}>
                      View Journal Entry #{journalId}
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription className="mt-2">
                {error}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge'; // For displaying status
import { format } from 'date-fns'; // For formatting dates
import { getAuth } from 'firebase/auth';

interface ReconciliationSession {
  id: string;
  bank_account_id: string;
  start_date: string;
  end_date: string;
  bank_statement_balance: number;
  status: 'pending' | 'completed' | 'reopened';
  created_at: string;
  updated_at: string;
}

interface PriorReconciliationsListProps {
  bankAccountId: string;
}

const PriorReconciliationsList: React.FC<PriorReconciliationsListProps> = ({ bankAccountId }) => {
  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliations`, {
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch reconciliation sessions');
      }
      const data = await response.json();
      setSessions(data.sessions || []);
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (bankAccountId) {
      fetchSessions();
    }
  }, [bankAccountId]);

  const handleReopen = async (sessionId: string) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error("User not authenticated");
      }
      
      const idToken = await user.getIdToken();
      
      const response = await fetch(`/api/bank-accounts/${bankAccountId}/reconciliation/${sessionId}/reopen`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to reopen reconciliation session');
      }
      toast.success('Reconciliation session reopened successfully.');
      // Optionally, redirect to the reconciliation page or refresh the list
      fetchSessions(); // Refresh the list to show updated status
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (isLoading) {
    return <p>Loading prior reconciliations...</p>;
  }

  if (error) {
    return <p>Error: {error}</p>;
  }

  if (sessions.length === 0) {
    return <p>No prior reconciliation sessions found for this account.</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prior Reconciliation Sessions</CardTitle>
        <CardDescription>View and manage past reconciliation sessions for this bank account.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>End Date</TableHead>
              <TableHead>Statement Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{format(new Date(session.end_date), 'PPP')}</TableCell>
                <TableCell>${parseFloat(session.bank_statement_balance?.toString() || '0').toFixed(2)}</TableCell>
                <TableCell>
                  <Badge 
                    variant={session.status === 'completed' ? 'default' : session.status === 'reopened' ? 'secondary' : 'outline'}
                  >
                    {session.status}
                  </Badge>
                </TableCell>
                <TableCell>{format(new Date(session.updated_at), 'Pp')}</TableCell>
                <TableCell>
                  {session.status === 'completed' && (
                    <Button onClick={() => handleReopen(session.id)} size="sm">
                      Reopen
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default PriorReconciliationsList;

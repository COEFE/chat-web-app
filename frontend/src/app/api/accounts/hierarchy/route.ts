import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { authenticateRequest } from '@/lib/authenticateRequest';

// GET /api/accounts/hierarchy - Get accounts in hierarchical structure
export async function GET(req: NextRequest) {
  const { userId, error } = await authenticateRequest(req);
  if (error) return error;

  try {
    // First, ensure the accounts table exists
    try {
      const { POST } = await import('../db-setup/route');
      await POST(req);
    } catch (e) {
      console.error('[accounts/hierarchy] db-setup error', e);
      // Continue anyway, as the table might already exist
    }

    // Type definitions for account hierarchy
    type AccountRow = {
      id: number;
      code: string;
      name: string;
      parent_id: number | null;
      notes: string | null;
      is_custom: boolean;
    };

    interface AccountNode extends AccountRow {
      children: AccountNode[];
    }

    // Get all accounts
    const { rows } = await sql<AccountRow>`
      SELECT 
        id, 
        code, 
        name, 
        parent_id, 
        notes,
        is_custom
      FROM accounts 
      ORDER BY code ASC;
    `;

    const accounts = rows as AccountRow[];

    // Build hierarchy
    const accountMap = new Map<number, AccountNode>();
    const rootAccounts: AccountNode[] = [];

    // First pass: create map of all accounts
    accounts.forEach(account => {
      accountMap.set(account.id, {
        ...account,
        children: []
      });
    });

    // Second pass: build hierarchy
    accounts.forEach(account => {
      const accountWithChildren = accountMap.get(account.id)!;
      
      if (account.parent_id === null) {
        // Root account
        rootAccounts.push(accountWithChildren);
      } else {
        // Child account
        const parent = accountMap.get(account.parent_id!)!;
        if (parent) {
          parent.children.push(accountWithChildren);
        } else {
          // Orphaned account (parent doesn't exist)
          rootAccounts.push(accountWithChildren);
        }
      }
    });

    // Function to calculate account balances (placeholder for future implementation)
    // This would typically involve summing journal entries for each account
    const calculateAccountBalances = async () => {
      // This is a placeholder for future implementation
      // In a real system, we would query journal_lines to get actual balances
      return accountMap;
    };

    // Get account balances
    await calculateAccountBalances();

    return NextResponse.json({ 
      accounts: rootAccounts,
      flatAccounts: accounts
    });
  } catch (err: any) {
    console.error('[accounts/hierarchy] Error:', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
